// ==UserScript==
// @name         Rule34Video 快速下载
// @namespace    https://github.com/GoldTest/alrgom
// @version      1.5.1
// @description  在视频卡片上固定显示下载按钮，下载后持久化标记"已下载"。右下角配置面板。
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
    const map = loadDownloaded(); map[id] = Date.now(); saveDownloaded(map);
    refreshPanelCount();
  }
  function isDownloaded(id) { return id && (id in loadDownloaded()); }
  function clearAllDownloaded() {
    saveDownloaded({});
    refreshPanelCount();
    document.querySelectorAll('.r34dl-btn.r34dl-done').forEach(b => {
      b.classList.remove('r34dl-done'); b.classList.add('r34dl-quick'); b.textContent = '⬇ 下载';
    });
    document.querySelectorAll('.r34dl-badge').forEach(b => b.remove());
  }
  function downloadedCount() { return Object.keys(loadDownloaded()).length; }

  function extractVideoId(url) {
    const m = String(url).match(/\/video\/(\d+)/);
    return m ? m[1] : null;
  }

  /* ─────────────────────────────────────────
     样式
  ───────────────────────────────────────── */
  GM_addStyle(`
    .r34dl-wrap {
      position: absolute !important;
      bottom: 4px !important;
      right: 4px !important;
      z-index: 9999 !important;
      pointer-events: auto !important;
    }
    .r34dl-btn {
      display: inline-block !important;
      padding: 3px 7px !important;
      border-radius: 4px !important;
      border: none !important;
      cursor: pointer !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      font-family: Arial, sans-serif !important;
      line-height: 1.4 !important;
      color: #fff !important;
      white-space: nowrap !important;
      box-shadow: 0 1px 4px rgba(0,0,0,.6) !important;
    }
    .r34dl-btn.r34dl-quick { background: rgba(24,112,210,.9) !important; }
    .r34dl-btn.r34dl-quick:hover { background: #1870d2 !important; }
    .r34dl-btn.loading { background: rgba(80,80,80,.85) !important; cursor: wait !important; }
    .r34dl-btn.r34dl-done { background: rgba(22,155,58,.9) !important; }
    .r34dl-btn.r34dl-done:hover { background: rgba(16,130,45,.95) !important; }
    .r34dl-btn.r34dl-done::before { content: attr(data-label) !important; }
    .r34dl-btn.r34dl-done:hover::before { content: '🔁 重新下载' !important; }
    .r34dl-btn.dl-err { background: rgba(175,30,30,.9) !important; }
    .r34dl-badge {
      position: absolute !important;
      top: 4px !important; left: 4px !important;
      background: rgba(22,155,58,.92) !important;
      color: #fff !important; font-size: 10px !important;
      font-weight: 700 !important; font-family: Arial, sans-serif !important;
      padding: 2px 5px !important; border-radius: 3px !important;
      z-index: 10000 !important; pointer-events: none !important;
      line-height: 1.4 !important;
    }
    /* 面板 */
    #r34dl-panel {
      position: fixed !important; bottom: 18px !important; right: 18px !important;
      z-index: 2147483647 !important; font-family: Arial, sans-serif !important;
      font-size: 13px !important; color: #eee !important; user-select: none !important;
    }
    #r34dl-toggle-btn {
      width: 38px; height: 38px; border-radius: 50%; background: #d1404a;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.5); font-size: 18px;
      cursor: pointer; border: none; color: #fff; margin-left: auto;
    }
    #r34dl-toggle-btn:hover { transform: scale(1.1); }
    #r34dl-body {
      background: rgba(20,20,30,.95); border: 1px solid #444; border-radius: 10px;
      padding: 14px 16px; margin-bottom: 8px; min-width: 240px;
      box-shadow: 0 4px 20px rgba(0,0,0,.7);
    }
    #r34dl-body h3 { margin: 0 0 10px; font-size: 13px; color: #ff6b6b; border-bottom: 1px solid #333; padding-bottom: 6px; }
    .r34dl-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
    .r34dl-row label { color: #ccc; font-size: 12px; }
    .r34dl-row select { background: #333; border: 1px solid #555; color: #eee; border-radius: 4px; padding: 3px 6px; font-size: 12px; }
    #r34dl-clear { background: #7a2020; color: #fbb; border: none; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
    #r34dl-clear:hover { background: #a02020; }
    .r34dl-tip { font-size: 11px; color: #777; margin-top: 8px; line-height: 1.5; }
  `);

  /* ─────────────────────────────────────────
     下载工具
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
        if (href && href.includes('http')) links.push({ href, label: (a.textContent || '').trim() });
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
    const i = parseInt(q, 10);
    return links[isNaN(i) ? 0 : Math.min(i, links.length - 1)];
  }

  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name || ''; a.target = '_blank';
    document.body.appendChild(a); a.click();
    setTimeout(() => a.remove(), 100);
  }

  function sanitize(s) { return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100); }

  function doDownload(videoUrl, btn, title, videoId) {
    btn.classList.add('loading'); btn.textContent = '⏳';

    GM_xmlhttpRequest({
      method: 'GET', url: videoUrl,
      onload(resp) {
        const links = parseDownloadLinks(resp.responseText);
        if (!links.length) {
          btn.classList.remove('loading'); btn.classList.add('dl-err'); btn.textContent = '❌ 无链接';
          setTimeout(() => resetBtn(btn), 2500); return;
        }
        const chosen = pickLink(links);
        triggerDownload(chosen.href, title ? sanitize(title) + '.mp4' : '');
        if (videoId) {
          markDownloaded(videoId);
          setDone(btn, videoId);
          const iw = btn.closest('[data-r34dl-iw]');
          if (iw && !iw.querySelector('.r34dl-badge')) addBadge(iw);
        } else {
          btn.classList.remove('loading'); btn.textContent = '✅';
          setTimeout(() => resetBtn(btn), 2500);
        }
      },
      onerror() {
        btn.classList.remove('loading'); btn.classList.add('dl-err'); btn.textContent = '❌ 失败';
        setTimeout(() => resetBtn(btn), 2500);
      }
    });
  }

  function setDone(btn, videoId) {
    btn.classList.remove('loading', 'dl-err', 'r34dl-quick');
    btn.classList.add('r34dl-done');
    btn.textContent = '';
    btn.dataset.label = '✅ 已下载';
    const ts = loadDownloaded()[videoId];
    btn.title = ts ? `已下载 ${new Date(ts).toLocaleString()}` : '已下载';
  }

  function resetBtn(btn) {
    btn.classList.remove('loading', 'dl-err', 'r34dl-done');
    btn.classList.add('r34dl-quick');
    btn.textContent = '⬇ 下载';
  }

  function addBadge(iw) {
    if (iw.querySelector('.r34dl-badge')) return;
    const b = document.createElement('div');
    b.className = 'r34dl-badge'; b.textContent = '✓ 已下载';
    iw.appendChild(b);
  }

  /* ─────────────────────────────────────────
     注入按钮
     卡片结构（已从真实 DOM 确认）：
       div.item.thumb[data-video-card-id]
         a.th[href="/video/{id}/..."]
           div.img.wrap_image   ← 注入点
             img.thumb
  ───────────────────────────────────────── */
  // 防止 MutationObserver 因我们注入元素而反复触发
  let _injecting = false;

  function injectAll() {
    if (_injecting) return;
    _injecting = true;
    try {
      _doInject();
    } finally {
      _injecting = false;
    }
  }

  function _doInject() {
    const cards = document.querySelectorAll('[data-video-card-id]:not([data-r34dl]), .item:not([data-r34dl])');
    if (!cards.length) return;

    cards.forEach(card => {
      card.setAttribute('data-r34dl', '1');

      // 视频 URL
      const aEl = card.querySelector('a[href*="/video/"]');
      if (!aEl) return;
      const videoUrl = aEl.href;
      const videoId  = extractVideoId(videoUrl);
      if (!videoId) return;

      // 图片容器（尝试多种选择器）
      const iw = card.querySelector('.wrap_image')
              || card.querySelector('.img')
              || aEl.querySelector('div');
      if (!iw) return;

      // 保证相对定位
      if (getComputedStyle(iw).position === 'static') {
        iw.style.position = 'relative';
      }
      iw.setAttribute('data-r34dl-iw', '1');

      // 标题
      const title = (card.querySelector('.thumb_title') || {}).textContent || '';

      const done = isDownloaded(videoId);
      if (done) addBadge(iw);

      // 按钮
      const wrap = document.createElement('div');
      wrap.className = 'r34dl-wrap';

      const btn = document.createElement('button');
      btn.className = 'r34dl-btn';

      if (done) {
        setDone(btn, videoId);
      } else {
        btn.classList.add('r34dl-quick');
        btn.textContent = '⬇ 下载';
      }

      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        doDownload(videoUrl, btn, title.trim(), videoId);
      });

      wrap.appendChild(btn);
      iw.appendChild(wrap);
    });
  }

  /* ─────────────────────────────────────────
     MutationObserver：仅在有真实新卡片时扫描
     过滤掉自己注入的元素，避免死循环
  ───────────────────────────────────────── */
  let _scanTimer = null;
  function scheduleScan() {
    clearTimeout(_scanTimer);
    _scanTimer = setTimeout(injectAll, 500);
  }

  function watchDynamic() {
    const obs = new MutationObserver(muts => {
      if (_injecting) return; // 自己注入时忽略
      // 只有新增了不含 r34dl 类的节点才扫描
      const relevant = muts.some(m =>
        Array.from(m.addedNodes).some(n =>
          n.nodeType === 1 && !n.classList?.contains('r34dl-wrap') && !n.classList?.contains('r34dl-btn')
        )
      );
      if (relevant) scheduleScan();
    });
    obs.observe(document.body, { childList: true, subtree: true });
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
    body.id = 'r34dl-body';
    body.innerHTML = `
      <h3>⬇ R34 Downloader</h3>
      <div class="r34dl-row">
        <label>默认画质</label>
        <select id="r34dl-q">
          <option value="highest">最高画质</option>
          <option value="lowest">最低画质</option>
          <option value="0">第 1 项</option>
          <option value="1">第 2 项</option>
          <option value="2">第 3 项</option>
          <option value="3">第 4 项</option>
        </select>
      </div>
      <div class="r34dl-row">
        <label>已下载 <b id="r34dl-cnt">0</b> 条</label>
        <button id="r34dl-clear">清空记录</button>
      </div>
      <div class="r34dl-tip">
        · 封面右下角固定显示 <b>⬇ 下载</b> 按钮。<br>
        · 下载后变绿，左上角出现 <b>✓ 已下载</b>。<br>
        · 绿色按钮 hover 变 🔁 可重新下载。
      </div>
    `;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'r34dl-toggle-btn';
    toggleBtn.title = '展开/收起 R34 下载设置';
    toggleBtn.textContent = '⬇';

    panel.appendChild(body);
    panel.appendChild(toggleBtn);
    document.body.appendChild(panel);

    body.style.display = getPanelOpen() ? 'block' : 'none';

    const sel = document.getElementById('r34dl-q');
    sel.value = getQuality();
    sel.addEventListener('change', () => GM_setValue(CFG_QUALITY, sel.value));

    panelCountEl = document.getElementById('r34dl-cnt');
    refreshPanelCount();

    document.getElementById('r34dl-clear').addEventListener('click', () => {
      if (confirm(`确定清空全部 ${downloadedCount()} 条记录？`)) clearAllDownloaded();
    });

    toggleBtn.addEventListener('click', () => {
      const open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      GM_setValue(CFG_PANEL, open);
    });
  }

  /* ─────────────────────────────────────────
     详情页增强
  ───────────────────────────────────────── */
  function enhanceDetailPage() {
    if (!/\/video\/\d+\//.test(location.pathname)) return;
    const videoId = extractVideoId(location.pathname);
    const dlArea  = document.querySelector('.content-more-download, .download-links, .download_links');
    if (!dlArea) return;
    const done  = isDownloaded(videoId);
    const color = done ? '#169b3a' : '#d1404a';
    dlArea.style.border = `2px solid ${color}`;
    dlArea.style.borderRadius = '6px';
    dlArea.style.padding = '8px';
    const tip = document.createElement('div');
    tip.style.cssText = `font-size:11px;color:${color};margin-bottom:4px;font-family:Arial;`;
    const ts = done ? loadDownloaded()[videoId] : null;
    tip.textContent = done
      ? `✅ R34 Downloader：已下载${ts ? '（' + new Date(ts).toLocaleString() + '）' : ''}`
      : '▼ R34 Downloader 已识别到以下下载链接';
    dlArea.insertBefore(tip, dlArea.firstChild);
  }

  /* ─────────────────────────────────────────
     入口
  ───────────────────────────────────────── */
  buildPanel();
  injectAll();          // 立即执行一次
  watchDynamic();       // 监听动态加载
  enhanceDetailPage();  // 详情页

  // 额外延迟补扫（应对慢速加载）
  setTimeout(injectAll, 1500);
  setTimeout(injectAll, 4000);

})();
