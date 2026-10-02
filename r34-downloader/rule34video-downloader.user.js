// ==UserScript==
// @name         Rule34Video 快速下载
// @namespace    https://github.com/GoldTest/alrgom
// @version      1.0.0
// @description  在视频卡片上添加快速下载按钮，点击后自动抓取详情页下载链接并触发下载。右下角提供配置面板（默认画质选择）。
// @author       GoldTest
// @match        https://rule34video.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      rule34video.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ─────────────────────────────────────────
     配置键 & 默认值
  ───────────────────────────────────────── */
  const CFG_QUALITY = 'r34dl_quality'; // 'highest' | 'lowest' | index(0,1,2…)
  const CFG_PANEL   = 'r34dl_panel';   // 面板展开状态

  function getQuality()  { return GM_getValue(CFG_QUALITY, 'highest'); }
  function getPanelOpen(){ return GM_getValue(CFG_PANEL,   true);      }

  /* ─────────────────────────────────────────
     注入样式
  ───────────────────────────────────────── */
  GM_addStyle(`
    /* ── 卡片覆盖层 ── */
    .r34dl-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 4px 6px;
      background: linear-gradient(transparent, rgba(0,0,0,.75));
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      z-index: 10;
      opacity: 0;
      transition: opacity .2s;
      pointer-events: none;
    }
    .thumb-block:hover .r34dl-overlay,
    .thumb:hover .r34dl-overlay,
    li:hover .r34dl-overlay {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── 单个下载按钮 ── */
    .r34dl-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 7px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      color: #fff;
      background: rgba(209,64,74,.85);
      transition: background .15s, transform .1s;
      white-space: nowrap;
    }
    .r34dl-btn:hover  { background: #d1404a; transform: scale(1.05); }
    .r34dl-btn:active { transform: scale(.97); }
    .r34dl-btn.loading { background: rgba(100,100,100,.8); cursor: wait; }
    .r34dl-btn.success { background: rgba(30,160,30,.85); }
    .r34dl-btn.error   { background: rgba(180,30,30,.85); }

    /* 快速下载按钮（仅一个） */
    .r34dl-quick {
      background: rgba(30,120,220,.85);
    }
    .r34dl-quick:hover { background: #1e78dc; }

    /* ── 配置面板 ── */
    #r34dl-panel {
      position: fixed;
      bottom: 18px;
      right: 18px;
      z-index: 99999;
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #eee;
      user-select: none;
    }
    #r34dl-panel-toggle {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      cursor: pointer;
    }
    #r34dl-panel-icon {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #d1404a;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.5);
      font-size: 18px;
      transition: transform .2s;
    }
    #r34dl-panel-icon:hover { transform: scale(1.1); }
    #r34dl-panel-body {
      background: rgba(25,25,35,.93);
      border: 1px solid #444;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 8px;
      min-width: 220px;
      box-shadow: 0 4px 20px rgba(0,0,0,.6);
    }
    #r34dl-panel-body h3 {
      margin: 0 0 10px;
      font-size: 13px;
      color: #ff6b6b;
      border-bottom: 1px solid #333;
      padding-bottom: 6px;
    }
    .r34dl-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 8px;
    }
    .r34dl-row label { color: #ccc; font-size: 12px; }
    .r34dl-row select, .r34dl-row input {
      background: #333;
      border: 1px solid #555;
      color: #eee;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 12px;
      cursor: pointer;
    }
    .r34dl-tip {
      font-size: 11px;
      color: #777;
      margin-top: 8px;
      line-height: 1.4;
    }
    .r34dl-tip a { color: #aaa; }
  `);

  /* ─────────────────────────────────────────
     工具：从详情页 HTML 中提取下载链接列表
     详情页下载区：<div class="content-more-download"> 或 <div class="download_links">
     每个链接形如: <a href="...mp4" class="...">1080p</a>
  ───────────────────────────────────────── */
  function parseDownloadLinks(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 先尝试已知的下载区选择器
    const selectors = [
      '.content-more-download a[href]',
      '.download-links a[href]',
      '.download_links a[href]',
      'a.tag_btn[href*=".mp4"]',
      'a[href*=".mp4"][download]',
      // 通用 fallback: 所有指向 .mp4/.m3u8 的链接
      'a[href$=".mp4"]',
    ];

    let links = [];
    for (const sel of selectors) {
      const nodes = doc.querySelectorAll(sel);
      if (nodes.length) {
        nodes.forEach(a => {
          const href = a.getAttribute('href');
          const label = (a.textContent || a.getAttribute('download') || '').trim();
          if (href && href.includes('http')) {
            links.push({ href, label: label || 'Download' });
          }
        });
        if (links.length) break;
      }
    }

    // 去重
    const seen = new Set();
    links = links.filter(l => {
      if (seen.has(l.href)) return false;
      seen.add(l.href);
      return true;
    });

    return links; // [{href, label}, …]  按页面顺序（通常高→低画质）
  }

  /* ─────────────────────────────────────────
     选择画质
  ───────────────────────────────────────── */
  function pickLink(links) {
    if (!links.length) return null;
    const q = getQuality();
    if (q === 'highest') return links[0];
    if (q === 'lowest')  return links[links.length - 1];
    const idx = parseInt(q, 10);
    return links[isNaN(idx) ? 0 : Math.min(idx, links.length - 1)];
  }

  /* ─────────────────────────────────────────
     触发浏览器下载
  ───────────────────────────────────────── */
  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => a.remove());
  }

  /* ─────────────────────────────────────────
     核心：抓取详情页 → 解析 → 下载
  ───────────────────────────────────────── */
  function fetchAndDownload(videoUrl, btn, title) {
    btn.classList.add('loading');
    btn.textContent = '⏳';

    GM_xmlhttpRequest({
      method: 'GET',
      url: videoUrl,
      onload(resp) {
        const links = parseDownloadLinks(resp.responseText);
        if (!links.length) {
          btn.classList.remove('loading');
          btn.classList.add('error');
          btn.textContent = '❌ 无链接';
          setTimeout(() => resetBtn(btn), 2500);
          return;
        }
        const chosen = pickLink(links);
        btn.classList.remove('loading');
        btn.classList.add('success');
        btn.textContent = '✅ 下载中';
        triggerDownload(chosen.href, title ? sanitizeFilename(title) + '.mp4' : '');
        setTimeout(() => resetBtn(btn), 3000);
      },
      onerror() {
        btn.classList.remove('loading');
        btn.classList.add('error');
        btn.textContent = '❌ 失败';
        setTimeout(() => resetBtn(btn), 2500);
      }
    });
  }

  function resetBtn(btn) {
    btn.classList.remove('loading', 'success', 'error');
    btn.textContent = btn.dataset.origText || '⬇ 下载';
  }

  function sanitizeFilename(s) {
    return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  }

  /* ─────────────────────────────────────────
     在视频卡片上注入按钮
     站点卡片结构（实际）：
       .thumb-block  > (a.thumb > img) + (div.thumb-block-meta) + …
       li.pcVideoListItem > div.thumb-block > …
  ───────────────────────────────────────── */
  function injectCardButtons() {
    // 命中各种可能的视频卡片容器
    const cards = document.querySelectorAll(
      '.thumb-block:not([data-r34dl]), li.pcVideoListItem:not([data-r34dl])'
    );

    cards.forEach(card => {
      card.setAttribute('data-r34dl', '1');

      // 找视频详情页链接
      const linkEl = card.querySelector('a[href*="/videos/"]');
      if (!linkEl) return;
      const videoUrl = linkEl.href;

      // 找标题
      const titleEl = card.querySelector('.thumb-block-title a, .title a, a[title]');
      const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '').trim() : '';

      // 找合适的图片容器（覆盖层依附在此）
      let imgWrap = card.querySelector('a.thumb, .thumb, a[class*="thumb"]');
      if (!imgWrap) imgWrap = card.querySelector('a');
      if (!imgWrap) return;

      // 保证相对定位
      if (getComputedStyle(imgWrap).position === 'static') {
        imgWrap.style.position = 'relative';
      }

      // 覆盖层
      const overlay = document.createElement('div');
      overlay.className = 'r34dl-overlay';

      // 快速下载按钮（按配置画质）
      const quickBtn = document.createElement('button');
      quickBtn.className = 'r34dl-btn r34dl-quick';
      quickBtn.textContent = '⬇ 快速下载';
      quickBtn.dataset.origText = quickBtn.textContent;
      quickBtn.title = `按配置画质下载（当前：${getQuality()}）`;
      quickBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        fetchAndDownload(videoUrl, quickBtn, title);
      });

      overlay.appendChild(quickBtn);
      imgWrap.appendChild(overlay);
    });
  }

  /* ─────────────────────────────────────────
     在详情页上也可以加强：将下载按钮区高亮提示
     （可选，不干扰用户；本脚本主要功能在列表页）
  ───────────────────────────────────────── */
  function enhanceDetailPage() {
    // 只在 /videos/ 详情页执行
    if (!/\/videos\/\d+\//.test(location.pathname)) return;

    const dlArea = document.querySelector(
      '.content-more-download, .download-links, .download_links'
    );
    if (!dlArea) return;

    dlArea.style.cssText += 'border: 2px solid #d1404a; border-radius: 6px; padding: 8px;';
    const tip = document.createElement('div');
    tip.style.cssText = 'font-size:11px;color:#d1404a;margin-bottom:4px;';
    tip.textContent = '▼ R34 Downloader 脚本已识别到以下下载链接';
    dlArea.insertBefore(tip, dlArea.firstChild);
  }

  /* ─────────────────────────────────────────
     配置面板
  ───────────────────────────────────────── */
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'r34dl-panel';

    const body = document.createElement('div');
    body.id = 'r34dl-panel-body';
    body.innerHTML = `
      <h3>⬇ R34 Downloader 设置</h3>
      <div class="r34dl-row">
        <label>默认画质</label>
        <select id="r34dl-quality-sel">
          <option value="highest">最高画质（默认）</option>
          <option value="lowest">最低画质</option>
          <option value="0">第 1 项</option>
          <option value="1">第 2 项</option>
          <option value="2">第 3 项</option>
          <option value="3">第 4 项</option>
        </select>
      </div>
      <div class="r34dl-tip">
        · 点击视频卡片上的 <b>⬇ 快速下载</b> 按钮触发下载。<br>
        · 脚本会自动抓取详情页选择画质后下载。<br>
        · "第 N 项" = 详情页下载列表第 N 个（通常按画质从高到低排列）。
      </div>
    `;

    const toggle = document.createElement('div');
    toggle.id = 'r34dl-panel-toggle';
    const icon = document.createElement('div');
    icon.id = 'r34dl-panel-icon';
    icon.title = '展开 / 收起 R34 下载设置';
    icon.textContent = '⬇';
    toggle.appendChild(icon);

    panel.appendChild(body);
    panel.appendChild(toggle);
    document.body.appendChild(panel);

    // 初始化状态
    const isOpen = getPanelOpen();
    body.style.display = isOpen ? 'block' : 'none';

    // 恢复画质选择
    const sel = document.getElementById('r34dl-quality-sel');
    sel.value = getQuality();
    sel.addEventListener('change', () => {
      GM_setValue(CFG_QUALITY, sel.value);
      // 更新所有快速按钮 title
      document.querySelectorAll('.r34dl-quick').forEach(b => {
        b.title = `按配置画质下载（当前：${sel.value}）`;
      });
    });

    // 展开/收起
    toggle.addEventListener('click', () => {
      const open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      GM_setValue(CFG_PANEL, open);
    });
  }

  /* ─────────────────────────────────────────
     MutationObserver：监听动态加载的卡片
  ───────────────────────────────────────── */
  function watchDynamic() {
    let timer;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(injectCardButtons, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────
     入口
  ───────────────────────────────────────── */
  function main() {
    buildPanel();
    injectCardButtons();
    enhanceDetailPage();
    watchDynamic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }

})();
