// ==UserScript==
// @name         Rule34Video 快速下载
// @namespace    https://github.com/GoldTest/alrgom
// @version      1.1.0
// @description  在视频卡片上添加快速下载按钮，下载后持久化标记"已下载"状态。右下角提供配置面板。
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
  const CFG_QUALITY    = 'r34dl_quality';   // 'highest' | 'lowest' | index(0,1,2…)
  const CFG_PANEL      = 'r34dl_panel';     // 面板展开状态
  const CFG_DOWNLOADED = 'r34dl_downloaded'; // JSON 数组，存已下载视频 ID

  function getQuality()  { return GM_getValue(CFG_QUALITY, 'highest'); }
  function getPanelOpen(){ return GM_getValue(CFG_PANEL,   true);      }

  /* ─────────────────────────────────────────
     已下载记录：操作封装
     存储格式：{ "123456": timestamp, … }
  ───────────────────────────────────────── */
  function loadDownloaded() {
    try {
      return JSON.parse(GM_getValue(CFG_DOWNLOADED, '{}'));
    } catch (_) { return {}; }
  }
  function saveDownloaded(map) {
    GM_setValue(CFG_DOWNLOADED, JSON.stringify(map));
  }
  function markDownloaded(videoId) {
    const map = loadDownloaded();
    map[videoId] = Date.now();
    saveDownloaded(map);
    refreshPanelCount(); // 同步面板计数
  }
  function isDownloaded(videoId) {
    return videoId && (videoId in loadDownloaded());
  }
  function clearAllDownloaded() {
    saveDownloaded({});
    refreshPanelCount();
    // 重置当前页已标记按钮
    document.querySelectorAll('.r34dl-btn.r34dl-done').forEach(btn => {
      btn.classList.remove('r34dl-done');
      btn.textContent = btn.dataset.origText;
      btn.title = btn.dataset.origTitle || '';
    });
  }
  function downloadedCount() {
    return Object.keys(loadDownloaded()).length;
  }

  /** 从视频详情页 URL 中提取纯数字 ID */
  function extractVideoId(url) {
    const m = url.match(/\/videos\/(\d+)/);
    return m ? m[1] : null;
  }

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
    /* 已下载时封面左上角角标始终可见 */
    .r34dl-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      background: rgba(22,160,60,.9);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 3px;
      z-index: 11;
      pointer-events: none;
      letter-spacing: .3px;
    }

    /* ── 通用按钮 ── */
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

    /* 快速下载按钮（默认蓝） */
    .r34dl-quick {
      background: rgba(30,120,220,.85);
    }
    .r34dl-quick:hover { background: #1e78dc; }

    /* 已下载状态：绿色，hover 变"重新下载" */
    .r34dl-btn.r34dl-done {
      background: rgba(22,160,60,.85);
    }
    .r34dl-btn.r34dl-done:hover {
      background: rgba(22,140,50,.95);
    }
    /* hover 时把文字切换为"重新下载" ——用 CSS content 实现无 JS 的文字切换 */
    .r34dl-btn.r34dl-done::before { content: attr(data-done-text); }
    .r34dl-btn.r34dl-done:hover::before { content: attr(data-rehover-text); }
    .r34dl-btn.r34dl-done > span { display: none; }

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
      min-width: 230px;
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
    .r34dl-row label { color: #ccc; font-size: 12px; flex-shrink: 0; }
    .r34dl-row select, .r34dl-row input {
      background: #333;
      border: 1px solid #555;
      color: #eee;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 12px;
      cursor: pointer;
    }
    #r34dl-clear-btn {
      background: #7a2020;
      color: #fbb;
      border: none;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
      transition: background .15s;
    }
    #r34dl-clear-btn:hover { background: #a02020; }
    .r34dl-tip {
      font-size: 11px;
      color: #777;
      margin-top: 8px;
      line-height: 1.4;
    }
  `);

  /* ─────────────────────────────────────────
     工具：从详情页 HTML 提取下载链接列表
  ───────────────────────────────────────── */
  function parseDownloadLinks(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const selectors = [
      '.content-more-download a[href]',
      '.download-links a[href]',
      '.download_links a[href]',
      'a.tag_btn[href*=".mp4"]',
      'a[href*=".mp4"][download]',
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

    const seen = new Set();
    links = links.filter(l => {
      if (seen.has(l.href)) return false;
      seen.add(l.href);
      return true;
    });

    return links;
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

  function sanitizeFilename(s) {
    return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  }

  /* ─────────────────────────────────────────
     核心：抓取详情页 → 解析 → 下载 → 标记
  ───────────────────────────────────────── */
  function fetchAndDownload(videoUrl, btn, title, videoId) {
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
        triggerDownload(chosen.href, title ? sanitizeFilename(title) + '.mp4' : '');

        // 标记已下载
        if (videoId) {
          markDownloaded(videoId);
          // 立即将按钮切换为"已下载"状态
          applyDoneState(btn, videoId);
          // 角标（如果还没有则补上）
          const wrap = btn.closest('.r34dl-overlay')?.parentElement;
          if (wrap && !wrap.querySelector('.r34dl-badge')) {
            addBadge(wrap);
          }
        } else {
          btn.classList.remove('loading');
          btn.classList.add('success');
          btn.textContent = '✅ 下载中';
          setTimeout(() => resetBtn(btn), 3000);
        }
      },
      onerror() {
        btn.classList.remove('loading');
        btn.classList.add('error');
        btn.textContent = '❌ 失败';
        setTimeout(() => resetBtn(btn), 2500);
      }
    });
  }

  /** 将按钮切换为"已下载"持久态 */
  function applyDoneState(btn, videoId) {
    btn.classList.remove('loading', 'success', 'error', 'r34dl-quick');
    btn.classList.add('r34dl-done');
    // 用 data 属性控制 CSS ::before 内容，不再依赖 textContent
    btn.dataset.doneText    = '✅ 已下载';
    btn.dataset.rehoverText = '🔁 重新下载';
    btn.textContent = ''; // 文字由 ::before 接管
    btn.dataset.videoId = videoId;

    // 更新 title（显示下载时间）
    const map = loadDownloaded();
    const ts = map[videoId];
    if (ts) {
      const d = new Date(ts);
      btn.title = `已下载于 ${d.toLocaleDateString()} ${d.toLocaleTimeString()}（点击重新下载）`;
    }
  }

  /** 恢复按钮到初始蓝色状态（仅用于出错情况） */
  function resetBtn(btn) {
    btn.classList.remove('loading', 'success', 'error');
    // 若是已下载态，不要重置
    if (!btn.classList.contains('r34dl-done')) {
      btn.textContent = btn.dataset.origText || '⬇ 快速下载';
    }
  }

  /** 在图片容器左上角插入已下载角标 */
  function addBadge(imgWrap) {
    const badge = document.createElement('div');
    badge.className = 'r34dl-badge';
    badge.textContent = '✓ 已下载';
    imgWrap.appendChild(badge);
  }

  /* ─────────────────────────────────────────
     在视频卡片上注入按钮
  ───────────────────────────────────────── */
  function injectCardButtons() {
    const cards = document.querySelectorAll(
      '.thumb-block:not([data-r34dl]), li.pcVideoListItem:not([data-r34dl])'
    );

    cards.forEach(card => {
      card.setAttribute('data-r34dl', '1');

      const linkEl = card.querySelector('a[href*="/videos/"]');
      if (!linkEl) return;
      const videoUrl = linkEl.href;
      const videoId  = extractVideoId(videoUrl);

      const titleEl = card.querySelector('.thumb-block-title a, .title a, a[title]');
      const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '').trim() : '';

      let imgWrap = card.querySelector('a.thumb, .thumb, a[class*="thumb"]');
      if (!imgWrap) imgWrap = card.querySelector('a');
      if (!imgWrap) return;

      if (getComputedStyle(imgWrap).position === 'static') {
        imgWrap.style.position = 'relative';
      }

      const alreadyDone = isDownloaded(videoId);

      // 角标：已下载时始终可见
      if (alreadyDone) {
        addBadge(imgWrap);
      }

      // 覆盖层
      const overlay = document.createElement('div');
      overlay.className = 'r34dl-overlay';

      // 快速下载按钮
      const quickBtn = document.createElement('button');
      quickBtn.className = 'r34dl-btn';
      quickBtn.dataset.origText  = '⬇ 快速下载';
      quickBtn.dataset.origTitle = `按配置画质下载（当前：${getQuality()}）`;

      if (alreadyDone) {
        quickBtn.classList.add('r34dl-done');
        applyDoneState(quickBtn, videoId);
      } else {
        quickBtn.classList.add('r34dl-quick');
        quickBtn.textContent = '⬇ 快速下载';
        quickBtn.title = quickBtn.dataset.origTitle;
      }

      quickBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        // 不管是否已下载，都允许重新下载
        fetchAndDownload(videoUrl, quickBtn, title, videoId);
      });

      overlay.appendChild(quickBtn);
      imgWrap.appendChild(overlay);
    });
  }

  /* ─────────────────────────────────────────
     详情页增强（高亮下载区 + 已下载提示）
  ───────────────────────────────────────── */
  function enhanceDetailPage() {
    if (!/\/videos\/\d+\//.test(location.pathname)) return;

    const videoId = extractVideoId(location.pathname);
    const dlArea  = document.querySelector(
      '.content-more-download, .download-links, .download_links'
    );
    if (!dlArea) return;

    const done = isDownloaded(videoId);
    const borderColor = done ? '#16a03c' : '#d1404a';
    dlArea.style.cssText += `border: 2px solid ${borderColor}; border-radius: 6px; padding: 8px;`;

    const tip = document.createElement('div');
    tip.style.cssText = `font-size:11px;color:${borderColor};margin-bottom:4px;`;
    if (done) {
      const map = loadDownloaded();
      const ts  = map[videoId];
      const d   = ts ? new Date(ts) : null;
      tip.textContent = `✅ R34 Downloader：此视频已下载（${d ? d.toLocaleDateString() + ' ' + d.toLocaleTimeString() : ''}）`;
    } else {
      tip.textContent = '▼ R34 Downloader 脚本已识别到以下下载链接';
    }
    dlArea.insertBefore(tip, dlArea.firstChild);
  }

  /* ─────────────────────────────────────────
     配置面板
  ───────────────────────────────────────── */
  let panelCountEl = null; // 用于动态更新计数

  function refreshPanelCount() {
    if (panelCountEl) {
      panelCountEl.textContent = downloadedCount();
    }
  }

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
      <div class="r34dl-row">
        <label>已下载记录 <b id="r34dl-count">0</b> 条</label>
        <button id="r34dl-clear-btn" title="清空所有已下载标记（不删除本地文件）">清空记录</button>
      </div>
      <div class="r34dl-tip">
        · 悬浮卡片显示 <b>⬇ 快速下载</b>，下载后变绿并加角标。<br>
        · 绿色按钮悬浮变 🔁 可重新下载。<br>
        · 记录仅存于浏览器本地，清空不删文件。
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

    // 初始化
    const isOpen = getPanelOpen();
    body.style.display = isOpen ? 'block' : 'none';

    // 画质选择
    const sel = document.getElementById('r34dl-quality-sel');
    sel.value = getQuality();
    sel.addEventListener('change', () => {
      GM_setValue(CFG_QUALITY, sel.value);
      document.querySelectorAll('.r34dl-quick').forEach(b => {
        b.title = `按配置画质下载（当前：${sel.value}）`;
        b.dataset.origTitle = b.title;
      });
    });

    // 已下载计数
    panelCountEl = document.getElementById('r34dl-count');
    refreshPanelCount();

    // 清空按钮
    document.getElementById('r34dl-clear-btn').addEventListener('click', () => {
      if (confirm(`确定清空全部 ${downloadedCount()} 条已下载记录吗？\n（不会删除本地文件）`)) {
        clearAllDownloaded();
      }
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
