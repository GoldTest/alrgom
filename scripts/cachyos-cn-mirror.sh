#!/usr/bin/env bash
#
# cachyos-cn-mirror.sh — 为 CachyOS / Arch Linux 配置国内镜像源
#
# 本脚本只负责一件事：让 pacman 下载得动。
# 它不启动安装器、不做分区、不装桌面，安装过程仍由你手动完成。
#
# 针对国内网络环境做了六件事：
#   1. CachyOS 专有仓库：实测国内只有中科大（USTC）在同步，清华/上交/北外均无
#   2. CachyOS 的 Server 路径必须带 repo/ 一层，漏掉直接 404
#   3. IPv6 路由不通时 libcurl 会先试AAAA 然后长时间挂住，这里做探测 + 超时兜底
#   4. pacman 层设 ConnectionTimeout，外层再套 timeout 硬上限，脚本自身不可能卡死
#   5. --live 模式下禁用安装器的镜像重排（update-mirrorlist + cachyos-rate-mirrors）：
#      后者会查询境外服务定位所在地区再全球测速，国内正是在这里挂住并覆盖掉你的源
#   6. 预置 netinstall.yaml：安装器的软件包列表页从 GitHub 取，与 pacman 源无关，
#      不处理的话到 packages 阶段必报"无法获取软件包列表"
#
# 用法：
#   sudo bash cachyos-cn-mirror.sh              # 已装好的系统
#   sudo bash cachyos-cn-mirror.sh --live       # Live ISO 安装环境（额外禁用 Calamares 改源）
#   sudo bash cachyos-cn-mirror.sh --pure-cn    # 只用国内源，不留官方兜底
#   sudo bash cachyos-cn-mirror.sh --no-probe   # 跳过测速，使用内置顺序
#   sudo bash cachyos-cn-mirror.sh --restore    # 回滚到最近一次备份
#
# 备份位置：/etc/pacman.d/backup.<时间戳>/  以及  /etc/pacman.conf.bak
#

set -euo pipefail

# ---------------------------------------------------------------- 配置区 ----

PROBE_TIMEOUT=8          # 单个镜像测速超时（秒）
PACMAN_SYNC_TIMEOUT=90   # 最终 pacman -Sy 的硬超时（秒），保证脚本不会卡死
MAX_PARALLEL=5           # pacman 并行下载线程数

# CachyOS 专有仓库（顺序即兜底顺序，测速后会重排）
CACHYOS_BASES_DEFAULT=(
  "https://mirrors.ustc.edu.cn/cachyos/repo"
  "https://mirror.cachyos.org/repo"
)

# Arch Linux 基础仓库
ARCH_BASES_DEFAULT=(
  "https://mirrors.ustc.edu.cn/archlinux"
  "https://mirrors.tuna.tsinghua.edu.cn/archlinux"
  "https://mirrors.aliyun.com/archlinux"
  "https://geo.mirror.pkgbuild.com"
)

# 纯国内模式下要剔除的境外源
FOREIGN_HINTS="mirror.cachyos.org|pkgbuild.com"

# ------------------------------------------------------------------ 工具 ----

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'
  C_BLU=$'\033[34m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YEL=""; C_BLU=""; C_RST=""
fi

log()  { printf '%s[*]%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%s[+]%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%s[!]%s %s\n' "$C_YEL" "$C_RST" "$*" >&2; }
die()  { printf '%s[x]%s %s\n' "$C_RED" "$C_RST" "$*" >&2; exit 1; }

need_root() {
  [ "$(id -u)" -eq 0 ] || die "需要 root 权限，请用 sudo 运行"
}

# ------------------------------------------------------------ 参数解析 ----

MODE_LIVE=0
MODE_PURE_CN=0
MODE_NO_PROBE=0
MODE_RESTORE=0

for arg in "$@"; do
  case "$arg" in
    --live)     MODE_LIVE=1 ;;
    --pure-cn)  MODE_PURE_CN=1 ;;
    --no-probe) MODE_NO_PROBE=1 ;;
    --restore)  MODE_RESTORE=1 ;;
    -h|--help)  sed -n '2,20p' "$0"; exit 0 ;;
    *)          die "未知参数：$arg（用 --help 查看用法）" ;;
  esac
done

need_root

# -------------------------------------------------------------- 回滚 ----

do_restore() {
  local bk
  bk="$(ls -dt /etc/pacman.d/backup.* 2>/dev/null | head -n1 || true)"
  [ -n "$bk" ] && [ -d "$bk" ] || die "找不到备份目录 /etc/pacman.d/backup.*"

  log "正在从 $bk 回滚 ..."
  cp -a "$bk"/mirrorlist /etc/pacman.d/mirrorlist
  [ -f "$bk/cachyos-mirrorlist" ] && cp -a "$bk/cachyos-mirrorlist" /etc/pacman.d/cachyos-mirrorlist
  [ -f /etc/pacman.conf.bak ] && cp -a /etc/pacman.conf.bak /etc/pacman.conf
  ok "已回滚。IPv6 若曾被本脚本关闭，可用 sysctl 重新开启（见上方输出）。"
}

[ "$MODE_RESTORE" -eq 1 ] && { do_restore; exit 0; }

# -------------------------------------------------------------- 备份 ----

BACKUP_DIR="/etc/pacman.d/backup.$(date +%Y%m%d-%H%M%S)"
log "备份 pacman 配置到 $BACKUP_DIR ..."
mkdir -p "$BACKUP_DIR"
for f in mirrorlist cachyos-mirrorlist cachyos-v3-mirrorlist cachyos-v4-mirrorlist; do
  [ -f "/etc/pacman.d/$f" ] && cp -a "/etc/pacman.d/$f" "$BACKUP_DIR/$f"
done
cp -a /etc/pacman.conf /etc/pacman.conf.bak
ok "备份完成"

# ------------------------------------------------- IPv6 探测与处理 ----

fix_ipv6() {
  log "探测 IPv6 连通性 ..."
  if curl -6 -fsS -o /dev/null --max-time 5 https://mirrors.ustc.edu.cn/ 2>/dev/null; then
    ok "IPv6 可用，保持不变"
    return 0
  fi

  warn "IPv6 不通（国内常见）。pacman 会先尝试 IPv6 再回落，这会额外产生数秒到数十秒空等。"
  warn "本次会话内关闭 IPv6 以避免卡死 ..."

  if sysctl -w net.ipv6.conf.all.disable_ipv6=1 >/dev/null 2>&1 \
     && sysctl -w net.ipv6.conf.default.disable_ipv6=1 >/dev/null 2>&1; then
    ok "IPv6 已在本次会话关闭"
    warn "若重启后又卡，把这行写进 /etc/sysctl.d/99-disable-ipv6.conf 即可永久生效："
    warn "    net.ipv6.conf.all.disable_ipv6 = 1"
    warn "    net.ipv6.conf.default.disable_ipv6 = 1"
  else
    warn "关闭 IPv6 失败（非致命）。已通过 pacman 超时设置兜底，见下方 pacman.conf 修改。"
  fi
}

# ------------------------------------------------------------ 镜像测速 ----

sort_by_speed() {
  # $1 = 探测用相对路径，其余为候选 base
  # 输出：按响应时间升序排列的 base，每行一个；全部失败返回非 0
  local probe_path="$1"; shift
  local tmp; tmp="$(mktemp)" || return 1
  local base t

  for base in "$@"; do
    t="$(curl -4 -fsS -o /dev/null --max-time "$PROBE_TIMEOUT" \
          -w '%{time_total}' "${base%/}/${probe_path}" 2>/dev/null || true)"
    [ -n "$t" ] && printf '%s\t%s\n' "$t" "$base" >> "$tmp"
  done

  local out
  out="$(sort -n "$tmp" | cut -f2 || true)"
  rm -f "$tmp"
  [ -n "$out" ] || return 1
  printf '%s\n' "$out"
}

drop_foreign() {
  local base
  for base in "$@"; do
    printf '%s\n' "$base" | grep -Eq "$FOREIGN_HINTS" && continue
    printf '%s\n' "$base"
  done
}

pick_mirrors() {
  # $1 = 探测路径, $2 = 组名(cachyos|arch), $3 = 接收结果的数组名
  local probe_path="$1" which="$2"
  local -n _result="$3"
  local -a candidates fallback
  local result_str b

  case "$which" in
    cachyos)
      fallback=("${CACHYOS_BASES_DEFAULT[@]}")
      mapfile -t candidates < <(drop_foreign "${CACHYOS_BASES_DEFAULT[@]}")
      ;;
    arch)
      fallback=("${ARCH_BASES_DEFAULT[@]}")
      mapfile -t candidates < <(drop_foreign "${ARCH_BASES_DEFAULT[@]}")
      ;;
    *) die "内部错误：未知镜像组 $which" ;;
  esac

  # 纯国内模式下若把境外源全滤光了，退回完整列表（宁可慢也别没有）
  if [ "${#candidates[@]}" -eq 0 ]; then
    warn "${which} 组在纯国内模式下无候选，回退到完整列表"
    candidates=("${fallback[@]}")
  fi

  if [ "$MODE_NO_PROBE" -eq 1 ]; then
    warn "已跳过测速（--no-probe），使用内置顺序"
    _result=("${candidates[@]}")
    return 0
  fi

  log "测速 ${#candidates[@]} 个 ${which} 镜像（每个 ${PROBE_TIMEOUT}s 超时）..."
  if result_str="$(sort_by_speed "$probe_path" "${candidates[@]}")"; then
    mapfile -t _result <<< "$result_str"
    for b in "${_result[@]}"; do
      printf '    %s\n' "$b" >&2
    done
    ok "最快的排在最前"
  else
    warn "所有镜像探测失败，使用内置顺序"
    _result=("${candidates[@]}")
  fi
}

# ------------------------------------------------- 生成 mirrorlist ----

# 注意：这里用 printf '%s\n' 而不是把内容当格式串，
# 因为格式串里的 \ 会被 printf 当转义符处理。
emit_header() {
  printf '%s\n' "# 由 cachyos-cn-mirror.sh 生成于 $(date '+%F %T')"
  printf '%s\n' "# Server URL 之后 pacman 会自动拼接 /\$repo.db，请勿手动增删层级"
}

write_cachyos_mirrorlist() {
  local file="$1" arch_token="$2"
  [ -f "$file" ] || { warn "跳过 $file（本机不存在该指令集仓库）"; return 0; }

  {
    emit_header
    local base
    for base in "${ORDER_CACHYOS[@]}"; do
      printf 'Server = %s/%s/$repo\n' "$base" "$arch_token"
    done
  } > "$file"
  ok "已写入 $file（$arch_token）"
}

write_arch_mirrorlist() {
  local file="/etc/pacman.d/mirrorlist"
  {
    emit_header
    local base
    for base in "${ORDER_ARCH[@]}"; do
      printf 'Server = %s/$repo/os/$arch\n' "$base"
    done
  } > "$file"
  ok "已写入 $file"
}

# ------------------------------------------------- 修改 pacman.conf ----

set_pacman_opt() {
  local key="$1" val="$2"
  # 删掉已有的（含注释形式），再在 [options] 段首插入
  sed -i -E "/^#?${key}[[:space:]]*=/d" /etc/pacman.conf
  sed -i "/^\[options\]/a ${key} = ${val}" /etc/pacman.conf
}

tune_pacman_conf() {
  log "调整 /etc/pacman.conf ..."

  set_pacman_opt 'ParallelDownloads'      "$MAX_PARALLEL"
  set_pacman_opt 'ConnectionTimeout'      '10'
  set_pacman_opt 'DisableDownloadTimeout' '0'

  ok "ParallelDownloads = $MAX_PARALLEL"
  ok "ConnectionTimeout = 10（连不上一个源 10 秒就换下一个）"
  ok "DisableDownloadTimeout = 0（低速下载保护保持开启）"
}

# --------------------------------------------- 禁用 Calamares 改源 ----

neutralize_installer_mirroring() {
  # 两个入口都要堵：
  #   /etc/calamares/scripts/update-mirrorlist  是安装器在 Summary 阶段调用的入口，
  #     它会 pacman -Sy 装上 rate-mirrors 后执行；置空即可阻止重排。
  #   /bin/cachyos-rate-mirrors                 是真正干活的脚本，它会查询境外服务
  #     定位所在地区再全球测速排名 —— 国内正是在这里长时间挂住。
  # 只堵入口已足够，堵里面那层是双保险，防止别的路径把它调起来。
  local targets=(
    "/etc/calamares/scripts/update-mirrorlist"
    "/bin/cachyos-rate-mirrors"
  )
  local s found=0

  for s in "${targets[@]}"; do
    if [ ! -f "$s" ]; then
      warn "未找到 $s，跳过（新版 ISO 可能已不存在）"
      continue
    fi

    found=1
    [ -f "$s.bak" ] || cp -a "$s" "$s.bak"

    cat > "$s" <<EOF
#!/bin/bash
# 已被 cachyos-cn-mirror.sh 禁用。
# 原因：该脚本会调用 rate-mirrors 查询境外服务定位并重排镜像，国内会长时间挂起，
#       且会把上面配置好的国内源覆盖掉，导致安装时下载失败。
# 原始内容见 $s.bak
exit 0
EOF
    chmod +x "$s"
    ok "已禁用 $s（备份：$s.bak）"
  done

  [ "$found" -eq 1 ] || warn "没有找到任何需要禁用的安装器脚本"
}

# ------------------------------------- 修复 netinstall 软件包列表 ----

fix_netinstall_list() {
  # CachyOS 安装器"netinstall"模块的 netinstall.conf 里写的是：
  #   groupsUrl:
  #    - https://raw.githubusercontent.com/.../netinstall.yaml   ← 国内连不上，白等 30 秒
  #    - file:///etc/calamares/modules/netinstall.yaml            ← 本地文件，但默认不存在
  # 第一个连不上、第二个没文件 -> 安装器报"无法获取软件包列表"。
  # 办法：预先把 yaml 放到本地，再把本地源排到列表第一位。
  local d="/etc/calamares/modules"
  local f="$d/netinstall.yaml"
  local base="https://raw.githubusercontent.com/CachyOS/cachyos-calamares/cachyos-dev/src/modules/netinstall/netinstall.yaml"
  local cand got=0

  if [ -s "$f" ] && [ "$(wc -c < "$f")" -ge 50000 ]; then
    ok "netinstall.yaml 已存在（$(wc -c < "$f") 字节），跳过下载"
  else
    log "预置 netinstall 软件包列表（安装器要联网去 GitHub 取，国内取不到）..."
    # 依次尝试国内可用代理，最后退回直连
    for cand in "https://ghfast.top/$base" "https://gh-proxy.com/$base" "$base"; do
      if curl -fsSL --max-time 90 -o "$f" "$cand" 2>/dev/null \
         && [ -s "$f" ] && [ "$(wc -c < "$f")" -ge 50000 ]; then
        got=1
        ok "已获取软件包列表（$(wc -c < "$f") 字节，$(grep -c '^- ' "$f") 个组）"
        break
      fi
      rm -f "$f"
      warn "获取不完整，换下一个源"
    done
    [ "$got" -eq 1 ] || { warn "所有源都失败，netinstall 仍会走 GitHub（可能仍失败）"; return 0; }
    chmod 644 "$f"
  fi

  # 把 file:// 行提到 groupsUrl 列表首位，避免每次都先空等 GitHub 的 30 秒超时
  [ -f "$d/netinstall.conf" ] || { warn "未找到 netinstall.conf，跳过重排"; return 0; }
  [ -f "$d/netinstall.conf.bak" ] || cp -a "$d/netinstall.conf" "$d/netinstall.conf.bak"

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$d/netinstall.conf" <<'PYEOF' && ok "本地源已排到首位，不再空等 GitHub"
import sys, pathlib
p = pathlib.Path(sys.argv[1])
lines = p.read_text().splitlines()
idx = [i for i, l in enumerate(lines) if 'file:///etc/calamares/modules/netinstall.yaml' in l]
if idx and idx[0] != 1:
    lines.insert(1, lines.pop(idx[0]))
    p.write_text('\n'.join(lines) + '\n')
sys.exit(0)
PYEOF
  else
    warn "无 python3，跳过重排（仍能工作，只是每次多等 30 秒）"
  fi
}

# ------------------------------------------------------------ 验证 ----

verify() {
  log "开始验证 pacman 同步（硬超时 ${PACMAN_SYNC_TIMEOUT}s，脚本不会卡在这里）..."
  if timeout "$PACMAN_SYNC_TIMEOUT" pacman -Sy --noconfirm; then
    ok "仓库同步成功"
    return 0
  fi

  warn "同步失败或超时。当前生效的源如下："
  echo "----- /etc/pacman.d/mirrorlist"
  cat /etc/pacman.d/mirrorlist 2>/dev/null || echo "(不存在)"
  for f in cachyos-mirrorlist cachyos-v3-mirrorlist cachyos-v4-mirrorlist; do
    [ -f "/etc/pacman.d/$f" ] || continue
    echo "----- /etc/pacman.d/$f"
    cat "/etc/pacman.d/$f"
  done

  cat >&2 <<'EOF'

排查顺序：
  1) 逐条 curl 测一下上面的 Server，把不通的那行删掉（内容形如 xxx.db）
  2) 确认 /etc/pacman.conf 里 [cachyos*] 段 Include 的文件名和上面一致
  3) 回滚：sudo bash cachyos-cn-mirror.sh --restore
EOF
  return 1
}

# -------------------------------------------------------------- 主流程 ----

main() {
  log "CachyOS 国内源配置开始（$(date '+%F %T')）"

  fix_ipv6

  ORDER_CACHYOS=()
  ORDER_ARCH=()

  # CachyOS 专有仓库只有 x86_64 系列有内容，用基础仓库做探测样本
  pick_mirrors "x86_64/cachyos/cachyos.db"          cachyos ORDER_CACHYOS
  pick_mirrors "core/os/x86_64/core.db"              arch    ORDER_ARCH

  echo
  log "写入 CachyOS 专有仓库源 ..."
  write_cachyos_mirrorlist "/etc/pacman.d/cachyos-mirrorlist"    '$arch'
  write_cachyos_mirrorlist "/etc/pacman.d/cachyos-v3-mirrorlist" '$arch_v3'
  write_cachyos_mirrorlist "/etc/pacman.d/cachyos-v4-mirrorlist" '$arch_v4'

  echo
  log "写入 Arch 基础仓库源 ..."
  write_arch_mirrorlist

  echo
  tune_pacman_conf

  # 安装器取软件包列表走的是 GitHub，不是 pacman 源，跟上面两件事无关，
  # 所以无论是否 --live 都要处理
  echo
  fix_netinstall_list

  if [ "$MODE_LIVE" -eq 1 ]; then
    echo
    log "Live ISO 模式：禁用安装器的镜像重排 ..."
    neutralize_installer_mirroring
  fi

  echo
  if verify; then
    echo
    ok "全部完成 🎉"
    [ "$MODE_LIVE" -eq 1 ] && cat <<'EOF'

接下来（安装器 Summary 阶段）：
  - 镜像重排已被禁用，你的国内源不会被覆盖
  - 若 Summary 里勾了"使用官方镜像"，请取消
  - 若报 signature from "CachyOS <admin@cachyos.org>" is invalid，
    执行：sudo pacman -Sy base-devel 后再继续
  - 建议先建个 BTRFS 快照再点下一步
EOF
    cat <<'EOF'

装完重启后（源会随系统一起装过去，无需再跑一次）：
  完整升级   sudo pacman -Syyu
  查看包来源 pacman -Si linux-cachyos | head -3
  回滚       sudo bash cachyos-cn-mirror.sh --restore
EOF
  else
    exit 1
  fi
}

main