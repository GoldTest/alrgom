# =============================================================================
# CachyOS 国内源 · 应急粘贴版
# =============================================================================
#
# 用法（二选一）：
#   A. 复制整个文件内容，粘贴到 Live ISO 终端直接执行
#   B. 把本文件拷进 Live ISO 后执行：sudo bash cachyos-cn-mirror-emergency.sh
#
# 做四件事：
#   1. 换国内源（CachyOS 三个仓库 + Arch 基础库）
#   2. 堵住安装器重排镜像（update-mirrorlist / cachyos-rate-mirrors）
#   3. 预置 netinstall.yaml，修复 packages 阶段"无法获取软件包列表"
#   4. 验证
# 没有镜像测速、没有 pacman 超时兜底、没有 IPv6 探测，出错请用完整版
#   scripts/cachyos-cn-mirror.sh
#
# 必须的点：要在点击安装器之前跑，跑晚了没意义
# =============================================================================

sudo bash <<'SCRIPT'
set -e
U=https://mirrors.ustc.edu.cn
cd /etc/pacman.d || exit 1
B=/etc/pacman.d/emergency-bak-$(date +%m%d-%H%M%S)
mkdir -p "$B"
cp -a mirrorlist "$B"/ 2>/dev/null || true
cp -a ./*-mirrorlist "$B"/ 2>/dev/null || true

for pair in "cachyos-mirrorlist:\$arch" "cachyos-v3-mirrorlist:\$arch_v3" "cachyos-v4-mirrorlist:\$arch_v4"; do
  f=${pair%%:*}; a=${pair#*:}
  if [ -f "$f" ]; then
    { printf '%s\n' "Server = $U/cachyos/repo/$a/\$repo"
      printf '%s\n' "Server = https://mirror.cachyos.org/repo/$a/\$repo"; } > "$f"
    echo "已写入 $f"
  else
    echo "跳过 $f（不存在）"
  fi
done

{ printf '%s\n' "Server = $U/archlinux/\$repo/os/\$arch"
  printf '%s\n' "Server = https://mirrors.tuna.tsinghua.edu.cn/archlinux/\$repo/os/\$arch"; } > mirrorlist
echo "已写入 mirrorlist"

for s in /etc/calamares/scripts/update-mirrorlist /bin/cachyos-rate-mirrors; do
  if [ -f "$s" ]; then
    sed -i '2,$ s/^/#/' "$s"
    echo "已禁用 $s"
  fi
done

# 修复 packages 阶段"无法获取软件包列表"：安装器从 GitHub 取列表，与 pacman 源无关
D=/etc/calamares/modules
mkdir -p "$D"
GH=https://raw.githubusercontent.com/CachyOS/cachyos-calamares/cachyos-dev/src/modules/netinstall/netinstall.yaml
if [ -s "$D/netinstall.yaml" ] && [ "$(wc -c < "$D/netinstall.yaml")" -ge 50000 ]; then
  echo "软件包列表已存在（$(wc -c < "$D/netinstall.yaml") 字节），跳过下载"
else
  rm -f "$D/netinstall.yaml"
  for P in "https://ghfast.top/$GH" "https://gh-proxy.com/$GH" "$GH"; do
    for i in 1 2; do
      curl -fsSL --max-time 90 -o "$D/netinstall.yaml" "$P" 2>/dev/null
      [ "$(wc -c < "$D/netinstall.yaml" 2>/dev/null || echo 0)" -ge 50000 ] && break
      echo "  下载不完整（$(wc -c < "$D/netinstall.yaml" 2>/dev/null || echo 0) 字节），重试"
      rm -f "$D/netinstall.yaml"
    done
    [ -s "$D/netinstall.yaml" ] && break
  done
fi
# 无论哪条路径都明确汇报结果，不再静默失败
if [ -s "$D/netinstall.yaml" ] && [ "$(wc -c < "$D/netinstall.yaml")" -ge 50000 ]; then
  chmod 644 "$D/netinstall.yaml"
  echo "OK 软件包列表就绪（$(wc -c < "$D/netinstall.yaml") 字节，$(grep -c '^- ' "$D/netinstall.yaml") 个组）"
else
  echo "!! 软件包列表缺失或被截断，packages 阶段仍会报错"
  echo "!! 手动重试：sudo curl -fsSL --max-time 90 -o $D/netinstall.yaml https://ghfast.top/$GH"
fi
if [ -f "$D/netinstall.conf" ]; then
  [ -f "$D/netinstall.conf.bak" ] || cp -a "$D/netinstall.conf" "$D/netinstall.conf.bak"
  python3 - "$D/netinstall.conf" <<'PY' 2>/dev/null && echo "本地列表源已排首位"
import sys, pathlib
p = pathlib.Path(sys.argv[1]); lines = p.read_text().splitlines()
idx = [i for i, l in enumerate(lines) if 'file:///etc/calamares/modules/netinstall.yaml' in l]
if idx and idx[0] != 1:
    lines.insert(1, lines.pop(idx[0])); p.write_text('\n'.join(lines) + '\n')
PY
fi

echo "--- 验证 ---"
if timeout 90 pacman -Sy --noconfirm; then
  echo "OK 同步成功，可以开始安装了"
else
  echo "!! 同步失败，先别装，检查上面的源"
fi
echo "回滚: cp -a $B/* /etc/pacman.d/ 2>/dev/null"
SCRIPT