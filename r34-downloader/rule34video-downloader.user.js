// ==UserScript==
// @name         Rule34Video 快速下载
// @namespace    https://github.com/GoldTest/alrgom
// @version      1.3.0
// @description  在视频卡片上固定显示下载按钮，下载后持久化标记"已下载"。右下角配置面板。
// @author       GoldTest
// @match        https://rule34video.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      rule34video.com
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ─────────────────────────────────────────
     配置
  ───────────────────────────────────────── */
  const CFG_QUALITY    = 'r34dl_quality';
  const CFG_PANEL      = 'r34dl_panel';
  const CFG_DOWNLOADED = 'r34dl_downloaded';

  function getQuality()   { return GM_getValue(CFG_QUALITY, 'highest'); }
  function getPanelOpen() { return GM_getValue(CFG_PANEL, true); }

  /* ─────────────────────────────────────────
     已下载记录
  ───────────────────────────────────────── */
  function loadDownloaded() {
    try { return JSON.parse(GM_getValue(CFG_DOWNLOADED, '{}')); } catch (_) { return {}; }
  }
  function saveDownloaded(map) { GM_setValue(CFG_DOWNLOADED, JSON.stringify(map)); }
  function markDownloaded(id) {
    const map = loadDownloaded();
    map[id] = Date.now();
    saveDownloaded(map);
    refreshPanelCount();
  }
  function isDownloaded(id) { return id && (id in loadDownloaded()); }
  function clearAllDownloaded() {
    saveDownloaded({});
    refreshPanelCount();
    // 重置页面上所有已标记的按钮
    document.querySelectorAll('.r34dl-btn.r34dl-done').forEach(btn => {
      btn.classList.remove('r34dl-done');
      btn.classList.add('r34dl-quick');
      btn.textContent = '⬇ 下载';
    });
    document.querySelectorAll('.r34dl-badge').forEach(b => b.remove());
  }
  function downloadedCount() { return Object.keys(loadDownloaded()).length; }

  /** 从 /video/{id}/ 或 /video/{id}/slug/ 中提取纯数字 ID */
  function extractVideoId(url) {
    const m = String(url).match(/\/video\/(\d+)/);
    return m ? m[1] : null;
  }

  /* ─────────────────────────────────────────
     样式
  ───────────────────────────────────────── */
  function injectStyles() {
    GM_addStyle(`
      /* ── 按钮容器：固定在封面左下角 ── */
      .r34dl-wrap {
        position: absolute !important;
        bottom: 4px !important;
        left: 4px !important;
        z-index: 9999 !important;
        display: flex !important;
        gap: 3px !important;
        pointer-events: auto !important;
      }

      /* ── 按钮基础 ── */
      .r34dl-btn {
        display: inline-flex !important;
        align-items: center !important;
        padding: 3px 7px !important;
        border-radius: 4px !important;
        border: none !important;
        cursor: pointer !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        font-family: Arial, sans-serif !important;
        line-height: 1.3 !important;
        color: #fff !important;
        white-space: nowrap !important;
        text-shadow: none !important;
        box-shadow: 0 1px 4px rgba(0,0,0,.6) !important;
        transition: opacity .15s, transform .1s !important;
        opacity: .92 !important;
      }
      .r34dl-btn:hover  { opacity: 1 !important; transform: scale(1.05) !important; }
      .r34dl-btn:active { transform: scale(.97) !important; }

      /* 蓝色 = 可下载 */
      .r34dl-btn.r34dl-quick {
        background: rgba(24,112,210,.9) !important;
      }
      .r34dl-btn.r34dl-quick:hover { background: #1870d2 !important; }

      /* 加载中 */
      .r34dl-btn.loading {
        background: rgba(90,90,90,.85) !important;
        cursor: wait !important;
      }

      /* 已下载：绿色；hover 变"重新下载" */
      .r34dl-btn.r34dl-done {
        background: rgba(22,155,58,.9) !important;
      }
      .r34dl-btn.r34dl-done:hover { background: rgba(16,130,45,.95) !important; }
      .r34dl-btn.r34dl-done::before { content: attr(data-done-label) !important; }
      .r34dl-btn.r34dl-done:hover::before { content: '🔁 重新下载' !important; }

      /* 失败 */
      .r34dl-btn.dl-err { background: rgba(175,30,30,.9) !important; }

      /* ── 角标（左上角，常驻可见）── */
      .r34dl-badge {
        position: absolute !important;
        top: 4px !important;
        left: 4px !important;
        background: rgba(22,155,58,.92) !important;
        color: #fff !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        font-family: Arial, sans-serif !important;
        padding: 2px 5px !important;
        border-radius: 3px !important;
        z-index: 10000 !important;
        pointer-events: none !important;
        line-height: 1.4 !important;
        letter-spacing: .3px !important;
      }

      /* 已下载时角标让位，按钮放右下 */
      .r34dl-badge ~ .r34dl-wrap {
        bottom: 4px !important;
        left: 4px !important;
      }

      /* ── 配置面板 ── */
      #r34dl-panel {
        position: fixed !important;
        bottom: 18px !important;
        right: 18px !important;
        z-index: 2147483647 !important;
        font-family: Arial, sans-serif !important;
        font-size: 13px !important;
        color: #eee !important;
        user-select: none !important;
      }
      #r34dl-panel-toggle {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        cursor: pointer;
      }
      #r34dl-panel-icon {
        width: 38px; height: 38px; border-radius: 50%;
        background: #d1404a; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,.5); font-size: 18px; transition: transform .2s;
      }
      #r34dl-panel-icon:hover { transform: scale(1.1); }
      #r34dl-panel-body {
        background: rgba(20,20,30,.95); border: 1px solid #444; border-radius: 10px;
        padding: 14px 16px; margin-bottom: 8px; min-width: 240px;
        box-shadow: 0 4px 20px rgba(0,0,0,.7);
      }
      #r34dl-panel-body h3 {
        margin: 0 0 10px; font-size: 13px; color: #ff6b6b;
        border-bottom: 1px solid #333; padding-bottom: 6px;
      }
      .r34dl-row {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 8px; gap: 8px;
      }
      .r34dl-row label { color: #ccc; font-size: 12px; flex-shrink: 0; }
      .r34dl-row select {
        background: #333; border: 1px solid #555; color: #eee;
        border-radius: 4px; padding: 3px 6px; font-size: 12px; cursor: pointer;
      }
      #r34dl-clear-btn {
        background: #7a2020; color: #fbb; border: none;
        border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer;
      }
      #r34dl-clear-btn:hover { background: #a02020; }
      .r34dl-tip {
        font-size: 11px; color: #777; margin-top: 8px; line-height: 1.5;
      }
    `);
  }

  /* ─────────────────────────────────────────
     解析详情页下载链接
  ───────────────────────────────────────── */
  function parseDownloadLinks(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sels = [
      '.content-more-download a[href]',
      '.download-links a[href]',
      '.download_links a[href]',
      'a.tag_btn[href*=".mp4"]',
      'a[href*=".mp4"][download]',
      'a[href$=".mp4"]',
    ];
    let links = [];
    for (const sel of sels) {
      doc.querySelectorAll(sel).forEach(a => {
        const href = a.getAttribute('href');
        if (href && href.includes('http')) {
          links.push({ href, label: (a.textContent || '').trim() || 'Download' });
        }
      });
      if (links.length) break;
    }
    const seen = new Set();
    return links.filter(l => { if (seen.has(l.href)) return false; seen.add(l.href); return true; });
  }

  function pickLink(links) {
    if (!links.length) return null;
    const q = getQuality();
    if (q === 'highest') return links[0];
    if (q === 'lowest')  return links[links.length - 1];
    const idx = parseInt(q, 10);
    return links[isNaN(idx) ? 0 : Math.min(idx, links.length - 1)];
  }

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url; a.download = filename || ''; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    requestAnimationFrame(() => a.remove());
  }

  function sanitize(s) { return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100); }

  /* ─────────────────────────────────────────
     下载流程
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
          btn.classList.add('dl-err');
          btn.textContent = '❌ 无链接';
          setTimeout(() => resetBtn(btn), 2500);
          return;
        }
        const chosen = pickLink(links);
        triggerDownload(chosen.href, title ? sanitize(title) + '.mp4' : '');

        if (videoId) {
          markDownloaded(videoId);
          setDoneState(btn, videoId);
          // 补角标
          const imgWrap = btn.closest('[data-r34dl]');
          if (imgWrap && !imgWrap.querySelector('.r34dl-badge')) {
            addBadge(imgWrap);
          }
        } else {
          btn.classList.remove('loading');
          btn.textContent = '✅ 完成';
          setTimeout(() => resetBtn(btn), 2500);
        }
      },
      onerror() {
        btn.classList.remove('loading');
        btn.classList.add('dl-err');
        btn.textContent = '❌ 失败';
        setTimeout(() => resetBtn(btn), 2500);
      }
    });
  }

  function setDoneState(btn, videoId) {
    btn.classList.remove('loading', 'dl-err', 'r34dl-quick');
    btn.classList.add('r34dl-done');
    btn.textContent = '';  // CSS ::before 接管
    btn.dataset.doneLabel = '✅ 已下载';
    const ts = loadDownloaded()[videoId];
    btn.title = ts
      ? `已下载于 ${new Date(ts).toLocaleString()}（点击重新下载）`
      : '已下载（点击重新下载）';
    btn.dataset.videoId = videoId;
  }

  function resetBtn(btn) {
    btn.classList.remove('loading', 'dl-err', 'r34dl-done');
    if (!btn.classList.contains('r34dl-quick')) btn.classList.add('r34dl-quick');
    btn.textContent = '⬇ 下载';
  }

  function addBadge(imgWrap) {
    if (imgWrap.querySelector('.r34dl-badge')) return;
    const b = document.createElement('div');
    b.className = 'r34dl-badge';
    b.textContent = '✓ 已下载';
    imgWrap.appendChild(b);
  }

  /* ─────────────────────────────────────────
     核心：注入按钮
     真实卡片结构（已验证）：
       div.item.thumb[data-video-card-id="xxx"]
         a.th.js-open-popup[href="/video/{id}/slug/"]
           div.img.wrap_image          ← 注入点
             img.thumb
             div.quality / div.time
           div.thumb_title             ← 标题
  ───────────────────────────────────────── */
  function injectCardButtons() {
    // 精确选择器：data-video-card-id 是视频卡片专属属性
    const cards = document.querySelectorAll(
      '.item.thumb[data-video-card-id]:not([data-r34dl])'
    );

    cards.forEach(card => {
      // 马上标记，防止重复处理
      card.setAttribute('data-r34dl', '1');

      // 获取视频链接（href 是 /video/{id}/...）
      const linkEl = card.querySelector('a.th[href*="/video/"]');
      if (!linkEl) return;

      const videoUrl = linkEl.href;
      const videoId  = extractVideoId(videoUrl);
      if (!videoId) return;

      // 图片容器
      const imgWrap = card.querySelector('div.img.wrap_image');
      if (!imgWrap) return;

      // 保证相对定位（站点已有，保险起见）
      if (getComputedStyle(imgWrap).position === 'static') {
        imgWrap.style.setProperty('position', 'relative', 'important');
      }
      imgWrap.setAttribute('data-r34dl', '1');

      // 标题
      const titleEl = card.querySelector('.thumb_title');
      const title   = titleEl ? titleEl.textContent.trim() : '';

      const alreadyDone = isDownloaded(videoId);

      // 已下载角标（左上角常驻）
      if (alreadyDone) addBadge(imgWrap);

      // 按钮容器（左下角固定显示）
      const wrap = document.createElement('div');
      wrap.className = 'r34dl-wrap';

      const btn = document.createElement('button');
      btn.className = 'r34dl-btn';
      btn.dataset.origText = '⬇ 下载';

      if (alreadyDone) {
        setDoneState(btn, videoId);
      } else {
        btn.classList.add('r34dl-quick');
        btn.textContent = '⬇ 下载';
        btn.title = `下载（画质：${getQuality()}）`;
      }

      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        fetchAndDownload(videoUrl, btn, title, videoId);
      });

      wrap.appendChild(btn);
      imgWrap.appendChild(wrap);
    });
  }

  /* ─────────────────────────────────────────
     详情页增强
  ───────────────────────────────────────── */
  function enhanceDetailPage() {
    // 详情页 URL 是 /video/{id}/ 而非 /videos/
    if (!/\/video\/\d+\//.test(location.pathname)) return;
    const videoId = extractVideoId(location.pathname);
    const dlArea  = document.querySelector(
      '.content-more-download, .download-links, .download_links'
    );
    if (!dlArea) return;

    const done  = isDownloaded(videoId);
    const color = done ? '#169b3a' : '#d1404a';
    dlArea.style.cssText += `border:2px solid ${color};border-radius:6px;padding:8px;`;
    const tip = document.createElement('div');
    tip.style.cssText = `font-size:11px;color:${color};margin-bottom:4px;font-family:Arial;`;
    if (done) {
      const ts = loadDownloaded()[videoId];
      tip.textContent = `✅ R34 Downloader：此视频已下载${ts ? '（' + new Date(ts).toLocaleString() + '）' : ''}`;
    } else {
      tip.textContent = '▼ R34 Downloader 已识别到以下下载链接';
    }
    dlArea.insertBefore(tip, dlArea.firstChild);
  }

  /* ─────────────────────────────────────────
     配置面板
  ───────────────────────────────────────── */
  let panelCountEl = null;
  function refreshPanelCount() {
    if (panelCountEl) panelCountEl.textContent = downloadedCount();
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
        <label>已下载 <b id="r34dl-count">0</b> 条</label>
        <button id="r34dl-clear-btn">清空记录</button>
      </div>
      <div class="r34dl-tip">
        · 封面左下角固定显示 <b>⬇ 下载</b> 按钮。<br>
        · 下载后按钮变绿，左上角出现 <b>✓ 已下载</b> 角标。<br>
        · 绿色按钮 hover 变 🔁 可重新下载。<br>
        · 清空记录不删本地文件。
      </div>
    `;

    const toggle = document.createElement('div');
    toggle.id = 'r34dl-panel-toggle';
    const icon = document.createElement('div');
    icon.id = 'r34dl-panel-icon';
    icon.title = '展开/收起 R34 下载设置';
    icon.textContent = '⬇';
    toggle.appendChild(icon);

    panel.appendChild(body);
    panel.appendChild(toggle);
    document.body.appendChild(panel);

    body.style.display = getPanelOpen() ? 'block' : 'none';

    const sel = document.getElementById('r34dl-quality-sel');
    sel.value = getQuality();
    sel.addEventListener('change', () => {
      GM_setValue(CFG_QUALITY, sel.value);
      document.querySelectorAll('.r34dl-btn.r34dl-quick').forEach(b => {
        b.title = `下载（画质：${sel.value}）`;
      });
    });

    panelCountEl = document.getElementById('r34dl-count');
    refreshPanelCount();

    document.getElementById('r34dl-clear-btn').addEventListener('click', () => {
      if (confirm(`确定清空全部 ${downloadedCount()} 条已下载记录吗？`)) {
        clearAllDownloaded();
      }
    });

    toggle.addEventListener('click', () => {
      const open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      GM_setValue(CFG_PANEL, open);
    });
  }

  /* ─────────────────────────────────────────
     MutationObserver + XHR 拦截
  ───────────────────────────────────────── */
  let scanTimer = null;
  function scheduleScan(delay = 400) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(injectCardButtons, delay);
  }

  function watchDynamic() {
    new MutationObserver(() => scheduleScan(250))
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  function hookXHR() {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      this.addEventListener('loadend', () => scheduleScan(400));
      return origOpen.apply(this, args);
    };
  }

  /* ─────────────────────────────────────────
     入口
  ───────────────────────────────────────── */
  function init() {
    injectStyles();
    buildPanel();
    watchDynamic();
    hookXHR();
    scheduleScan(100);
    setTimeout(injectCardButtons, 1500);
    setTimeout(injectCardButtons, 3500);
    enhanceDetailPage();
  }

  if (document.body) {
    init();
  } else {
    new MutationObserver((_, obs) => {
      if (document.body) { obs.disconnect(); init(); }
    }).observe(document.documentElement, { childList: true });
  }

})();
