// ==UserScript==
// @name         Rule34Video 快速下载
// @namespace    https://github.com/GoldTest/alrgom
// @version      1.4.0-debug
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

  const LOG  = (...a) => console.log('[R34DL]', ...a);
  const WARN = (...a) => console.warn('[R34DL]', ...a);

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
    document.querySelectorAll('.r34dl-btn.r34dl-done').forEach(btn => {
      btn.classList.remove('r34dl-done');
      btn.classList.add('r34dl-quick');
      btn.textContent = '⬇ 下载';
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
  function injectStyles() {
    GM_addStyle(`
      .r34dl-wrap {
        position: absolute !important;
        bottom: 4px !important;
        left: 4px !important;
        z-index: 9999 !important;
        display: flex !important;
        gap: 3px !important;
        pointer-events: auto !important;
      }
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
        opacity: .92 !important;
        transition: opacity .15s, transform .1s !important;
      }
      .r34dl-btn:hover  { opacity: 1 !important; transform: scale(1.05) !important; }
      .r34dl-btn:active { transform: scale(.97) !important; }
      .r34dl-btn.r34dl-quick { background: rgba(24,112,210,.9) !important; }
      .r34dl-btn.r34dl-quick:hover { background: #1870d2 !important; }
      .r34dl-btn.loading { background: rgba(90,90,90,.85) !important; cursor: wait !important; }
      .r34dl-btn.r34dl-done { background: rgba(22,155,58,.9) !important; }
      .r34dl-btn.r34dl-done:hover { background: rgba(16,130,45,.95) !important; }
      .r34dl-btn.r34dl-done::before { content: attr(data-done-label) !important; }
      .r34dl-btn.r34dl-done:hover::before { content: '🔁 重新下载' !important; }
      .r34dl-btn.dl-err { background: rgba(175,30,30,.9) !important; }
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
      }

      /* 面板 */
      #r34dl-panel {
        position: fixed !important; bottom: 18px !important; right: 18px !important;
        z-index: 2147483647 !important; font-family: Arial, sans-serif !important;
        font-size: 13px !important; color: #eee !important; user-select: none !important;
      }
      #r34dl-panel-toggle { display:flex; align-items:center; justify-content:flex-end; cursor:pointer; }
      #r34dl-panel-icon {
        width:38px; height:38px; border-radius:50%; background:#d1404a;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,.5); font-size:18px; transition:transform .2s;
      }
      #r34dl-panel-icon:hover { transform:scale(1.1); }
      #r34dl-panel-body {
        background:rgba(20,20,30,.95); border:1px solid #444; border-radius:10px;
        padding:14px 16px; margin-bottom:8px; min-width:250px;
        box-shadow:0 4px 20px rgba(0,0,0,.7);
      }
      #r34dl-panel-body h3 {
        margin:0 0 10px; font-size:13px; color:#ff6b6b;
        border-bottom:1px solid #333; padding-bottom:6px;
      }
      .r34dl-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:8px; }
      .r34dl-row label { color:#ccc; font-size:12px; flex-shrink:0; }
      .r34dl-row select { background:#333; border:1px solid #555; color:#eee; border-radius:4px; padding:3px 6px; font-size:12px; cursor:pointer; }
      #r34dl-clear-btn { background:#7a2020; color:#fbb; border:none; border-radius:4px; padding:3px 8px; font-size:11px; cursor:pointer; }
      #r34dl-clear-btn:hover { background:#a02020; }
      .r34dl-debug { font-size:10px; color:#555; margin-top:6px; max-height:80px; overflow-y:auto; }
      .r34dl-tip { font-size:11px; color:#777; margin-top:8px; line-height:1.5; }
    `);
  }

  /* ─────────────────────────────────────────
     详情页下载链接解析
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
      if (links.length) { LOG('解析到下载链接，使用选择器:', sel, '数量:', links.length); break; }
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
    LOG('开始下载，URL:', videoUrl, 'ID:', videoId);
    btn.classList.add('loading');
    btn.textContent = '⏳';

    GM_xmlhttpRequest({
      method: 'GET',
      url: videoUrl,
      onload(resp) {
        const links = parseDownloadLinks(resp.responseText);
        LOG('可用下载链接:', links.length, links.map(l => l.label));
        if (!links.length) {
          btn.classList.remove('loading');
          btn.classList.add('dl-err');
          btn.textContent = '❌ 无链接';
          setTimeout(() => resetBtn(btn), 2500);
          return;
        }
        const chosen = pickLink(links);
        LOG('选中链接:', chosen.label, chosen.href.slice(0, 80));
        triggerDownload(chosen.href, title ? sanitize(title) + '.mp4' : '');

        if (videoId) {
          markDownloaded(videoId);
          setDoneState(btn, videoId);
          const imgWrap = btn.closest('[data-r34dl-img]');
          if (imgWrap && !imgWrap.querySelector('.r34dl-badge')) addBadge(imgWrap);
        } else {
          btn.classList.remove('loading');
          btn.textContent = '✅ 完成';
          setTimeout(() => resetBtn(btn), 2500);
        }
      },
      onerror(e) {
        WARN('请求失败:', e);
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
    btn.textContent = '';
    btn.dataset.doneLabel = '✅ 已下载';
    const ts = loadDownloaded()[videoId];
    btn.title = ts
      ? `已下载于 ${new Date(ts).toLocaleString()}（click重新下载）`
      : '已下载（click重新下载）';
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
     核心：扫描并注入按钮
     同时尝试两套选择器：精确 + 宽泛回退
  ───────────────────────────────────────── */
  let totalInjected = 0;

  function injectCardButtons() {
    // ── 策略1：精确选择器（已验证 DOM 结构）──
    let cards = document.querySelectorAll(
      '.item.thumb[data-video-card-id]:not([data-r34dl])'
    );

    // ── 策略2：宽泛回退 ──
    if (!cards.length) {
      cards = document.querySelectorAll(
        '[data-video-card-id]:not([data-r34dl])'
      );
    }

    LOG(`injectCardButtons 执行：找到未处理卡片 ${cards.length} 张`);

    if (!cards.length) {
      // 调试：检查页面上有多少 data-video-card-id
      const allCards = document.querySelectorAll('[data-video-card-id]');
      const processed = document.querySelectorAll('[data-r34dl]');
      LOG(`  ↳ 页面共 ${allCards.length} 张卡片（含已处理），已处理 ${processed.length} 张`);

      // 调试：找所有 /video/ 链接
      const videoLinks = document.querySelectorAll('a[href*="/video/"]');
      LOG(`  ↳ 含 /video/ 的链接数: ${videoLinks.length}`);
      if (videoLinks.length && videoLinks.length < 5) {
        videoLinks.forEach(l => LOG('    link:', l.href));
      }
      return;
    }

    cards.forEach(card => {
      card.setAttribute('data-r34dl', '1');

      // 找视频链接（href 包含 /video/ ）
      const linkEl = card.querySelector('a[href*="/video/"]')
                  || card.querySelector('a.th')
                  || card.querySelector('a[href]');
      if (!linkEl) {
        WARN('卡片内未找到视频链接:', card.outerHTML.slice(0, 200));
        return;
      }

      const videoUrl = linkEl.href;
      const videoId  = extractVideoId(videoUrl);
      LOG(`  卡片 ID=${videoId} URL=${videoUrl.slice(0, 60)}`);

      if (!videoId) {
        WARN('无法提取 videoId，URL:', videoUrl);
        return;
      }

      // 找图片容器（尝试多种方式）
      let imgWrap = card.querySelector('div.img.wrap_image')
                 || card.querySelector('.wrap_image')
                 || card.querySelector('.img')
                 || linkEl.querySelector('div');
      if (!imgWrap) {
        WARN('未找到图片容器:', card.outerHTML.slice(0, 200));
        return;
      }

      LOG(`  imgWrap tagName=${imgWrap.tagName} class="${imgWrap.className}"`);

      // 保证相对定位
      const pos = getComputedStyle(imgWrap).position;
      if (pos === 'static') {
        imgWrap.style.setProperty('position', 'relative', 'important');
      }
      imgWrap.setAttribute('data-r34dl-img', '1');

      // 标题
      const titleEl = card.querySelector('.thumb_title');
      const title   = titleEl ? titleEl.textContent.trim() : '';

      const alreadyDone = isDownloaded(videoId);
      if (alreadyDone) addBadge(imgWrap);

      // 创建按钮容器
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
      totalInjected++;
      LOG(`  ✓ 已注入按钮，累计 ${totalInjected} 张`);
    });
  }

  /* ─────────────────────────────────────────
     详情页增强
  ───────────────────────────────────────── */
  function enhanceDetailPage() {
    if (!/\/video\/\d+\//.test(location.pathname)) return;
    LOG('详情页检测到:', location.pathname);
    const videoId = extractVideoId(location.pathname);
    const dlArea  = document.querySelector(
      '.content-more-download, .download-links, .download_links'
    );
    if (!dlArea) { LOG('详情页：未找到下载区'); return; }

    const done  = isDownloaded(videoId);
    const color = done ? '#169b3a' : '#d1404a';
    dlArea.style.cssText += `border:2px solid ${color};border-radius:6px;padding:8px;`;
    const tip = document.createElement('div');
    tip.style.cssText = `font-size:11px;color:${color};margin-bottom:4px;font-family:Arial;`;
    tip.textContent = done
      ? `✅ R34 Downloader：已下载${(loadDownloaded()[videoId] ? '（' + new Date(loadDownloaded()[videoId]).toLocaleString() + '）' : '')}`
      : '▼ R34 Downloader 已识别到以下下载链接';
    dlArea.insertBefore(tip, dlArea.firstChild);
  }

  /* ─────────────────────────────────────────
     配置面板
  ───────────────────────────────────────── */
  let panelCountEl = null;
  let debugEl      = null;

  function refreshPanelCount() {
    if (panelCountEl) panelCountEl.textContent = downloadedCount();
  }

  function appendDebug(msg) {
    if (!debugEl) return;
    const line = document.createElement('div');
    line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
    debugEl.appendChild(line);
    debugEl.scrollTop = debugEl.scrollHeight;
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'r34dl-panel';

    const body = document.createElement('div');
    body.id = 'r34dl-panel-body';
    body.innerHTML = `
      <h3>⬇ R34 Downloader <small style="color:#aaa;font-size:10px">v1.4-debug</small></h3>
      <div class="r34dl-row">
        <label>默认画质</label>
        <select id="r34dl-quality-sel">
          <option value="highest">最高画质</option>
          <option value="lowest">最低画质</option>
          <option value="0">第 1 项</option>
          <option value="1">第 2 项</option>
          <option value="2">第 3 项</option>
          <option value="3">第 4 项</option>
        </select>
      </div>
      <div class="r34dl-row">
        <label>已下载 <b id="r34dl-count">0</b> 条</label>
        <button id="r34dl-clear-btn">清空</button>
      </div>
      <div class="r34dl-row">
        <label style="font-size:11px;">调试日志</label>
        <button id="r34dl-scan-btn" style="background:#334;color:#adf;border:none;border-radius:3px;padding:2px 7px;font-size:11px;cursor:pointer;">立即扫描</button>
      </div>
      <div class="r34dl-debug" id="r34dl-debug-log" style="background:#111;padding:4px;border-radius:3px;color:#8f8;"></div>
      <div class="r34dl-tip">
        · 封面左下角固定 <b>⬇ 下载</b>。<br>
        · 下载后变绿，左上角 <b>✓ 已下载</b>。
      </div>
    `;

    const toggle = document.createElement('div');
    toggle.id = 'r34dl-panel-toggle';
    const icon = document.createElement('div');
    icon.id = 'r34dl-panel-icon';
    icon.title = '展开/收起';
    icon.textContent = '⬇';
    toggle.appendChild(icon);

    panel.appendChild(body);
    panel.appendChild(toggle);
    document.body.appendChild(panel);

    body.style.display = getPanelOpen() ? 'block' : 'none';

    const sel = document.getElementById('r34dl-quality-sel');
    sel.value = getQuality();
    sel.addEventListener('change', () => GM_setValue(CFG_QUALITY, sel.value));

    panelCountEl = document.getElementById('r34dl-count');
    refreshPanelCount();

    debugEl = document.getElementById('r34dl-debug-log');

    document.getElementById('r34dl-clear-btn').addEventListener('click', () => {
      if (confirm(`清空全部 ${downloadedCount()} 条？`)) clearAllDownloaded();
    });

    document.getElementById('r34dl-scan-btn').addEventListener('click', () => {
      appendDebug('手动触发扫描…');
      const before = totalInjected;
      injectCardButtons();
      appendDebug(`扫描完成，新增 ${totalInjected - before} 张`);
    });

    toggle.addEventListener('click', () => {
      const open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      GM_setValue(CFG_PANEL, open);
    });

    // 把 console 输出也镜像到面板
    const origLog  = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    console.log  = (...a) => { origLog(...a);  if (a[0]==='[R34DL]') appendDebug(a.slice(1).join(' ')); };
    console.warn = (...a) => { origWarn(...a); if (a[0]==='[R34DL]') appendDebug('⚠ ' + a.slice(1).join(' ')); };
  }

  /* ─────────────────────────────────────────
     动态监听：MutationObserver + XHR + fetch + setInterval
  ───────────────────────────────────────── */
  let scanTimer = null;
  function scheduleScan(label, delay = 400) {
    LOG(`scheduleScan 触发（${label}），delay=${delay}ms`);
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      LOG(`执行扫描（来自 ${label}）`);
      injectCardButtons();
    }, delay);
  }

  function watchDynamic() {
    new MutationObserver(muts => {
      // 只在有新节点加入时触发
      const hasNew = muts.some(m => m.addedNodes.length > 0);
      if (hasNew) scheduleScan('MutationObserver', 200);
    }).observe(document.documentElement, { childList: true, subtree: true });
    LOG('MutationObserver 已启动');
  }

  function hookXHR() {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      this.addEventListener('loadend', () => scheduleScan('XHR-loadend', 500));
      return origOpen.apply(this, args);
    };
    LOG('XHR hook 已安装');
  }

  function hookFetch() {
    const origFetch = window.fetch;
    if (!origFetch) return;
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      p.then(() => scheduleScan('fetch', 600)).catch(() => {});
      return p;
    };
    LOG('fetch hook 已安装');
  }

  // setInterval 兜底（前 60 秒每 3 秒扫一次）
  function startIntervalFallback() {
    let count = 0;
    const iv = setInterval(() => {
      count++;
      scheduleScan(`interval#${count}`, 0);
      if (count >= 20) { clearInterval(iv); LOG('interval 兜底已停止'); }
    }, 3000);
    LOG('interval 兜底已启动（每 3 秒，共 20 次）');
  }

  /* ─────────────────────────────────────────
     入口
  ───────────────────────────────────────── */
  function init() {
    LOG('init() 开始，URL:', location.href);
    injectStyles();
    buildPanel();
    LOG('面板构建完成');

    watchDynamic();
    hookXHR();
    hookFetch();
    startIntervalFallback();

    // 立即扫描
    scheduleScan('init-immediate', 50);
    scheduleScan('init-1s',  1000);
    scheduleScan('init-2s',  2000);
    scheduleScan('init-4s',  4000);

    enhanceDetailPage();
    LOG('init() 完成');
  }

  if (document.body) {
    LOG('document.body 已存在，直接 init');
    init();
  } else {
    LOG('等待 document.body…');
    new MutationObserver((_, obs) => {
      if (document.body) {
        obs.disconnect();
        LOG('document.body 出现，执行 init');
        init();
      }
    }).observe(document.documentElement, { childList: true });
  }

})();
