# Lumina New Tab — 浏览器插件

> 一个沉浸式、精美的 Chrome/Edge 新标签页替换插件。

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🕐 实时时钟 | 大字时钟 + 日期 + 智能问候语（根据时段变化） |
| 🌌 粒子星空背景 | Canvas 动态粒子 + 三色极光光晕，呼吸感十足 |
| 🔍 多引擎搜索 | 支持 Google / Bing / 百度 / DuckDuckGo，记忆上次选择 |
| 🌐 快捷方式网格 | 玻璃拟态卡片，自动获取网站图标，支持增删 |
| ⌨️ 任意键唤醒搜索 | 在页面任意位置打字即直接进入搜索框 |
| 💾 本地持久化 | 快捷方式数据保存在 localStorage，无需登录 |

---

## 🚀 安装方法

### Chrome / Edge

1. 打开浏览器，地址栏输入：
   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`
2. 右上角开启 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择本目录（`newtab-extension/`）
5. 新建一个标签页，即可看到 Lumina！

---

## 📂 目录结构

```
newtab-extension/
├── manifest.json        # Chrome MV3 清单文件
├── newtab.html          # 新标签页主页面
├── newtab.css           # 样式（玻璃拟态 + 动效）
├── newtab.js            # 交互逻辑（时钟、搜索、快捷方式）
├── icons/
│   ├── icon16.svg
│   ├── icon48.svg
│   └── icon128.svg
└── README.md
```

---

## 🎨 设计语言

- **Glassmorphism**：背景模糊 + 半透明边框 + 深色基底
- **Aurora Gradient**：三个浮动光晕模拟极光效果
- **Particle Stars**：Canvas 绘制的微粒星空，带闪烁动画
- **Micro-interactions**：卡片悬浮上浮、搜索框焦点光环、按钮弹性缩放

---

## 🛠️ 自定义

### 修改默认快捷方式
在 `newtab.js` 顶部的 `DEFAULT_SHORTCUTS` 数组中修改：
```js
const DEFAULT_SHORTCUTS = [
  { id: 1, name: '网站名', url: 'https://example.com' },
  // ...
];
```

### 修改背景色调
在 `newtab.css` 中调整 `.orb-1 / .orb-2 / .orb-3` 的渐变色，例如改为暖色调。

### 更换主题色
修改 `newtab.css` 中的 CSS 变量：
```css
:root {
  --accent: #7c6fef;   /* 主紫色 */
  --accent2: #43c6d5;  /* 辅青色 */
}
```
