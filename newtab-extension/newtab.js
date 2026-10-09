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

function applyEngine(key, syncToCloud = true) {
  const e = ENGINES[key] || ENGINES.google;
  currentEngine = key in ENGINES ? key : 'google';
  engineIcon.innerHTML = e.svg;
  engineBtn.title = `当前搜索引擎：${e.name}（点击切换）`;
  localStorage.setItem('lumina-engine', currentEngine);
  if (syncToCloud && typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.set({ 'lumina-engine': currentEngine });
  }
}

applyEngine(currentEngine);

// 点击引擎按钮：切换显示/隐藏，阻止事件继续冒泡
engineBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
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

function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  // 判断是否是 URL
  const isUrl = /^(https?:\/\/|www\.)/i.test(q) || /^[\w-]+\.\w{2,}/.test(q);
  const targetUrl = isUrl
    ? (/^https?:\/\//i.test(q) ? q : 'https://' + q)
    : ENGINES[currentEngine].url + encodeURIComponent(q);

  // 默认在新标签页打开
  window.open(targetUrl, '_blank');
}

searchSubmit.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
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

function saveShortcuts(list, syncToCloud = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  if (syncToCloud && typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.set({ [STORAGE_KEY]: list });
  }
}

/**
 * 云端同步引擎初始化（兼容 Microsoft Edge 微软账号与 Chrome 谷歌账号）
 */
function initSyncStorage() {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) return;

  chrome.storage.sync.get([STORAGE_KEY, 'lumina-engine'], (res) => {
    let shouldRerender = false;

    // 同步快捷方式
    if (res && res[STORAGE_KEY] && Array.isArray(res[STORAGE_KEY])) {
      const localRaw = localStorage.getItem(STORAGE_KEY);
      const cloudRaw = JSON.stringify(res[STORAGE_KEY]);
      if (localRaw !== cloudRaw) {
        localStorage.setItem(STORAGE_KEY, cloudRaw);
        shouldRerender = true;
      }
    } else {
      // 云端尚无数据：上传本地当前数据到云端
      const localList = loadShortcuts();
      chrome.storage.sync.set({ [STORAGE_KEY]: localList });
    }

    // 同步搜索引擎
    if (res && res['lumina-engine'] && res['lumina-engine'] in ENGINES) {
      if (res['lumina-engine'] !== currentEngine) {
        applyEngine(res['lumina-engine'], false);
      }
    } else {
      chrome.storage.sync.set({ 'lumina-engine': currentEngine });
    }

    if (shouldRerender) {
      renderShortcuts();
    }
  });

  // 监听远程设备或同账号其他窗口的同步更新
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    if (changes[STORAGE_KEY]) {
      const newList = changes[STORAGE_KEY].newValue;
      if (Array.isArray(newList)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
        renderShortcuts();
        showToast('已同步来自云端的快捷方式', '☁️');
      }
    }

    if (changes['lumina-engine']) {
      const newEng = changes['lumina-engine'].newValue;
      if (newEng && newEng in ENGINES) {
        applyEngine(newEng, false);
        showToast('已同步搜索引擎设置', '☁️');
      }
    }
  });
}

initSyncStorage();

function getFaviconUrl(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}`;
  } catch { return null; }
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
  const faviconUrl = getFaviconUrl(item.url);
  if (faviconUrl) {
    const img = document.createElement('img');
    img.src = faviconUrl;
    img.alt = item.name;
    img.onerror = () => {
      img.remove();
      div.textContent = getInitials(item.name);
      Object.assign(div.style, {
        background: getColorForName(item.name),
        color: '#fff', fontSize: '18px', fontWeight: '700',
      });
    };
    div.appendChild(img);
  } else {
    div.textContent = getInitials(item.name);
    Object.assign(div.style, {
      background: getColorForName(item.name),
      color: '#fff', fontSize: '18px', fontWeight: '700',
    });
  }
  return div;
}


/* ════════════════════════════════
   4-A. 快捷方式右键菜单与操作状态
════════════════════════════════ */
const contextMenu   = document.getElementById('context-menu');
const ctxOpenNew    = document.getElementById('ctx-open-new');
const ctxCopyUrl    = document.getElementById('ctx-copy-url');
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
const btnSyncNow        = document.getElementById('btn-sync-now');
const btnExportBackup   = document.getElementById('btn-export-backup');
const btnImportBackup   = document.getElementById('btn-import-backup');
const importFileInput   = document.getElementById('import-file-input');
const btnResetDefault   = document.getElementById('btn-reset-default');
const syncStatusBadge   = document.getElementById('sync-status-badge');
const syncProviderDesc  = document.getElementById('sync-provider-desc');

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
  }, 2400);
}

// 识别 Microsoft Edge 浏览器与设置环境描述
function initSettingsEnvironment() {
  const isEdge = /Edg\//i.test(navigator.userAgent);
  if (isEdge) {
    if (syncStatusBadge) syncStatusBadge.textContent = 'Microsoft 账号已连接';
    if (syncProviderDesc) {
      syncProviderDesc.innerHTML = '已检测到 <strong>Microsoft Edge</strong> 浏览器，数据通过您的 <strong>Microsoft 微软账号</strong> 云端跨设备自动无缝同步。';
    }
  } else {
    if (syncStatusBadge) syncStatusBadge.textContent = '云端同步已连接';
    if (syncProviderDesc) {
      syncProviderDesc.innerHTML = '基于当前浏览器账号原生同步服务，数据随您的浏览器账号跨设备自动实时同步。';
    }
  }
}

initSettingsEnvironment();

function openSettingsModal() {
  settingsOverlay.hidden = false;
}

function closeSettingsModal() {
  settingsOverlay.hidden = true;
}

if (settingsBtn)     settingsBtn.addEventListener('click', openSettingsModal);
if (settingsClose)   settingsClose.addEventListener('click', closeSettingsModal);
if (settingsOverlay) {
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettingsModal();
  });
}

// 立即手动同步云端
if (btnSyncNow) {
  btnSyncNow.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      btnSyncNow.disabled = true;
      const span = btnSyncNow.querySelector('span');
      if (span) span.textContent = '正在同步…';

      // 将本地数据推送到云端并拉取最新
      const localShortcuts = loadShortcuts();
      chrome.storage.sync.set({
        [STORAGE_KEY]: localShortcuts,
        'lumina-engine': currentEngine
      }, () => {
        setTimeout(() => {
          btnSyncNow.disabled = false;
          if (span) span.textContent = '立即同步云端';
          showToast('云端数据同步成功！', '☁️');
        }, 400);
      });
    } else {
      showToast('本地缓存已刷新', '✓');
    }
  });
}

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
          engine: currentEngine
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
