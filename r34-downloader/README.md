# Rule34Video 快速下载 · 油猴脚本

> 在 rule34video.com 视频列表卡片上注入"快速下载"按钮，点击即自动抓取详情页下载链接并触发浏览器下载。右下角常驻配置面板可选默认画质。

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）
2. 打开脚本文件 `rule34video-downloader.user.js`，复制全部内容 → 油猴"新建脚本"粘贴保存；**或**直接点击 GitHub Raw 链接安装。

## 功能

| 功能 | 说明 |
|------|------|
| 卡片下载按钮 | 鼠标悬停视频卡片时，封面底部出现 **⬇ 快速下载** 按钮 |
| 自动抓取详情页 | 点击后脚本后台 `GM_xmlhttpRequest` 获取详情页 HTML，解析所有下载链接 |
| 画质选择 | 按配置面板的"默认画质"自动选取（最高/最低/第 N 项） |
| 配置面板 | 页面右下角悬浮 ⬇ 图标，点击展开设置，配置持久化 |
| 详情页增强 | 进入 `/videos/` 详情页时，下载链接区域高亮标注 |
| 动态页面兼容 | MutationObserver 监听 AJAX 加载的新卡片，自动注入按钮 |

## 配置项说明

| 选项 | 说明 |
|------|------|
| 最高画质（默认） | 取详情页下载列表第 1 个（通常为最高分辨率） |
| 最低画质 | 取列表最后一个 |
| 第 N 项 | 取列表第 N 个（0-based index，共提供 0~3）|

## 工作原理

```
列表页卡片 hover
  └─ 显示覆盖层按钮
       └─ 点击"⬇ 快速下载"
            └─ GM_xmlhttpRequest(GET 详情页URL)
                 └─ 解析 .content-more-download / .download_links 中的 <a href="*.mp4">
                      └─ 按画质配置选取链接
                           └─ 创建隐藏 <a download> → click() → 浏览器下载
```

## 文件结构

```
r34-downloader/
├── rule34video-downloader.user.js   # 脚本主体
└── README.md                        # 说明文档
```

## 注意事项

- 脚本使用 `GM_xmlhttpRequest` 跨域请求同站详情页，需要 `@connect rule34video.com` 权限（已声明）。
- 下载行为依赖浏览器原生下载，部分视频平台可能有防盗链，若下载失败请尝试直接访问详情页手动下载。
- 脚本不存储、不上传任何用户数据，所有配置保存在本地 `GM_setValue`。
