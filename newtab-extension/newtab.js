/**
 * Lumina New Tab — JavaScript
 * 功能：时钟、问候语、粒子背景、搜索引擎切换、快捷方式 CRUD
 */

/* ════════════════════════════════
   1. 时钟 & 日期
════════════════════════════════ */
const clockEl = document.getElementById('clock');
const dateEl  = document.getElementById('date-display');
const greetingEl = document.getElementById('greeting');

const WEEK = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

function pad(n) { return String(n).padStart(2, '0'); }

function updateClock() {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  clockEl.textContent = `${pad(h)}:${pad(m)}`;

  const dateStr = `${now.getFullYear()}年${MONTHS[now.getMonth()]} ${now.getDate()}日  ${WEEK[now.getDay()]}`;
  dateEl.textContent = dateStr;

  // 问候语
  let greeting = '你好！';
  if (h >= 5  && h < 9)  greeting = '早上好，新的一天开始了 ☀️';
  else if (h >= 9  && h < 12) greeting = '上午好，专注工作！💪';
  else if (h >= 12 && h < 14) greeting = '午间好，记得休息一下 🍜';
  else if (h >= 14 && h < 18) greeting = '下午好，保持专注 ✨';
  else if (h >= 18 && h < 21) greeting = '晚上好，辛苦了今天 🌙';
  else greeting = '夜深了，注意休息 💤';
  greetingEl.textContent = greeting;
}

updateClock();
setInterval(updateClock, 1000);


/* ════════════════════════════════
   2. 粒子背景
════════════════════════════════ */
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [], raf;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.3,
      alpha: Math.random() * 0.6 + 0.1,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.03,
    };
  }

  function init() {
    resize();
    const count = Math.floor((W * H) / 8000);
    particles = Array.from({ length: count }, createParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.twinkle += p.twinkleSpeed;
      const a = p.alpha * (0.55 + 0.45 * Math.sin(p.twinkle));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -2) p.x = W + 2;
      if (p.x > W + 2) p.x = -2;
      if (p.y < -2) p.y = H + 2;
      if (p.y > H + 2) p.y = -2;
    }
    raf = requestAnimationFrame(draw);
  }

  init();
  draw();
  window.addEventListener('resize', () => { init(); });
})();


/* ════════════════════════════════
   3. 搜索引擎
════════════════════════════════ */
const ENGINES = {
  google: {
    url: 'https://www.google.com/search?q=',
    name: 'Google',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"/>
      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
    </svg>`
  },
  bing: {
    url: 'https://www.bing.com/search?q=',
    name: 'Bing',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#008373" d="M5 2.5v17.2l5.3 3.3 8.2-4.6v-5.8l-5.8-2.1v-3.8l-7.7-4.2z"/>
      <path fill="#00B294" d="M10.3 8.3l5.9 3.1v3.9l-5.9 3.3V8.3z"/>
      <path fill="#43D6B5" opacity="0.7" d="M10.3 18.6l5.9-3.3v-3.9l-5.9 3.3v3.9z"/>
    </svg>`
  },
  baidu: {
    url: 'https://www.baidu.com/s?wd=',
    name: '百度',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20">
      <ellipse cx="6.5" cy="7.8" rx="2" ry="2.7" fill="#2932E1" transform="rotate(-20 6.5 7.8)"/>
      <ellipse cx="17.5" cy="7.8" rx="2" ry="2.7" fill="#2932E1" transform="rotate(20 17.5 7.8)"/>
      <ellipse cx="10.2" cy="4.8" rx="1.8" ry="2.5" fill="#2932E1" transform="rotate(-6 10.2 4.8)"/>
      <ellipse cx="13.8" cy="4.8" rx="1.8" ry="2.5" fill="#2932E1" transform="rotate(6 13.8 4.8)"/>
      <path fill="#DE0F17" d="M12 8.4c-3.6 0-5.8 2.3-5.8 5.2 0 2.7 1.7 4.9 4.2 5.5.6.1 1 .6 1.1 1.2.1.7.7 1.2 1.5 1.2.8 0 1.4-.5 1.5-1.2.1-.6.5-1.1 1.1-1.2 2.5-.6 4.2-2.8 4.2-5.5 0-2.9-2.2-5.2-5.8-5.2h-2z"/>
      <path fill="#FFFFFF" d="M9.8 11.5h4.4v1.4H9.8zm.8 2.4h2.8v1.3h-2.8z"/>
    </svg>`
  },
  duckduckgo: {
    url: 'https://duckduckgo.com/?q=',
    name: 'DuckDuckGo',
    svg: `<svg viewBox="0 0 24 24" width="20" height="20">
      <circle cx="12" cy="12" r="10.5" fill="#DE5833"/>
      <path fill="#FFFFFF" d="M15.4 12.2c-.2-.1-.5-.2-.7-.2-.2-.5-.6-1-1.1-1.3.3-.4.5-.9.5-1.4 0-1.5-1.2-2.7-2.7-2.7-.4 0-.8.1-1.2.3-.2-.5-.7-.9-1.3-.9-1 0-1.7.9-1.5 1.9l.4 1.7c-.4.4-.7.9-.7 1.5 0 .9.6 1.7 1.4 1.9v1.2c0 .6.5 1.1 1.1 1.1h3.6c.6 0 1.1-.5 1.1-1.1v-.8c.7-.2 1.2-.8 1.2-1.5 0-.5-.3-1-.6-1.2z"/>
      <circle cx="10.2" cy="8.2" r=".7" fill="#2E3440"/>
      <path fill="#F59E0B" d="M14.5 11c.8 0 1.5-.4 1.8-1-.5-.2-1.1-.3-1.8-.3v1.3z"/>
      <path fill="#10B981" d="M11 13.5h2.5v1.2H11z"/>
    </svg>`
  },
};

let currentEngine = localStorage.getItem('lumina-engine') || 'google';

const engineBtn    = document.getElementById('engine-btn');
const engineIcon   = document.getElementById('engine-icon');
const enginePicker = document.getElementById('engine-picker');
const searchInput  = document.getElementById('search-input');
const searchSubmit = document.getElementById('search-submit');

function applyEngine(key, shouldSync = true) {
  const e = ENGINES[key] || ENGINES.google;
  const prevEngine = currentEngine;
  currentEngine = key in ENGINES ? key : 'google';
  engineIcon.innerHTML = e.svg;
  engineBtn.title = `当前搜索引擎：${e.name}（点击切换）`;
  localStorage.setItem('lumina-engine', currentEngine);
  if (shouldSync && prevEngine !== currentEngine) {
    triggerAutoUpload('engine_change');
  }
}

applyEngine(currentEngine, false);

// 点击引擎按钮：切换显示/隐藏，阻止事件继续冒泡
engineBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  closeHistory();          // 避免两个浮层同时展开叠在一起
  enginePicker.classList.toggle('open');
});

// 点击 picker 内部任何地方都阻止冒泡，防止触发 document 的关闭逻辑
enginePicker.addEventListener('click', (ev) => {
  ev.stopPropagation();
});

// 单独监听每个选项
enginePicker.querySelectorAll('.ep-item').forEach(btn => {
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    applyEngine(btn.dataset.engine);
    enginePicker.classList.remove('open');
    searchInput.focus();
  });
});

// 点击页面其他区域时关闭 picker（排除 engineBtn 和 picker 自身）
document.addEventListener('click', (ev) => {
  if (!enginePicker.contains(ev.target) && ev.target !== engineBtn) {
    enginePicker.classList.remove('open');
  }
});

/**
 * 执行搜索
 * @param {string} [rawQuery] 指定搜索词；不传则取输入框当前内容
 */
function doSearch(rawQuery) {
  const q = (rawQuery || searchInput.value).trim();
  if (!q) return;
  // 判断是否是 URL
  const isUrl = /^(https?:\/\/|www\.)/i.test(q) || /^[\w-]+\.\w{2,}/.test(q);
  const targetUrl = isUrl
    ? (/^https?:\/\//i.test(q) ? q : 'https://' + q)
    : ENGINES[currentEngine].url + encodeURIComponent(q);

  // 先落历史再跳转：清空输入框，但历史保留
  addToHistory(q);
  searchInput.value = '';
  closeHistory();

  // 默认在新标签页打开
  window.open(targetUrl, '_blank');
}

searchSubmit.addEventListener('click', () => doSearch());


/* ════════════════════════════════
   3-A. 搜索历史
════════════════════════════════ */
const HISTORY_KEY = 'lumina-search-history';
const HISTORY_MAX = 12;

const searchContainer = document.querySelector('.search-container');
const historyPanel    = document.getElementById('search-history');
const historyList     = document.getElementById('sh-list');
const historyClear    = document.getElementById('sh-clear');

let historyItems = [];
let historyIndex = -1;   // -1 表示当前没有选中项

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(x => typeof x === 'string' && x.trim());
  } catch {
    return [];
  }
}

function saveHistory(list, shouldSync = true) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    if (shouldSync && isSyncHistoryEnabled()) {
      triggerAutoUpload('history_change');
    }
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用，静默降级为仅本次会话有效
  }
}

/** 记录一条搜索历史：去重后置顶，最多保留 HISTORY_MAX 条 */
function addToHistory(query) {
  const term = String(query).trim();
  if (!term) return;
  const next = [term, ...loadHistory().filter(x => x !== term)].slice(0, HISTORY_MAX);
  saveHistory(next);
  renderHistory();
}

function removeFromHistory(term) {
  const next = loadHistory().filter(x => x !== term);
  saveHistory(next);
  renderHistory();
  // 删空后不残留空面板，与 openHistory「无历史不展示」的约定保持一致
  if (!next.length) closeHistory();
}

function clearHistory() {
  saveHistory([]);
  renderHistory();
  closeHistory();
  showToast('搜索历史已清空', '🧹');
}

function renderHistory() {
  historyItems = loadHistory();

  if (!historyItems.length) {
    historyList.innerHTML = '<li class="sh-empty">暂无搜索历史</li>';
    return;
  }

  historyList.innerHTML = historyItems.map((item, i) => `
    <li class="sh-item" data-index="${i}">
      <svg class="sh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <span class="sh-text"></span>
      <button class="sh-del" data-index="${i}" title="删除这条">✕</button>
    </li>
  `).join('');

  // 搜索词是用户输入内容，必须走 textContent 填充，不能拼进 HTML
  historyList.querySelectorAll('.sh-text').forEach((el, i) => {
    el.textContent = historyItems[i];
  });
}

function setActiveIndex(i) {
  historyIndex = i;
  historyList.querySelectorAll('.sh-item').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.index) === historyIndex);
  });
  if (historyIndex >= 0) {
    historyList
      .querySelector(`.sh-item[data-index="${historyIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }
}

function openHistory() {
  // 输入框有内容时不再遮挡；无历史也不展示空面板
  if (searchInput.value.trim() || !loadHistory().length) return;
  renderHistory();
  historyPanel.hidden = false;
  setActiveIndex(-1);
}

function closeHistory() {
  if (historyPanel) historyPanel.hidden = true;
  setActiveIndex(-1);
}

// 整框点击即可聚焦：命中按钮时保留按钮自身行为，其余空白处一律聚焦输入框
searchContainer.addEventListener('mousedown', (ev) => {
  if (ev.target.closest('button')) return;
  ev.preventDefault();          // 先阻止默认失焦，再手动聚焦，一次点击即生效
  searchInput.focus();
  openHistory();
});

// 只在「点击」时展开历史：输入框带 autofocus，用 focus 事件会让面板在页面加载时就弹出
searchInput.addEventListener('click', openHistory);
searchInput.addEventListener('input', closeHistory);

searchInput.addEventListener('keydown', (e) => {
  const panelOpen = !historyPanel.hidden;

  if (e.key === 'Enter') {
    // 有高亮项时优先执行高亮项，否则搜索输入框内容
    doSearch(panelOpen && historyIndex >= 0 ? historyItems[historyIndex] : undefined);
    return;
  }

  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && panelOpen && historyItems.length) {
    e.preventDefault();
    const next = e.key === 'ArrowDown'
      ? historyIndex + 1
      : historyIndex - 1;
    // 首尾循环
    setActiveIndex(next >= historyItems.length ? 0 : next < 0 ? historyItems.length - 1 : next);
    return;
  }

  if (e.key === 'Escape' && panelOpen) {
    e.stopPropagation();        // 避免冒泡触发全局 Escape 关闭弹窗
    closeHistory();
  }
});

// 事件委托：点击条目直接搜索，点击 × 删除单条
historyList.addEventListener('click', (ev) => {
  const delBtn = ev.target.closest('.sh-del');
  if (delBtn) {
    ev.stopPropagation();
    removeFromHistory(historyItems[Number(delBtn.dataset.index)]);
    return;
  }
  const item = ev.target.closest('.sh-item');
  if (item) doSearch(historyItems[Number(item.dataset.index)]);
});

// 鼠标移动同步键盘高亮位置
historyList.addEventListener('mousemove', (ev) => {
  const item = ev.target.closest('.sh-item');
  setActiveIndex(item ? Number(item.dataset.index) : -1);
});

historyClear.addEventListener('click', clearHistory);

// 点击搜索区以外的位置收起历史
document.addEventListener('click', (ev) => {
  if (historyPanel.hidden) return;
  if (historyPanel.contains(ev.target) || searchContainer.contains(ev.target)) return;
  closeHistory();
});


/* ════════════════════════════════
   4. 快捷方式 — 数据层
════════════════════════════════ */
const STORAGE_KEY = 'lumina-shortcuts';

const DEFAULT_SHORTCUTS = [
  { id: 1, name: 'GitHub',   url: 'https://github.com' },
  { id: 2, name: 'YouTube',  url: 'https://youtube.com' },
  { id: 3, name: '知乎',     url: 'https://zhihu.com' },
  { id: 4, name: '哔哩哔哩', url: 'https://bilibili.com' },
  { id: 5, name: 'ChatGPT',  url: 'https://chat.openai.com' },
  { id: 6, name: '掘金',     url: 'https://juejin.cn' },
];

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_SHORTCUTS;
  } catch { return DEFAULT_SHORTCUTS; }
}

function saveShortcuts(list, shouldSync = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  if (shouldSync) {
    triggerAutoUpload('shortcuts_change');
  }
}

/* ════════════════════════════════
   ICON FETCH AND CACHE LOGIC
════════════════════════════════ */
const ICON_STORAGE_KEY = 'lumina-icons';

function getSavedIcon(hostname) {
  try {
    const raw = localStorage.getItem(ICON_STORAGE_KEY);
    const icons = raw ? JSON.parse(raw) : {};
    return icons[hostname] || null;
  } catch { return null; }
}

function saveIconToStorage(hostname, base64) {
  try {
    const raw = localStorage.getItem(ICON_STORAGE_KEY);
    const icons = raw ? JSON.parse(raw) : {};
    icons[hostname] = base64;
    localStorage.setItem(ICON_STORAGE_KEY, JSON.stringify(icons));
  } catch (e) {
    console.error("保存图标失败:", e);
  }
}

async function fetchAndSaveIcon(url, hostname, force = false) {
  const fetchUrl = `https://icon.horse/icon/${hostname}` + (force ? `?_t=${Date.now()}` : '');
  try {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error('Fetch failed');
    const blob = await res.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        saveIconToStorage(hostname, base64);
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("获取图标异常:", err);
    return null;
  }
}

function getInitials(name) { return name.charAt(0).toUpperCase(); }

function getColorForName(name) {
  const colors = [
    '#7c6fef','#43c6d5','#f59e0b','#ec4899','#10b981',
    '#3b82f6','#ef4444','#8b5cf6','#14b8a6','#f97316',
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function buildFavicon(item) {
  const div = document.createElement('div');
  div.className = 'shortcut-favicon';
  
  let hostname;
  try {
    hostname = new URL(item.url).hostname;
  } catch {
    div.textContent = getInitials(item.name);
    Object.assign(div.style, { background: getColorForName(item.name), color: '#fff', fontSize: '18px', fontWeight: '700' });
    return div;
  }
  
  const savedBase64 = getSavedIcon(hostname);
  
  function applyFallback() {
    div.innerHTML = '';
    div.textContent = getInitials(item.name);
    Object.assign(div.style, {
      background: getColorForName(item.name),
      color: '#fff', fontSize: '18px', fontWeight: '700',
    });
  }

  if (savedBase64) {
    const img = document.createElement('img');
    img.src = savedBase64;
    img.alt = item.name;
    img.onerror = applyFallback;
    div.appendChild(img);
  } else {
    const img = document.createElement('img');
    img.src = `https://icon.horse/icon/${hostname}`;
    img.alt = item.name;
    img.onerror = applyFallback;
    div.appendChild(img);
    
    // 静默获取并保存到本地（以便下次进新标签页时立即读取不闪烁）
    fetchAndSaveIcon(item.url, hostname, false);
  }
  return div;
}


/* ════════════════════════════════
   4-A. 快捷方式右键菜单与操作状态
════════════════════════════════ */
const contextMenu   = document.getElementById('context-menu');
const ctxOpenNew    = document.getElementById('ctx-open-new');
const ctxCopyUrl    = document.getElementById('ctx-copy-url');
const ctxRefreshIcon = document.getElementById('ctx-refresh-icon');
const ctxEdit       = document.getElementById('ctx-edit');
const ctxDelete     = document.getElementById('ctx-delete');

let activeContextCard = null; // 当前右键激活的卡片元素
let activeContextItem = null; // 当前右键激活的数据项

function hideContextMenu() {
  if (contextMenu) contextMenu.hidden = true;
  if (activeContextCard) {
    activeContextCard.classList.remove('actions-visible');
    activeContextCard = null;
  }
  activeContextItem = null;
}

function showContextMenu(e, cardEl, item) {
  e.preventDefault();
  e.stopPropagation();

  // 如果已有其他激活的卡片，先清理
  if (activeContextCard && activeContextCard !== cardEl) {
    activeContextCard.classList.remove('actions-visible');
  }

  activeContextCard = cardEl;
  activeContextItem = item;
  cardEl.classList.add('actions-visible');

  if (!contextMenu) return;

  contextMenu.hidden = false;

  // 计算边界防止超出屏幕
  const menuWidth = 175;
  const menuHeight = 160;
  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 12;
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 12;
  }

  contextMenu.style.left = `${Math.max(10, x)}px`;
  contextMenu.style.top  = `${Math.max(10, y)}px`;
}

// 绑定右键菜单各项的动作
if (ctxOpenNew) {
  ctxOpenNew.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeContextItem) {
      window.open(activeContextItem.url, '_blank');
    }
    hideContextMenu();
  });
}

if (ctxCopyUrl) {
  ctxCopyUrl.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (activeContextItem) {
      try {
        await navigator.clipboard.writeText(activeContextItem.url);
      } catch {
        const inp = document.createElement('input');
        inp.value = activeContextItem.url;
        document.body.appendChild(inp);
        inp.select();
        document.execCommand('copy');
        inp.remove();
      }
      const span = ctxCopyUrl.querySelector('span');
      if (span) {
        const orig = span.textContent;
        span.textContent = '已复制！';
        setTimeout(() => {
          span.textContent = orig;
          hideContextMenu();
        }, 500);
        return;
      }
    }
    hideContextMenu();
  });
}

if (ctxRefreshIcon) {
  ctxRefreshIcon.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (activeContextItem) {
      try {
        const hostname = new URL(activeContextItem.url).hostname;
        const iconSpan = ctxRefreshIcon.querySelector('span');
        const orig = iconSpan.textContent;
        iconSpan.textContent = '获取中...';
        
        const base64 = await fetchAndSaveIcon(activeContextItem.url, hostname, true);
        if (base64) {
          iconSpan.textContent = '获取成功';
          if (activeContextCard) {
            const img = activeContextCard.querySelector('.shortcut-favicon img');
            if (img) {
              img.src = base64;
            } else {
              const favEl = activeContextCard.querySelector('.shortcut-favicon');
              favEl.innerHTML = '';
              Object.assign(favEl.style, { background: 'rgba(255,255,255,0.15)', color: '' });
              const newImg = document.createElement('img');
              newImg.src = base64;
              newImg.alt = activeContextItem.name;
              favEl.appendChild(newImg);
            }
          }
        } else {
          iconSpan.textContent = '获取失败';
        }
        setTimeout(() => {
          iconSpan.textContent = orig;
          hideContextMenu();
        }, 800);
        return;
      } catch (err) {}
    }
    hideContextMenu();
  });
}

if (ctxEdit) {
  ctxEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeContextItem) {
      const id = activeContextItem.id;
      hideContextMenu();
      openEditModal(id);
    } else {
      hideContextMenu();
    }
  });
}

if (ctxDelete) {
  ctxDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeContextItem) {
      const id = activeContextItem.id;
      hideContextMenu();
      deleteShortcut(id);
    } else {
      hideContextMenu();
    }
  });
}

// 全局点击、滚动、按下 Escape 时关闭右键菜单
document.addEventListener('click', (e) => {
  if (contextMenu && !contextMenu.contains(e.target) && (!activeContextCard || !activeContextCard.contains(e.target))) {
    hideContextMenu();
  }
});
window.addEventListener('resize', hideContextMenu);
window.addEventListener('scroll', hideContextMenu, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideContextMenu();
  }
});


/* ════════════════════════════════
   4-B. 丝滑拖拽（Pointer Events + FLIP 实时交换位置）
════════════════════════════════ */
const shortcutsGrid = document.getElementById('shortcuts-grid');

let dragSession = null;

/**
 * 记录 FLIP 动画：First 状态
 */
function recordCardRects() {
  const rects = new Map();
  shortcutsGrid.querySelectorAll('.shortcut-card').forEach(card => {
    rects.set(card, card.getBoundingClientRect());
  });
  return rects;
}

/**
 * 播放 FLIP 动画：Last -> Invert -> Play
 */
function animateFLIP(firstRects) {
  const cards = Array.from(shortcutsGrid.querySelectorAll('.shortcut-card'));
  cards.forEach(card => {
    if (card === dragSession?.placeholder) return;
    const first = firstRects.get(card);
    if (!first) return;
    const last = card.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;

    if (dx !== 0 || dy !== 0) {
      card.classList.remove('animate-move');
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      // 强制重绘
      void card.offsetWidth;
      card.classList.add('animate-move');
      card.style.transform = '';

      card.addEventListener('transitionend', function handler() {
        card.classList.remove('animate-move');
        card.removeEventListener('transitionend', handler);
      }, { once: true });
    }
  });
}

/**
 * 查找指针当前最匹配的卡片位置
 */
function findSwapTarget(clientX, clientY, placeholderEl) {
  const cards = Array.from(shortcutsGrid.querySelectorAll('.shortcut-card:not(.drag-placeholder)'));
  if (!cards.length) return null;

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return { card, rect };
    }
  }

  // 如果稍微在卡片边缘外，按中心欧式距离寻找最近卡片（阈值 60px 内）
  let closest = null;
  let minDistance = 70;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    if (dist < minDistance) {
      minDistance = dist;
      closest = { card, rect };
    }
  }

  return closest;
}

/**
 * 绑定 Pointer 拖拽
 */
function bindPointerDrag(cardEl, item) {
  let startX = 0;
  let startY = 0;
  let isPointerDown = false;
  let didDrag = false;

  cardEl.addEventListener('pointerdown', (e) => {
    // 仅支持鼠标主键 (左键 0) 或触控，且不能点击在操作按钮上
    if (e.button !== 0) return;
    if (e.target.closest('.action-btn')) return;

    isPointerDown = true;
    didDrag = false;
    startX = e.clientX;
    startY = e.clientY;

    const initialRect = cardEl.getBoundingClientRect();
    const offsetX = e.clientX - initialRect.left;
    const offsetY = e.clientY - initialRect.top;

    function onPointerMove(moveEvent) {
      if (!isPointerDown) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      // 超过阈值后正式启动拖拽
      if (!didDrag) {
        if (Math.hypot(deltaX, deltaY) < 6) return;

        didDrag = true;
        hideContextMenu();

        // 创建跟手幽灵卡片
        const ghost = cardEl.cloneNode(true);
        ghost.className = 'shortcut-drag-ghost';
        ghost.classList.remove('actions-visible', 'animate-move');
        ghost.style.width  = `${initialRect.width}px`;
        ghost.style.height = `${initialRect.height}px`;
        ghost.style.left   = '0px';
        ghost.style.top    = '0px';
        const curX = moveEvent.clientX - offsetX;
        const curY = moveEvent.clientY - offsetY;
        ghost.style.transform = `translate3d(${curX}px, ${curY}px, 0) scale(1.08) rotate(2deg)`;
        document.body.appendChild(ghost);

        // 原卡片变成占位框
        cardEl.classList.add('drag-placeholder');
        shortcutsGrid.classList.add('is-dragging');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        dragSession = {
          originCard: cardEl,
          placeholder: cardEl,
          ghost,
          offsetX,
          offsetY,
          itemId: item.id
        };
      }

      if (!dragSession) return;

      // 使用 translate3d 进行 GPU 硬件加速位移
      const curX = moveEvent.clientX - dragSession.offsetX;
      const curY = moveEvent.clientY - dragSession.offsetY;
      dragSession.ghost.style.transform = `translate3d(${curX}px, ${curY}px, 0) scale(1.08) rotate(2deg)`;

      // 实时检测碰撞并进行 FLIP 重排
      const target = findSwapTarget(moveEvent.clientX, moveEvent.clientY, dragSession.placeholder);
      if (target && target.card !== dragSession.placeholder) {
        const targetEl = target.card;
        const rect = target.rect;
        const isAfter = (moveEvent.clientX > rect.left + rect.width / 2);

        // 防抖：若已经在目标元素紧邻的前/后位置且方向吻合，则不触发重复 DOM 移动
        const isDirectPrev = (dragSession.placeholder.nextElementSibling === targetEl);
        const isDirectNext = (dragSession.placeholder.previousElementSibling === targetEl);
        if (isDirectPrev && !isAfter) return;
        if (isDirectNext && isAfter) return;

        // 记录移动前位置 (First)
        const firstRects = recordCardRects();

        // 实时调整 DOM 节点
        if (isAfter) {
          targetEl.after(dragSession.placeholder);
        } else {
          targetEl.before(dragSession.placeholder);
        }

        // 执行丝滑 FLIP 动画 (Last -> Invert -> Play)
        animateFLIP(firstRects);
      }
    }

    function onPointerUp(upEvent) {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (!isPointerDown) return;
      isPointerDown = false;

      if (!didDrag) {
        // 未达到拖拽阈值：正常点击快捷方式，默认在新标签页打开
        if (cardEl.classList.contains('actions-visible')) {
          cardEl.classList.remove('actions-visible');
        }
        window.open(item.url, '_blank');
        return;
      }

      // 处理拖拽完成归位
      if (dragSession) {
        const placeholderRect = dragSession.placeholder.getBoundingClientRect();
        const ghost = dragSession.ghost;

        ghost.style.transition = 'all 0.24s cubic-bezier(0.2, 0, 0, 1)';
        ghost.style.transform  = `translate3d(${placeholderRect.left}px, ${placeholderRect.top}px, 0) scale(1) rotate(0deg)`;
        ghost.style.opacity    = '0.9';

        setTimeout(() => {
          if (ghost.parentElement) ghost.remove();
          if (dragSession?.placeholder) {
            dragSession.placeholder.classList.remove('drag-placeholder');
          }
          shortcutsGrid.classList.remove('is-dragging');

          // 根据当前 DOM 顺序持久化到存储
          const newOrderIds = Array.from(shortcutsGrid.querySelectorAll('.shortcut-card'))
            .map(c => Number(c.dataset.id));
          const currentList = loadShortcuts();
          const idMap = new Map(currentList.map(item => [item.id, item]));
          const reorderedList = newOrderIds.map(id => idMap.get(id)).filter(Boolean);

          saveShortcuts(reorderedList);
          dragSession = null;
        }, 240);
      }
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });

  // 鼠标中键在新标签打开
  cardEl.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      window.open(item.url, '_blank');
    }
  });

  // 阻止默认拖拽和图片拖拽
  cardEl.addEventListener('dragstart', (e) => e.preventDefault());
}


/* ════════════════════════════════
   4-C. 渲染网格
════════════════════════════════ */
function renderShortcuts() {
  shortcutsGrid.innerHTML = '';
  const list = loadShortcuts();

  list.forEach(item => {
    const a = document.createElement('div');
    a.className = 'shortcut-card';
    a.title = item.name;
    a.dataset.id = item.id;
    a.tabIndex = 0;
    a.setAttribute('role', 'button');

    // 键盘支持：回车键默认在新标签页打开
    a.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        window.open(item.url, '_blank');
      }
    });

    // Favicon
    a.appendChild(buildFavicon(item));

    // 标签
    const label = document.createElement('span');
    label.className = 'shortcut-label';
    label.textContent = item.name;
    a.appendChild(label);

    // ── 编辑按钮（铅笔，仅在右键唤起 actions-visible 时显示）
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>`;
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();
      openEditModal(item.id);
    });

    // ── 删除按钮（×，仅在右键唤起 actions-visible 时显示）
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn delete-btn';
    delBtn.title = '删除';
    delBtn.innerHTML = '&times;';
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();
      deleteShortcut(item.id);
    });

    a.appendChild(editBtn);
    a.appendChild(delBtn);

    // 右键上下文菜单与角标激活
    a.addEventListener('contextmenu', (e) => {
      showContextMenu(e, a, item);
    });

    // 丝滑指针拖拽 & 实时交换位置
    bindPointerDrag(a, item);

    shortcutsGrid.appendChild(a);
  });
}

function deleteShortcut(id) {
  saveShortcuts(loadShortcuts().filter(s => s.id !== id));
  renderShortcuts();
}

function addShortcut(name, url) {
  const list = loadShortcuts();
  list.push({ id: Date.now(), name, url });
  saveShortcuts(list);
  renderShortcuts();
}

function updateShortcut(id, name, url) {
  const list = loadShortcuts().map(s => s.id === id ? { ...s, name, url } : s);
  saveShortcuts(list);
  renderShortcuts();
}

renderShortcuts();


/* ════════════════════════════════
   5. 弹窗（添加 & 编辑 双模式）
════════════════════════════════ */
const addBtn       = document.getElementById('add-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.querySelector('.modal-title');
const modalCancel  = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const inputName    = document.getElementById('shortcut-name');
const inputUrl     = document.getElementById('shortcut-url');

let editingId = null;   // null = 添加模式；数字 = 编辑模式

function openAddModal() {
  editingId = null;
  inputName.value = '';
  inputUrl.value  = '';
  modalTitle.textContent   = '添加快捷方式';
  modalConfirm.textContent = '添加';
  modalOverlay.hidden = false;
  setTimeout(() => inputName.focus(), 50);
}

function openEditModal(id) {
  const item = loadShortcuts().find(s => s.id === id);
  if (!item) return;
  editingId = id;
  inputName.value = item.name;
  inputUrl.value  = item.url;
  modalTitle.textContent   = '编辑快捷方式';
  modalConfirm.textContent = '保存';
  modalOverlay.hidden = false;
  setTimeout(() => inputName.focus(), 50);
}

function closeModal() {
  modalOverlay.hidden = true;
  editingId = null;
}

addBtn.addEventListener('click', openAddModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

modalConfirm.addEventListener('click', () => {
  const name = inputName.value.trim();
  let   url  = inputUrl.value.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  if (editingId !== null) {
    updateShortcut(editingId, name, url);
  } else {
    addShortcut(name, url);
  }
  closeModal();
});

[inputName, inputUrl].forEach(inp => {
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modalConfirm.click();
    if (e.key === 'Escape') closeModal();
  });
});


/* ════════════════════════════════
   6. 键盘快捷键
════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeSettingsModal();
    hideContextMenu();
    closeHistory();
  }

  // 任意打字直接聚焦搜索框
  if (
    !e.metaKey && !e.ctrlKey && !e.altKey &&
    e.key.length === 1 &&
    document.activeElement !== searchInput &&
    !modalOverlay.contains(document.activeElement) &&
    !settingsOverlay.contains(document.activeElement)
  ) {
    searchInput.focus();
  }
});


/* ════════════════════════════════
   7. 设置面板与数据备份/恢复
════════════════════════════════ */
const settingsBtn       = document.getElementById('settings-btn');
const settingsOverlay   = document.getElementById('settings-overlay');
const settingsClose     = document.getElementById('settings-close');
const btnExportBackup   = document.getElementById('btn-export-backup');
const btnImportBackup   = document.getElementById('btn-import-backup');
const importFileInput   = document.getElementById('import-file-input');
const btnResetDefault   = document.getElementById('btn-reset-default');

function openSettingsModal() {
  if (settingsOverlay) settingsOverlay.hidden = false;
  updateGistUIState();
}

function closeSettingsModal() {
  if (settingsOverlay) settingsOverlay.hidden = true;
}

if (settingsBtn)     settingsBtn.addEventListener('click', openSettingsModal);
if (settingsClose)   settingsClose.addEventListener('click', closeSettingsModal);
if (settingsOverlay) {
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettingsModal();
  });
}

const GITHUB_CLIENT_ID       = 'Ov23li99f675EYLij8cq';
const GIST_TOKEN_KEY         = 'lumina-gist-token';
const GIST_REFRESH_TOKEN_KEY = 'lumina-gist-refresh-token';
const GIST_TOKEN_EXPIRES_KEY = 'lumina-gist-token-expires';
const GIST_ID_KEY            = 'lumina-gist-id';
const GIST_SYNC_TIME_KEY     = 'lumina-gist-sync-time';
const GIST_USER_KEY          = 'lumina-gist-user';
const GIST_SYNC_HISTORY_KEY  = 'lumina-gist-sync-history';
const GIST_LAST_VISIT_KEY    = 'lumina-last-page-visit';
const GIST_LAST_PULL_KEY     = 'lumina-last-auto-pull-time';
const GIST_FILENAME          = 'lumina-newtab-backup.json';
const AUTO_SYNC_INTERVAL     = 10 * 60 * 1000; // 超过 10 分钟自动静默拉取云端数据

let deviceAuthPollTimer  = null;
let autoUploadTimer      = null;

const gistStatusBadge    = document.getElementById('gist-status-badge');
const gistUnauthView     = document.getElementById('gist-unauth-view');
const gistAuthedView     = document.getElementById('gist-authed-view');
const btnGitHubLogin     = document.getElementById('btn-github-login');
const gistDeviceBox      = document.getElementById('gist-device-box');
const gistCodeText       = document.getElementById('gist-code-text');
const btnCopyCode        = document.getElementById('btn-copy-code');
const btnCancelAuth      = document.getElementById('btn-cancel-auth');

const gistUserAvatar     = document.getElementById('gist-user-avatar');
const gistUserName       = document.getElementById('gist-user-name');
const gistLinkedDesc     = document.getElementById('gist-linked-desc');
const gistLastSyncTime   = document.getElementById('gist-last-sync-time');
const toggleSyncHistory  = document.getElementById('toggle-sync-history');
const btnGistPush        = document.getElementById('btn-gist-push');
const btnGistPull        = document.getElementById('btn-gist-pull');
const btnGistDisconnect  = document.getElementById('btn-gist-disconnect');

// 历史记录同步开关状态
function isSyncHistoryEnabled() {
  return localStorage.getItem(GIST_SYNC_HISTORY_KEY) === 'true';
}

function setSyncHistoryEnabled(enabled) {
  localStorage.setItem(GIST_SYNC_HISTORY_KEY, enabled ? 'true' : 'false');
}

// 统一构建 Gist 云端备份 Payload（包含快捷方式、当前搜索引擎、按开关包含的搜索历史）
function buildGistPayload() {
  const payload = {
    app: 'Lumina New Tab',
    version: 1,
    updatedAt: new Date().toISOString(),
    shortcuts: loadShortcuts(),
    engine: currentEngine
  };
  if (isSyncHistoryEnabled()) {
    payload.history = loadHistory();
  }
  return payload;
}

// 防抖自动触发上传到 Gist
function triggerAutoUpload(reason = '') {
  const token = localStorage.getItem(GIST_TOKEN_KEY) || '';
  if (!token) return;

  if (autoUploadTimer) clearTimeout(autoUploadTimer);
  autoUploadTimer = setTimeout(() => {
    performGistPush({ silent: true, isAuto: true });
  }, 1000);
}

// 执行推送到云端 Gist 的核心函数（支持手动推送与后台自动同步）
async function performGistPush({ silent = false, isAuto = false } = {}) {
  const token = localStorage.getItem(GIST_TOKEN_KEY) || '';
  let gistId = localStorage.getItem(GIST_ID_KEY) || '';

  if (!token) {
    if (!silent) showToast('未连接 GitHub 账号', '⚠️');
    return;
  }

  const payload = buildGistPayload();

  try {
    if (!gistId) {
      gistId = await findExistingLuminaGist();
      if (!gistId) {
        gistId = await createLuminaGist(payload);
      }
      localStorage.setItem(GIST_ID_KEY, gistId);
    }

    const res = await fetchGitHubApi(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        description: 'Lumina New Tab 跨设备云端同步数据',
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(payload, null, 2)
          }
        }
      })
    });

    if (res.status === 401) throw new Error('Token 无效或已过期，请重新登录');
    if (res.status === 404) throw new Error('Gist 不存在，请断开后重新连接');
    if (!res.ok) throw new Error(`推送失败 (${res.status})`);

    localStorage.setItem(GIST_SYNC_TIME_KEY, payload.updatedAt);
    updateGistUIState();
    if (!silent) {
      showToast('已成功推送到云端！', '☁️');
    }
  } catch (err) {
    console.error('推送失败:', err);
    if (!silent) {
      showToast(err.message || '网络异常，推送失败', '❌');
    }
  }
}

// Toast 组件
const toastEl   = document.getElementById('toast');
const toastIcon = document.getElementById('toast-icon');
const toastMsg  = document.getElementById('toast-msg');
let toastTimer  = null;

function showToast(message, icon = '✓') {
  if (!toastEl) return;
  if (toastTimer) clearTimeout(toastTimer);
  toastIcon.textContent = icon;
  toastMsg.textContent  = message;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
    toastTimer = null;
  }, 2800);
}

// 格式化时间显示
function formatDateTime(dateInput) {
  if (!dateInput) return '暂无记录';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '暂无记录';
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

// 更新 GitHub Gist 状态与视图呈现
function updateGistUIState() {
  const token = localStorage.getItem(GIST_TOKEN_KEY) || '';
  const userStr = localStorage.getItem(GIST_USER_KEY) || '';
  const gistId = localStorage.getItem(GIST_ID_KEY) || '';
  const lastSync = localStorage.getItem(GIST_SYNC_TIME_KEY) || '';

  if (token && userStr) {
    let user = {};
    try { user = JSON.parse(userStr); } catch {}

    if (gistUnauthView) gistUnauthView.hidden = true;
    if (gistAuthedView) gistAuthedView.hidden = false;

    if (gistStatusBadge) {
      gistStatusBadge.textContent = '已连接';
      gistStatusBadge.className = 'sync-badge ready';
    }

    if (gistUserAvatar) {
      gistUserAvatar.src = user.avatar_url || 'icons/icon48.svg';
    }
    if (gistUserName) {
      gistUserName.textContent = user.name ? `${user.name} (@${user.login})` : `@${user.login || 'GitHub User'}`;
    }
    if (gistLinkedDesc) {
      gistLinkedDesc.textContent = gistId ? `云端 Gist ID: ${gistId.slice(0, 8)}... (自动同步)` : '就绪 (待创建云端存储)';
    }
    if (gistLastSyncTime) {
      gistLastSyncTime.textContent = formatDateTime(lastSync);
    }
  } else {
    if (gistUnauthView) gistUnauthView.hidden = false;
    if (gistAuthedView) gistAuthedView.hidden = true;
    if (gistDeviceBox) gistDeviceBox.hidden = true;

    if (gistStatusBadge) {
      gistStatusBadge.textContent = '未连接';
      gistStatusBadge.className = 'sync-badge unconfigured';
    }
    if (btnGitHubLogin) {
      btnGitHubLogin.disabled = false;
      const span = btnGitHubLogin.querySelector('span');
      if (span) span.textContent = '使用 GitHub 账号登录';
    }
  }
}

// 通用 GitHub API Headers
function getGitHubHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

// 刷新 GitHub Access Token（利用 Refresh Token 无感续期，6个月内有效）
let isRefreshingPromise = null;
async function refreshGistToken() {
  if (isRefreshingPromise) return isRefreshingPromise;

  isRefreshingPromise = (async () => {
    const refreshToken = localStorage.getItem(GIST_REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      if (data.access_token) {
        localStorage.setItem(GIST_TOKEN_KEY, data.access_token);
        if (data.refresh_token) {
          localStorage.setItem(GIST_REFRESH_TOKEN_KEY, data.refresh_token);
        }
        if (data.expires_in) {
          const expiresAt = Date.now() + Number(data.expires_in) * 1000;
          localStorage.setItem(GIST_TOKEN_EXPIRES_KEY, String(expiresAt));
        }
        return data.access_token;
      }
    } catch (err) {
      console.warn('刷新 GitHub Token 失败:', err);
    }
    return null;
  })();

  try {
    return await isRefreshingPromise;
  } finally {
    isRefreshingPromise = null;
  }
}

// 获取有效的 Gist Access Token（若临近过期且有 Refresh Token 则提前自动刷新）
async function getValidGistToken() {
  const token = localStorage.getItem(GIST_TOKEN_KEY) || '';
  if (!token) return '';

  const expiresStr = localStorage.getItem(GIST_TOKEN_EXPIRES_KEY);
  const refreshToken = localStorage.getItem(GIST_REFRESH_TOKEN_KEY);

  // 若存在过期时间与 refresh_token，且距离过期不足 5 分钟，则提前静默刷新
  if (expiresStr && refreshToken) {
    const expiresAt = Number(expiresStr);
    if (!isNaN(expiresAt) && Date.now() > (expiresAt - 5 * 60 * 1000)) {
      const refreshed = await refreshGistToken();
      if (refreshed) return refreshed;
    }
  }

  return token;
}

// 统一封装 GitHub API 请求（支持 401 时自动换取 Token 并静默重试一次）
async function fetchGitHubApi(url, options = {}) {
  let token = await getValidGistToken();
  if (!token) throw new Error('未连接 GitHub 账号');

  const headers = {
    ...getGitHubHeaders(token),
    ...(options.headers || {})
  };

  let res = await fetch(url, { ...options, headers });

  // 遇到 401 Unauthorized 且有 refresh_token 时，自动尝试刷新并重试
  if (res.status === 401 && localStorage.getItem(GIST_REFRESH_TOKEN_KEY)) {
    const newToken = await refreshGistToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  return res;
}

// 自动在用户的 Gist 列表中检索是否已有包含 lumina-newtab-backup.json 的 Gist
async function findExistingLuminaGist() {
  const res = await fetchGitHubApi('https://api.github.com/gists?per_page=100');
  if (!res.ok) throw new Error(`获取 Gist 列表失败 (${res.status})`);
  const gists = await res.json();
  if (!Array.isArray(gists)) return null;

  for (const g of gists) {
    if (g.files && g.files[GIST_FILENAME]) {
      return g.id;
    }
  }
  return null;
}

// 创建新的私有 Gist
async function createLuminaGist(payload) {
  const res = await fetchGitHubApi('https://api.github.com/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Lumina New Tab 跨设备云端同步数据',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `创建 Gist 失败 (${res.status})`);
  }
  const data = await res.json();
  return data.id;
}

// 判断 Token 是否已经过期（或距离过期不足 1 分钟）
function isTokenExpired() {
  const expiresStr = localStorage.getItem(GIST_TOKEN_EXPIRES_KEY);
  if (!expiresStr) return false;
  const expiresAt = Number(expiresStr);
  if (isNaN(expiresAt)) return false;
  return Date.now() >= (expiresAt - 60 * 1000);
}

// 确保在同步前获取有效 Token：若已过期则立即使用 refresh_token 刷新
async function ensureValidTokenForSync() {
  const token = localStorage.getItem(GIST_TOKEN_KEY) || '';
  const refreshToken = localStorage.getItem(GIST_REFRESH_TOKEN_KEY) || '';
  if (!token) return '';

  if (isTokenExpired() && refreshToken) {
    const refreshed = await refreshGistToken();
    if (refreshed) return refreshed;
  }
  return token;
}

// 从指定 Gist 拉取并应用数据（支持 silent 静默无感模式）
async function pullFromGistDirect(gistId, { silent = false } = {}) {
  const res = await fetchGitHubApi(`https://api.github.com/gists/${gistId}`);
  if (res.status === 401) throw new Error('Token 无效或已过期，请重新登录');
  if (!res.ok) throw new Error(`拉取 Gist 失败 (${res.status})`);

  const data = await res.json();
  const fileObj = data.files && data.files[GIST_FILENAME];
  if (!fileObj || !fileObj.content) {
    throw new Error('未找到有效的同步数据文件');
  }

  const cloudPayload = JSON.parse(fileObj.content);
  if (!cloudPayload || !Array.isArray(cloudPayload.shortcuts)) {
    throw new Error('云端备份数据损坏');
  }

  // 静默模式下对比云端与本地时间戳：若云端未发生更新，无感退出避免不必要的重绘
  const localSyncTime = localStorage.getItem(GIST_SYNC_TIME_KEY) || '';
  const cloudSyncTime = cloudPayload.updatedAt || '';
  if (silent && localSyncTime && cloudSyncTime) {
    const localMs = new Date(localSyncTime).getTime();
    const cloudMs = new Date(cloudSyncTime).getTime();
    if (!isNaN(localMs) && !isNaN(cloudMs) && cloudMs <= localMs) {
      return cloudSyncTime;
    }
  }

  // 1. 应用标签页快捷方式（不触发反向自动同步）
  saveShortcuts(cloudPayload.shortcuts, false);
  renderShortcuts();

  // 2. 应用搜索引擎设置（不触发反向自动同步）
  if (cloudPayload.engine && cloudPayload.engine in ENGINES) {
    applyEngine(cloudPayload.engine, false);
  }

  // 3. 应用搜索历史（若开启了历史上传/同步且云端有历史数据）
  if (isSyncHistoryEnabled() && Array.isArray(cloudPayload.history)) {
    saveHistory(cloudPayload.history, false);
    renderHistory();
  }

  const syncTime = cloudPayload.updatedAt || new Date().toISOString();
  localStorage.setItem(GIST_SYNC_TIME_KEY, syncTime);
  updateGistUIState();
  return syncTime;
}

// 登录成功后的全自动化处理：查用户信息、查已有 Gist、自动拉取或自动新建
async function handleLoginSuccess(authData) {
  if (deviceAuthPollTimer) {
    clearInterval(deviceAuthPollTimer);
    deviceAuthPollTimer = null;
  }

  const token = typeof authData === 'string' ? authData : (authData && authData.access_token);
  const refreshToken = typeof authData === 'object' && authData ? authData.refresh_token : null;
  const expiresIn = typeof authData === 'object' && authData ? authData.expires_in : null;

  if (!token) {
    showToast('登录返回数据异常', '❌');
    updateGistUIState();
    return;
  }

  try {
    // 1. 获取用户信息
    const userRes = await fetch('https://api.github.com/user', {
      headers: getGitHubHeaders(token)
    });
    if (!userRes.ok) throw new Error(`获取用户信息失败 (${userRes.status})`);
    const userData = await userRes.json();
    const userSave = {
      login: userData.login,
      avatar_url: userData.avatar_url,
      name: userData.name || userData.login
    };

    localStorage.setItem(GIST_TOKEN_KEY, token);
    if (refreshToken) {
      localStorage.setItem(GIST_REFRESH_TOKEN_KEY, refreshToken);
    } else {
      localStorage.removeItem(GIST_REFRESH_TOKEN_KEY);
    }
    if (expiresIn) {
      const expiresAt = Date.now() + Number(expiresIn) * 1000;
      localStorage.setItem(GIST_TOKEN_EXPIRES_KEY, String(expiresAt));
    } else {
      localStorage.removeItem(GIST_TOKEN_EXPIRES_KEY);
    }
    localStorage.setItem(GIST_USER_KEY, JSON.stringify(userSave));

    // 2. 自动检查云端是否已存在 Gist 同步数据
    let gistId = await findExistingLuminaGist();

    if (gistId) {
      // 已有云端数据 -> 直接绑定并拉取覆盖本地，完成同步
      localStorage.setItem(GIST_ID_KEY, gistId);
      await pullFromGistDirect(gistId);
      showToast(`欢迎回来 @${userData.login}！已自动同步云端标签页`, '☁️');
    } else {
      // 首次使用 -> 自动在后台创建私有 Gist
      const payload = buildGistPayload();
      gistId = await createLuminaGist(payload);
      localStorage.setItem(GIST_ID_KEY, gistId);
      localStorage.setItem(GIST_SYNC_TIME_KEY, payload.updatedAt);
      showToast(`欢迎 @${userData.login}！已自动创建私有云端 Gist`, '☁️');
    }

    updateGistUIState();
  } catch (err) {
    console.error('初始化登录云端数据失败:', err);
    showToast(err.message || '网络连接异常', '❌');
    updateGistUIState();
  }
}

// 轮询换取 Access Token
function pollDeviceToken(deviceCode, intervalSec, deadline) {
  if (deviceAuthPollTimer) clearInterval(deviceAuthPollTimer);

  let currentInterval = Math.max(intervalSec, 5) * 1000;

  const checkToken = async () => {
    if (Date.now() > deadline) {
      clearInterval(deviceAuthPollTimer);
      deviceAuthPollTimer = null;
      showToast('授权超时，请重试', '⚠️');
      updateGistUIState();
      return;
    }

    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });

      const data = await res.json().catch(() => ({}));

      if (data.access_token) {
        clearInterval(deviceAuthPollTimer);
        deviceAuthPollTimer = null;
        await handleLoginSuccess(data);
        return;
      }

      if (data.error === 'authorization_pending') {
        // 用户仍在授权页面操作，继续等待
        return;
      }

      if (data.error === 'slow_down') {
        currentInterval += 5000;
        clearInterval(deviceAuthPollTimer);
        deviceAuthPollTimer = setInterval(checkToken, currentInterval);
        return;
      }

      if (data.error === 'expired_token') {
        clearInterval(deviceAuthPollTimer);
        deviceAuthPollTimer = null;
        showToast('授权码已过期，请重新登录', '⚠️');
        updateGistUIState();
        return;
      }

      if (data.error === 'access_denied') {
        clearInterval(deviceAuthPollTimer);
        deviceAuthPollTimer = null;
        showToast('已取消授权', '✕');
        updateGistUIState();
        return;
      }
    } catch (err) {
      console.warn('轮询授权状态异常:', err);
    }
  };

  deviceAuthPollTimer = setInterval(checkToken, currentInterval);
}

// 初始化 GitHub Gist 同步模块
function initGistSync() {
  updateGistUIState();

  // 点击“使用 GitHub 账号登录”
  if (btnGitHubLogin) {
    btnGitHubLogin.addEventListener('click', async () => {
      btnGitHubLogin.disabled = true;
      const span = btnGitHubLogin.querySelector('span');
      if (span) span.textContent = '正在发起授权请求…';

      try {
        const res = await fetch('https://github.com/login/device/code', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            scope: 'gist'
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error_description || errData.error || `请求失败 (${res.status})`);
        }

        const data = await res.json();
        const { device_code, user_code, verification_uri, expires_in, interval } = data;

        // 自动复制验证码到剪贴板，方便用户在打开的网页直接粘贴
        try {
          await navigator.clipboard.writeText(user_code);
          showToast(`验证码 ${user_code} 已复制！`, '📋');
        } catch {}

        if (gistCodeText) gistCodeText.textContent = user_code;
        if (gistDeviceBox) gistDeviceBox.hidden = false;
        if (span) span.textContent = '等待网页端授权确认…';

        // 自动打开 GitHub 官方授权页面
        window.open(verification_uri, '_blank');

        // 开始轮询换取 Access Token
        const deadline = Date.now() + (expires_in || 900) * 1000;
        pollDeviceToken(device_code, interval || 5, deadline);
      } catch (err) {
        console.error('发起 Device Flow 失败:', err);
        showToast(err.message || '网络异常，发起登录失败', '❌');
        btnGitHubLogin.disabled = false;
        if (span) span.textContent = '使用 GitHub 账号登录';
      }
    });
  }

  // 复制验证码按钮
  if (btnCopyCode && gistCodeText) {
    btnCopyCode.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(gistCodeText.textContent.trim());
        showToast('验证码已复制', '📋');
      } catch {
        showToast('复制失败，请手动选取', '⚠️');
      }
    });
  }

  // 取消授权
  if (btnCancelAuth) {
    btnCancelAuth.addEventListener('click', () => {
      if (deviceAuthPollTimer) {
        clearInterval(deviceAuthPollTimer);
        deviceAuthPollTimer = null;
      }
      updateGistUIState();
      showToast('已取消授权', '✓');
    });
  }

  // 断开 GitHub 连接
  if (btnGistDisconnect) {
    btnGistDisconnect.addEventListener('click', () => {
      const ok = confirm('确定要断开与 GitHub 账号的连接吗？\n本地快捷方式不受影响，但将停止云端同步。');
      if (!ok) return;

      localStorage.removeItem(GIST_TOKEN_KEY);
      localStorage.removeItem(GIST_REFRESH_TOKEN_KEY);
      localStorage.removeItem(GIST_TOKEN_EXPIRES_KEY);
      localStorage.removeItem(GIST_USER_KEY);
      localStorage.removeItem(GIST_ID_KEY);
      localStorage.removeItem(GIST_SYNC_TIME_KEY);

      updateGistUIState();
      showToast('已断开连接', '✓');
    });
  }

  // 搜索历史上传开关初始化与监听
  if (toggleSyncHistory) {
    toggleSyncHistory.checked = isSyncHistoryEnabled();
    toggleSyncHistory.addEventListener('change', () => {
      const enabled = toggleSyncHistory.checked;
      setSyncHistoryEnabled(enabled);
      showToast(enabled ? '已开启搜索历史上传' : '已关闭搜索历史上传', '⚙️');
      // 开关变更后立即触发一次自动同步以更新云端
      triggerAutoUpload('history_toggle');
    });
  }

  // 手动推送到云端
  if (btnGistPush) {
    btnGistPush.addEventListener('click', async () => {
      btnGistPush.disabled = true;
      const span = btnGistPush.querySelector('span');
      const origText = span ? span.textContent : '推送到云端 (上传)';
      if (span) span.textContent = '正在推送…';

      try {
        await performGistPush({ silent: false, isAuto: false });
      } finally {
        btnGistPush.disabled = false;
        if (span) span.textContent = origText;
      }
    });
  }

  // 手动从云端拉取
  if (btnGistPull) {
    btnGistPull.addEventListener('click', async () => {
      const token = localStorage.getItem(GIST_TOKEN_KEY) || '';
      let gistId = localStorage.getItem(GIST_ID_KEY) || '';

      if (!token) {
        showToast('未连接 GitHub 账号', '⚠️');
        return;
      }

      btnGistPull.disabled = true;
      const span = btnGistPull.querySelector('span');
      const origText = span ? span.textContent : '从云端拉取 (下载)';
      if (span) span.textContent = '正在拉取…';

      try {
        if (!gistId) {
          gistId = await findExistingLuminaGist();
          if (!gistId) throw new Error('云端暂无可同步的备份数据');
          localStorage.setItem(GIST_ID_KEY, gistId);
        }

        await pullFromGistDirect(gistId);
        updateGistUIState();
        showToast('已从云端拉取并应用最新数据！', '✓');
      } catch (err) {
        console.error('拉取失败:', err);
        showToast(err.message || '网络异常，拉取失败', '❌');
      } finally {
        btnGistPull.disabled = false;
        if (span) span.textContent = origText;
      }
    });
  }

  // 页面进入或切回前台时，检测是否超过 10 分钟并执行无感同步
  async function checkAndPerformAutoPull() {
    const token = localStorage.getItem(GIST_TOKEN_KEY);
    if (!token) return; // 未登录 GitHub 直接跳过

    const now = Date.now();
    const lastVisitStr = localStorage.getItem(GIST_LAST_VISIT_KEY);
    const lastPullStr  = localStorage.getItem(GIST_LAST_PULL_KEY);

    const lastVisit = lastVisitStr ? Number(lastVisitStr) : 0;
    const lastPull  = lastPullStr ? Number(lastPullStr) : 0;

    // 判断是否满足 10 分钟无感拉取条件：
    // 1. 距离上次离开/进入页面超过 10 分钟（如重新启动浏览器、长期未打开新标签页）
    // 2. 距离上次自动拉取已超过 10 分钟
    // 3. 首次使用记录
    const isVisitOver10Min = !lastVisit || (now - lastVisit) >= AUTO_SYNC_INTERVAL;
    const isPullOver10Min  = !lastPull  || (now - lastPull) >= AUTO_SYNC_INTERVAL;

    // 记录本次活跃时间
    localStorage.setItem(GIST_LAST_VISIT_KEY, String(now));

    if (isVisitOver10Min || isPullOver10Min) {
      localStorage.setItem(GIST_LAST_PULL_KEY, String(now));

      try {
        // 1. 检查 Token：若过期则立即尝试用 refresh_token 刷新
        const validToken = await ensureValidTokenForSync();
        if (!validToken) return;

        // 2. 获取云端 Gist ID
        let gistId = localStorage.getItem(GIST_ID_KEY) || '';
        if (!gistId) {
          gistId = await findExistingLuminaGist();
          if (!gistId) return;
          localStorage.setItem(GIST_ID_KEY, gistId);
        }

        // 3. 执行静默无感拉取（比对时间戳，有变化则更新并重绘，全程零弹窗）
        await pullFromGistDirect(gistId, { silent: true });
      } catch (err) {
        console.warn('无感云端拉取跳过或失败:', err);
      }
    }
  }

  // 1. 每次打开新标签页进入页面时立即检查
  checkAndPerformAutoPull();

  // 2. 标签页从后台切回前台时检查（应对浏览器长时间打开未关的情况）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAndPerformAutoPull();
    } else {
      localStorage.setItem(GIST_LAST_VISIT_KEY, String(Date.now()));
    }
  });

  // 3. 页面关闭/卸载前更新离开时间
  window.addEventListener('pagehide', () => {
    localStorage.setItem(GIST_LAST_VISIT_KEY, String(Date.now()));
  });
}

initGistSync();

// 导出本地 JSON 备份文件
if (btnExportBackup) {
  btnExportBackup.addEventListener('click', () => {
    try {
      const backupData = {
        app: 'Lumina',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: {
          shortcuts: loadShortcuts(),
          engine: currentEngine,
          history: isSyncHistoryEnabled() ? loadHistory() : undefined
        }
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const datePart = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const filename = `lumina_backup_${datePart}.json`;

      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      showToast('备份文件已成功导出！', '📥');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('导出备份失败，请重试', '✕');
    }
  });
}

// 导入恢复本地备份文件
if (btnImportBackup && importFileInput) {
  btnImportBackup.addEventListener('click', () => {
    importFileInput.value = '';
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);

        // 提取 shortcuts 数组（兼容直接是数组或包含在 data 字段中的结构）
        let importedShortcuts = null;
        let importedEngine = null;

        if (Array.isArray(parsed)) {
          importedShortcuts = parsed;
        } else if (parsed && parsed.data && Array.isArray(parsed.data.shortcuts)) {
          importedShortcuts = parsed.data.shortcuts;
          importedEngine = parsed.data.engine;
        } else if (parsed && Array.isArray(parsed.shortcuts)) {
          importedShortcuts = parsed.shortcuts;
          importedEngine = parsed.engine;
        }

        if (!importedShortcuts || !importedShortcuts.length) {
          showToast('备份文件中未找到有效的快捷方式数据', '✕');
          return;
        }

        // 清洗与有效性校验
        const validShortcuts = importedShortcuts
          .filter(item => item && item.name && item.url)
          .map(item => {
            let url = String(item.url).trim();
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            return {
              id: item.id || Date.now() + Math.floor(Math.random() * 1000),
              name: String(item.name).trim().slice(0, 30),
              url
            };
          });

        if (!validShortcuts.length) {
          showToast('备份文件中的网址格式无效', '✕');
          return;
        }

        // 询问用户是覆盖恢复还是合并追加
        const currentList = loadShortcuts();
        let finalList = [];

        if (currentList.length > 0) {
          const isOverwrite = confirm(
            `成功解析出 ${validShortcuts.length} 个快捷方式！\n\n` +
            `点击【确定】= 完全覆盖现有快捷方式（恢复备份）\n` +
            `点击【取消】= 保留现有，仅合并追加新项目`
          );

          if (isOverwrite) {
            finalList = validShortcuts;
          } else {
            // 合并去重（根据 URL）
            const existingUrls = new Set(currentList.map(s => s.url.toLowerCase()));
            const toAppend = validShortcuts.filter(s => !existingUrls.has(s.url.toLowerCase()));
            finalList = [...currentList, ...toAppend];
          }
        } else {
          finalList = validShortcuts;
        }

        // 保存并持久化
        saveShortcuts(finalList);
        renderShortcuts();

        if (importedEngine && importedEngine in ENGINES) {
          applyEngine(importedEngine);
        }

        // 若备份中包含搜索历史且当前开启了历史同步，同步恢复
        const importedHistory = Array.isArray(parsed.data?.history)
          ? parsed.data.history
          : (Array.isArray(parsed.history) ? parsed.history : null);
        if (importedHistory && isSyncHistoryEnabled()) {
          saveHistory(importedHistory);
          renderHistory();
        }

        closeSettingsModal();
        showToast(`成功恢复 ${finalList.length} 个快捷方式！`, '🎉');
      } catch (err) {
        console.error('Import parse error:', err);
        showToast('备份文件损坏或非标准 JSON 格式', '✕');
      }
    };
    reader.readAsText(file, 'utf-8');
  });
}

// 重置为默认预设
if (btnResetDefault) {
  btnResetDefault.addEventListener('click', () => {
    const ok = confirm('确定要将所有快捷方式恢复为初始默认配置吗？\n自定义的快捷方式将被重置。');
    if (!ok) return;

    saveShortcuts(DEFAULT_SHORTCUTS);
    renderShortcuts();
    closeSettingsModal();
    showToast('已恢复为初始默认配置', '↺');
  });
}
