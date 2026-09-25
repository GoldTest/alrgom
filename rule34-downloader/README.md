# Rule34.world 高级下载助手 (Rule34 World Downloader Pro)

专为 [rule34.world](https://rule34.world/) 打造的油猴脚本（Tampermonkey / Violentmonkey 用户脚本）。提供**油猴自动更新**、**面板关闭后后台持续批量下载**、**已跳过内容自动隐藏过滤**、**右侧悬浮多功能工具栏**、**99%满载看门狗自愈防卡死**、**本地任意真实文件夹选择**、网格卡片一键下载、二级详情页下载、实时下载进度与下载状态持久化防重复下载。

---

## 🌟 核心功能面板与特性

### 1. 🔄 油猴自动更新（Auto-Update）
- 脚本头部已配置标准 `@updateURL` 与 `@downloadURL`。
- 安装后，Tampermonkey 将自动检测 GitHub 仓库主分支的版本更新，无需再手动复制代码覆盖升级。
- **一键安装/更新源直链**：
  [`https://raw.githubusercontent.com/GoldTest/alrgom/master/rule34-downloader/rule34-world-downloader.user.js`](https://raw.githubusercontent.com/GoldTest/alrgom/master/rule34-downloader/rule34-world-downloader.user.js)

---

### 2. ⚡ Tag 批量多页下载（极简单列表 + 后台持续运行）
- **面板关闭后后台绝不中断**：点击 `✕`、`关闭面板` 或遮罩层关闭弹窗后，批量下载队列仍会在后台持续静默下载，悬浮球上实时显示下载中数字气泡；再次点击打开面板可随时恢复查看进度。
- **仅展示待下载/进行中/完成明细（已跳过的自动隐藏）**：列表仅呈现真正参与下载的排队、下载中、已完成条目，不被海量已跳过项刷屏。
- **左侧作品信息，右侧实时状态**：
  - **左侧**：`#PostID`（可点击直达原帖） + 媒体标签（`[VIDEO]` / `[IMAGE]`） + 文件名。
  - **右侧**：当前实时下载状态胶囊：`🚀 下载中 45%` / `✅ 已完成` / `⏳ 排队中` / `✕ 失败`。
- **多并发平滑队列**：1~6 线程并发，自动排队下载，避免触发 CDN 限流。

---

### 3. 🛸 右侧多功能悬浮工具条 (Floating Dock)
在页面右下角常驻 3 个模块化悬浮球按钮：
- **📥 下载任务管理器 (Downloads Panel)**：
  - 查看当前正在进行的所有下载任务，显示每个作品的 Post ID、类型、文件名及**实时动态进度条与百分比**。
  - 悬浮球右上角自带正在下载任务数的**呼吸气泡徽标**（如显示 `3`）。
- **⚡ 批量多页下载面板 (Batch Download Panel)**：
  - 独立的 Tag 批量下载控制台与极简单列表。
- **⚙️ 偏好设置面板 (Settings Panel)**：
  - 本地任意真实文件夹绑定（File System Access API）与重置。
  - 分类子目录规则与快捷预设模板（如 `{artist}`, `{copyright}`, `{type}` 等）。
  - 文件名命名模板与画质/编码偏好。

---

### 4. 🛡️ 99% / 100% 满载看门狗自愈（防假死）
- 当字节传输完毕时，启动 2 秒看门狗，若浏览器/扩展未决议 `onload`，主动判定完成并自愈存盘。
- 本地文件系统 `writable.close()` 超时保护与 20 秒全局心跳巡检，彻底杜绝任务卡在 99% 不动。

---

### 5. 📁 原生本地保存文件夹选择（突破浏览器限制）
- 接入现代浏览器 **File System Access API**：点击 **“📁 选择文件夹”**，可直接选择你硬盘上的任意位置（如 `D:\Images\Rule34`）。
- 选定后通过 IndexedDB 持久化记住授权，下载时直接流式保存到本地该专属目录。

---

## 📦 安装与自动更新

### 快速安装（推荐）
1. 确保浏览器已安装 **Tampermonkey（篡改猴）**。
2. 直接点击或在浏览器地址栏打开以下链接安装：
   👉 **[点击安装 / 自动更新 Rule34 World Downloader Pro](https://raw.githubusercontent.com/GoldTest/alrgom/master/rule34-downloader/rule34-world-downloader.user.js)**
3. Tampermonkey 会弹出安装/更新确认界面，点击 **“安装”** 或 **“更新”** 即可。

---

## 📁 项目文件结构

```text
rule34-downloader/
├── rule34-world-downloader.user.js   # 油猴脚本核心源代码 (v1.7.0)
└── README.md                         # 项目使用说明与配置指南
```

---

## 📄 许可证

MIT License
