// ==UserScript==
// @name         Rule34Video 快速下载
// @namespace    https://github.com/GoldTest/alrgom
// @version      1.2.0
// @description  在视频卡片上添加快速下载按钮，下载后持久化标记"已下载"状态。右下角提供配置面板。
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
     配置键 & 默认值
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
    const map = loadDownloaded(); map[id] = Date.now(); saveDownloaded(map); refreshPanelCount();
  }
  function isDownloaded(id)   { return id && (id in loadDownloaded()); }
  function clearAllDownloaded() {
    saveDownloaded({}); refreshPanelCount();
    document.querySelectorAll('.r34dl-btn.r34dl-done').forEach(b => {
      b.classList.remove('r34dl-done');
      b.classList.add('r34dl-quick');
      b.textContent = b.dataset.origText || '⬇ 快速下载';
    });
    document.querySelectorAll('.r34dl-badge').forEach(b => b.remove());
  }
  function downloadedCount() { return Object.keys(loadDownloaded()).length; }
  function extractVideoId(url) { const m = String(url).match(/\/videos\/(\d+)/); return m ? m[1] : null; }

  /* ─────────────────────────────────────────
     样式
  ───────────────────────────────────────── */
  function injectStyles() {
    GM_addStyle(`
      /* ── 覆盖层（默认隐藏，hover 显示）── */
      .r34dl-overlay {
        position: absolute !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        padding: 5px 6px !important;
        background: linear-gradient(transparent, rgba(0,0,0,.8)) !important;
        display: flex !important;
        gap: 4px !important;
        flex-wrap: wrap !important;
        z-index: 9999 !important;
        opacity: 0 !important;
        transition: opacity .18s !important;
        pointer-events: none !important;
      }
      /* 触发父容器 hover 时显示 */
      [data-r34dl]:hover .r34dl-overlay {
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      /* ── 角标（始终可见）── */
      .r34dl-badge {
        position: absolute !important;
        top: 5px !important;
        left: 5px !important;
        background: rgba(22,160,60,.92) !important;
        color: #fff !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        padding: 2px 5px !important;
        border-radius: 3px !important;
        z-index: 10000 !important;
        pointer-events: none !important;
        letter-spacing: .3px !important;
        font-family: Arial, sans-serif !important;
        line-height: 1.4 !important;
      }

      /* ── 按钮基础 ── */
      .r34dl-btn {
        display: inline-flex !important;
        align-items: center !important;
        gap: 3px !important;
        padding: 4px 8px !important;
        border-radius: 4px !important;
        border: none !important;
        cursor: pointer !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        font-family: Arial, sans-serif !important;
        line-height: 1 !important;
        color: #fff !important;
        background: rgba(30,120,220,.9) !important;
        transition: background .15s, transform .1s !important;
        white-space: nowrap !important;
        text-shadow: none !important;
        box-shadow: 0 1px 3px rgba(0,0,0,.4) !important;
      }
      .r34dl-btn:hover  { background: #1e6fdc !important; transform: scale(1.05) !important; }
      .r34dl-btn:active { transform: scale(.97) !important; }
      .r34dl-btn.loading { background: rgba(100,100,100,.85) !important; cursor: wait !important; }
      .r34dl-btn.dl-err  { background: rgba(180,30,30,.9) !important; }

      /* 已下载：绿色；hover 切换文字为"重新下载" */
      .r34dl-btn.r34dl-done {
        background: rgba(22,160,60,.9) !important;
      }
      .r34dl-btn.r34dl-done:hover {
        background: rgba(15,130,45,.95) !important;
      }
      .r34dl-btn.r34dl-done::before { content: attr(data-done-label) !important; }
      .r34dl-btn.r34dl-done:hover::before { content: '🔁 重新下载' !important; }

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
      #r34dl-panel-toggle { display: flex; align-items: center; justify-content: flex-end; cursor: pointer; }
      #r34dl-panel-icon {
        width: 38px; height: 38px; border-radius: 50%;
        background: #d1404a; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,.5); font-size: 18px; transition: transform .2s;
      }
      #r34dl-panel-icon:hover { transform: scale(1.1); }
      #r34dl-panel-body {
        background: rgba(20,20,30,.95); border: 1px solid #444; border-radius: 10px;
        padding: 14px 16px; margin-bottom: 8px; min-width: 235px;
        box-shadow: 0 4px 20px rgba(0,0,0,.7);
      }
      #r34dl-panel-body h3 { margin: 0 0 10px; font-size: 13px; color: #ff6b6b; border-bottom: 1px solid #333; padding-bottom: 6px; }
      .r34dl-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
      .r34dl-row label { color: #ccc; font-size: 12px; flex-shrink: 0; }
      .r34dl-row select { background: #333; border: 1px solid #555; color: #eee; border-radius: 4px; padding: 3px 6px; font-size: 12px; cursor: pointer; }
      #r34dl-clear-btn { background: #7a2020; color: #fbb; border: none; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
      #r34dl-clear-btn:hover { background: #a02020; }
      .r34dl-tip { font-size: 11px; color: #777; margin-top: 8px; line-height: 1.5; }
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
    // 去重
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
    btn.textContent = '⏳ 获取中…';

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
          const wrap = btn.closest('[data-r34dl]');
          if (wrap && !wrap.querySelector('.r34dl-badge')) addBadge(wrap);
        } else {
          btn.classList.remove('loading');
          btn.textContent = '✅ 下载中';
          setTimeout(() => resetBtn(btn), 3000);
        }
      },
      onerror() {
        btn.classList.remove('loading');
        btn.classList.add('dl-err');
        btn.textContent = '❌ 请求失败';
        setTimeout(() => resetBtn(btn), 2500);
      }
    });
  }

  function setDoneState(btn, videoId) {
    btn.classList.remove('loading', 'dl-err', 'r34dl-quick');
    btn.classList.add('r34dl-done');
    btn.textContent = '';          // 文字由 CSS ::before 接管
    btn.dataset.doneLabel = '✅ 已下载';
    const map = loadDownloaded();
    const ts = map[videoId];
    btn.title = ts
      ? `已下载于 ${new Date(ts).toLocaleDateString()} ${new Date(ts).toLocaleTimeString()}（点击重新下载）`
      : '已下载（点击重新下载）';
    btn.dataset.videoId = videoId;
  }

  function resetBtn(btn) {
    btn.classList.remove('loading', 'dl-err', 'r34dl-done');
    if (!btn.classList.contains('r34dl-quick')) btn.classList.add('r34dl-quick');
    btn.textContent = btn.dataset.origText || '⬇ 快速下载';
  }

  function addBadge(wrap) {
    const b = document.createElement('div');
    b.className = 'r34dl-badge';
    b.textContent = '✓ 已下载';
    wrap.appendChild(b);
  }

  /* ─────────────────────────────────────────
     核心：找到视频卡片并注入按钮
     策略：不依赖固定类名，改为找所有含 /videos/{id}/ 链接的、
     自身或祖先带封面图的容器。
  ───────────────────────────────────────── */
  function injectCardButtons() {
    // 找所有指向视频详情页的链接
    const videoLinks = document.querySelectorAll('a[href*="/videos/"]');

    videoLinks.forEach(link => {
      const videoUrl = link.href;
      const videoId  = extractVideoId(videoUrl);
      if (!videoId) return;

      // 向上找一个合适的"卡片容器"：包含 img 且相对可定位
      // 优先找 link 本身（如果它包含 img），否则往上爬最多 4 层
      let imgWrap = null;
      let cur = link;
      for (let i = 0; i < 5; i++) {
        if (cur.querySelector('img') || cur.tagName === 'A' && cur.querySelector('img')) {
          imgWrap = cur;
          break;
        }
        if (!cur.parentElement) break;
        cur = cur.parentElement;
        if (cur.querySelector('img')) { imgWrap = cur; break; }
      }
      if (!imgWrap) return;

      // 防止重复注入：以 imgWrap 为单位标记
      if (imgWrap.hasAttribute('data-r34dl')) return;
      imgWrap.setAttribute('data-r34dl', '1');

      // 相对定位
      const pos = getComputedStyle(imgWrap).position;
      if (pos === 'static') imgWrap.style.setProperty('position', 'relative', 'important');

      // 获取标题
      let title = '';
      const titleEl = imgWrap.closest('[class]')?.querySelector('[class*="title"] a, .title a')
                   || imgWrap.querySelector('[alt]');
      if (titleEl) title = (titleEl.textContent || titleEl.getAttribute('alt') || '').trim();

      const alreadyDone = isDownloaded(videoId);

      // 角标
      if (alreadyDone) addBadge(imgWrap);

      // 覆盖层
      const overlay = document.createElement('div');
      overlay.className = 'r34dl-overlay';

      // 按钮
      const btn = document.createElement('button');
      btn.className = 'r34dl-btn';
      btn.dataset.origText = '⬇ 快速下载';

      if (alreadyDone) {
        setDoneState(btn, videoId);
      } else {
        btn.classList.add('r34dl-quick');
        btn.textContent = '⬇ 快速下载';
        btn.title = `按配置画质下载（当前：${getQuality()}）`;
      }

      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        fetchAndDownload(videoUrl, btn, title, videoId);
      });

      overlay.appendChild(btn);
      imgWrap.appendChild(overlay);
    });
  }

  /* ─────────────────────────────────────────
     详情页增强
  ───────────────────────────────────────── */
  function enhanceDetailPage() {
    if (!/\/videos\/\d+\//.test(location.pathname)) return;
    const videoId = extractVideoId(location.pathname);
    const dlArea  = document.querySelector(
      '.content-more-download, .download-links, .download_links'
    );
    if (!dlArea) return;

    const done = isDownloaded(videoId);
    const color = done ? '#16a03c' : '#d1404a';
    dlArea.style.cssText += `border:2px solid ${color};border-radius:6px;padding:8px;`;
    const tip = document.createElement('div');
    tip.style.cssText = `font-size:11px;color:${color};margin-bottom:4px;`;
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
        · 鼠标悬停视频封面即可看到 <b>⬇ 快速下载</b>。<br>
        · 下载后封面左上角显示 <b>✓ 已下载</b> 角标，长期保留。<br>
        · 绿色按钮 hover 变 🔁 可重新下载。
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
      document.querySelectorAll('.r34dl-quick').forEach(b => {
        b.title = `按配置画质下载（当前：${sel.value}）`;
      });
    });

    panelCountEl = document.getElementById('r34dl-count');
    refreshPanelCount();

    document.getElementById('r34dl-clear-btn').addEventListener('click', () => {
      if (confirm(`确定清空全部 ${downloadedCount()} 条已下载记录吗？`)) clearAllDownloaded();
    });

    toggle.addEventListener('click', () => {
      const open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      GM_setValue(CFG_PANEL, open);
    });
  }

  /* ─────────────────────────────────────────
     防抖扫描 + MutationObserver
     —— 只要 DOM 有变化就尝试扫描
  ───────────────────────────────────────── */
  let scanTimer = null;
  function scheduleScan(delay = 400) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(injectCardButtons, delay);
  }

  function watchDynamic() {
    new MutationObserver(() => scheduleScan(300))
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────
     拦截 XHR 完成事件（AJAX 加载卡片后触发扫描）
  ───────────────────────────────────────── */
  function hookXHR() {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      this.addEventListener('loadend', () => scheduleScan(500));
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
    // 立即扫一次（处理已有内容）
    scheduleScan(100);
    // 备用延迟扫：应对极慢渲染
    setTimeout(injectCardButtons, 1500);
    setTimeout(injectCardButtons, 3000);
    // 详情页
    enhanceDetailPage();
  }

  // document-start 时 body 还不存在，等 body 出现再初始化
  if (document.body) {
    init();
  } else {
    new MutationObserver((_, obs) => {
      if (document.body) { obs.disconnect(); init(); }
    }).observe(document.documentElement, { childList: true });
  }

})();
