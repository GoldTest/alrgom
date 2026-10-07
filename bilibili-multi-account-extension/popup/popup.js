import { Storage } from '../utils/storage.js';

// 当前轮询定时器引用
let qrPollTimer = null;
let currentRoomId = null;

// DOM 元素缓存
const elements = {
  // Tabs
  navTabs: document.querySelectorAll('.nav-tab'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  
  // 网页同步与账号模块
  browserLoginBadge: document.getElementById('browser-login-badge'),
  btnSyncCurrent: document.getElementById('btn-sync-current'),
  btnLoginNew: document.getElementById('btn-login-new'),
  btnAddAccountQr: document.getElementById('btn-add-account-qr'),
  accountList: document.getElementById('account-list'),
  emptyAccountTip: document.getElementById('empty-account-tip'),
  accountCountText: document.getElementById('account-count-text'),

  // 扫码弹窗
  qrModal: document.getElementById('qr-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  qrCanvas: document.getElementById('qr-canvas'),
  qrMask: document.getElementById('qr-mask'),
  btnRefreshQr: document.getElementById('btn-refresh-qr'),
  qrStatusMsg: document.getElementById('qr-status-msg'),

  // 直播模块
  liveRoomIdInput: document.getElementById('live-room-id'),
  btnCheckRoom: document.getElementById('btn-check-room'),
  btnRefreshLive: document.getElementById('btn-refresh-live'),
  roomStatusBadge: document.getElementById('room-status-badge'),
  roomStatusText: document.getElementById('room-status-text'),
  activeSendCount: document.getElementById('active-send-count'),
  danmakuInput: document.getElementById('danmaku-input'),
  charCounter: document.getElementById('char-counter'),
  btnSendDanmaku: document.getElementById('btn-send-danmaku'),
  btnSendGift: document.getElementById('btn-send-gift'),
  sendResultsBox: document.getElementById('send-results-box'),
  resultsList: document.getElementById('results-list'),

  // 设置模块
  settingAutoRefresh: document.getElementById('setting-auto-refresh'),
  settingDelayMin: document.getElementById('setting-delay-min'),
  settingDelayMax: document.getElementById('setting-delay-max'),
  btnSaveSettings: document.getElementById('btn-save-settings')
};

// ======================= 初始化与导航 =======================

async function init() {
  setupTabs();
  setupEventListeners();
  await handleSyncCurrentAccount(false);
  await loadAccounts();
  await detectActiveLiveRoom();
  await loadSettings();
}

function setupTabs() {
  elements.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.navTabs.forEach(t => t.classList.remove('active'));
      elements.tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');
    });
  });
}

function setupEventListeners() {
  // 网页同步与快捷登录
  elements.btnSyncCurrent.addEventListener('click', () => handleSyncCurrentAccount(true));
  elements.btnLoginNew.addEventListener('click', handleLoginNewAccount);
  elements.btnAddAccountQr.addEventListener('click', openQrModal);

  // 扫码弹窗
  elements.btnCloseModal.addEventListener('click', closeQrModal);
  elements.btnRefreshQr.addEventListener('click', startQrLogin);

  // 直播相关
  elements.btnRefreshLive.addEventListener('click', detectActiveLiveRoom);
  elements.btnCheckRoom.addEventListener('click', handleManualCheckRoom);
  elements.danmakuInput.addEventListener('input', handleDanmakuInput);
  elements.btnSendDanmaku.addEventListener('click', handleSendDanmaku);
  if (elements.btnSendGift) {
    elements.btnSendGift.addEventListener('click', handleSendFreeGift);
  }

  // 保存设置
  elements.btnSaveSettings.addEventListener('click', handleSaveSettings);
}

// ======================= 网页账号同步与切换 =======================

/**
 * 抓取并同步当前浏览器网页已登录的 B站 账号
 */
async function handleSyncCurrentAccount(showFeedback = true) {
  if (showFeedback) {
    elements.btnSyncCurrent.disabled = true;
    elements.btnSyncCurrent.textContent = '正在检测...';
  }

  try {
    const res = await chrome.runtime.sendMessage({ action: 'SYNC_CURRENT_ACCOUNT' });
    if (res && res.success) {
      if (res.isLogin && res.account) {
        elements.browserLoginBadge.className = 'badge-online';
        elements.browserLoginBadge.textContent = `已登录: ${res.account.uname}`;
        if (showFeedback) {
          elements.btnSyncCurrent.textContent = '已同步 ✔';
        }
      } else {
        elements.browserLoginBadge.className = 'badge-offline';
        elements.browserLoginBadge.textContent = '网页未登录';
        if (showFeedback) {
          elements.btnSyncCurrent.textContent = '未检测到登录';
        }
      }
      await loadAccounts();
    }
  } catch (err) {
    console.warn('同步当前账号异常:', err);
    if (showFeedback) {
      alert(`同步异常: ${err.message}`);
    }
  } finally {
    if (showFeedback) {
      setTimeout(() => {
        elements.btnSyncCurrent.disabled = false;
        elements.btnSyncCurrent.textContent = '🔄 抓取当前网页账号';
      }, 1200);
    }
  }
}

/**
 * 退出当前网页登录，前往登录新账号
 */
async function handleLoginNewAccount() {
  const accounts = await Storage.getAccounts();
  const currentAccount = accounts.find(a => a.isCurrent);
  const msg = currentAccount 
    ? `当前登录账号【${currentAccount.uname}】已妥善保存在插件库中。\n\n点击“确定”将退出当前网页并前往 B站 登录页，登录新账号后插件将自动发现并入库。`
    : `即将前往 B站 登录页，登录新账号后插件将自动发现并入库。`;

  if (!confirm(msg)) return;

  elements.btnLoginNew.disabled = true;
  elements.btnLoginNew.textContent = '正在准备...';

  try {
    const res = await chrome.runtime.sendMessage({ action: 'PREPARE_LOGIN_NEW' });
    if (res && res.success) {
      elements.browserLoginBadge.className = 'badge-offline';
      elements.browserLoginBadge.textContent = '等待新号登录';
      await loadAccounts();
    }
  } catch (err) {
    alert(`准备登录失败: ${err.message}`);
  } finally {
    setTimeout(() => {
      elements.btnLoginNew.disabled = false;
      elements.btnLoginNew.textContent = '➕ 网页登录新账号';
    }, 1000);
  }
}

// ======================= 账号管理模块 =======================

async function loadAccounts() {
  const accounts = await Storage.getAccounts();
  elements.accountCountText.textContent = `共 ${accounts.length} 个账号`;
  
  const enabledCount = accounts.filter(a => a.enabled).length;
  elements.activeSendCount.textContent = enabledCount;
  updateSendButtonState();

  if (accounts.length === 0) {
    elements.accountList.innerHTML = '';
    elements.accountList.appendChild(elements.emptyAccountTip);
    return;
  }

  elements.accountList.innerHTML = '';
  accounts.forEach(account => {
    const card = renderAccountCard(account);
    elements.accountList.appendChild(card);
  });
}

function renderAccountCard(account) {
  const card = document.createElement('div');
  card.className = `account-card ${account.isCurrent ? 'is-main' : ''}`;
  card.dataset.mid = account.mid;

  card.innerHTML = `
    <div class="account-info">
      <img src="${account.face}" alt="avatar" class="account-avatar" onerror="this.src='https://static.hdslb.com/images/member/noface.gif'"/>
      <div class="account-meta">
        <div class="account-name-row">
          <span class="account-name" title="${escapeHtml(account.uname)}">${escapeHtml(account.uname)}</span>
          <span class="badge-level">Lv.${account.level ?? 0}</span>
          ${account.isCurrent ? '<span class="badge-main">当前主号</span>' : ''}
        </div>
        <div class="account-uid">UID: ${account.mid}</div>
      </div>
    </div>
    <div class="account-actions">
      <div class="action-left">
        <label class="switch" title="开启/关闭参与多账号群控">
          <input type="checkbox" class="toggle-account" ${account.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <span class="switch-label">${account.enabled ? '已启用' : '已停用'}</span>
      </div>
      <div class="action-btns">
        ${!account.isCurrent ? `<button class="btn btn-secondary btn-sm btn-set-main">设为主号</button>` : ''}
        <button class="btn btn-danger btn-sm btn-delete-account" title="删除账号">删除</button>
      </div>
    </div>
  `;

  // 开关切换
  const toggleInput = card.querySelector('.toggle-account');
  toggleInput.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    await chrome.runtime.sendMessage({
      action: 'TOGGLE_ACCOUNT',
      mid: account.mid,
      enabled: isEnabled
    });
    await loadAccounts();
  });

  // 设为主号
  const btnSetMain = card.querySelector('.btn-set-main');
  if (btnSetMain) {
    btnSetMain.addEventListener('click', async () => {
      btnSetMain.disabled = true;
      btnSetMain.textContent = '切换中...';
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'SWITCH_MAIN_ACCOUNT',
          mid: account.mid
        });
        if (res.success) {
          elements.browserLoginBadge.className = 'badge-online';
          elements.browserLoginBadge.textContent = `已登录: ${account.uname}`;
          await loadAccounts();
        } else {
          alert(`切换失败: ${res.error || '未知原因'}`);
        }
      } catch (err) {
        alert(`切换异常: ${err.message}`);
      }
    });
  }

  // 删除账号
  const btnDelete = card.querySelector('.btn-delete-account');
  btnDelete.addEventListener('click', async () => {
    if (confirm(`确定要移除账号【${account.uname}】吗？`)) {
      await chrome.runtime.sendMessage({
        action: 'DELETE_ACCOUNT',
        mid: account.mid
      });
      await loadAccounts();
    }
  });

  return card;
}

// ======================= 备用：扫码登录模块 =======================

async function openQrModal() {
  elements.qrModal.style.display = 'flex';
  await startQrLogin();
}

function closeQrModal() {
  elements.qrModal.style.display = 'none';
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
}

async function startQrLogin() {
  elements.qrMask.style.display = 'none';
  elements.qrStatusMsg.textContent = '正在获取登录二维码...';
  
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }

  try {
    const res = await chrome.runtime.sendMessage({ action: 'GET_QR_CODE' });
    if (!res || !res.success || !res.data) {
      throw new Error(res?.error || '获取二维码失败');
    }

    const { url, qrcode_key } = res.data;
    
    if (window.QRCode && window.QRCode.renderCanvas) {
      window.QRCode.renderCanvas(elements.qrCanvas, url, 180);
    }
    elements.qrStatusMsg.textContent = '请使用 哔哩哔哩 手机客户端扫码';

    startPolling(qrcode_key);
  } catch (err) {
    elements.qrStatusMsg.textContent = `生成失败: ${err.message}`;
  }
}

function startPolling(qrcodeKey) {
  qrPollTimer = setInterval(async () => {
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'POLL_QR_CODE',
        qrcodeKey
      });

      if (!res || !res.success) return;

      if (res.status === 'SUCCESS') {
        clearInterval(qrPollTimer);
        qrPollTimer = null;
        elements.qrStatusMsg.textContent = `🎉 登录成功: ${res.account.uname}`;
        setTimeout(async () => {
          closeQrModal();
          await loadAccounts();
        }, 1200);
      } else if (res.status === 86090) {
        elements.qrStatusMsg.textContent = '📱 已扫描，请在手机端确认登录';
      } else if (res.status === 86038) {
        clearInterval(qrPollTimer);
        qrPollTimer = null;
        elements.qrMask.style.display = 'flex';
        elements.qrStatusMsg.textContent = '二维码已失效';
      }
    } catch (err) {
      console.warn('轮询扫码状态错误:', err);
    }
  }, 1500);
}

// ======================= 直播群控发言与送礼模块 =======================

async function detectActiveLiveRoom() {
  try {
    elements.roomStatusText.textContent = '正在检测当前页面...';
    elements.roomStatusBadge.classList.remove('active');

    const res = await chrome.runtime.sendMessage({ action: 'GET_ACTIVE_LIVE_INFO' });
    if (res && res.success && res.inLive) {
      currentRoomId = res.realRoomId;
      elements.liveRoomIdInput.value = res.shortId;
      elements.roomStatusBadge.classList.add('active');
      elements.roomStatusText.textContent = `已连接直播间: ${res.realRoomId} ${res.title ? `(${res.title.slice(0, 15)}...)` : ''}`;
    } else {
      currentRoomId = null;
      elements.roomStatusBadge.classList.remove('active');
      elements.roomStatusText.textContent = '当前标签页非 B站 直播间 (可手动输入房间号)';
    }
  } catch (err) {
    elements.roomStatusText.textContent = '检测失败';
  }
  updateSendButtonState();
}

async function handleManualCheckRoom() {
  const inputVal = elements.liveRoomIdInput.value.trim();
  if (!inputVal) {
    alert('请输入直播间号');
    return;
  }

  elements.btnCheckRoom.disabled = true;
  elements.btnCheckRoom.textContent = '解析中';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'GET_REAL_ROOM_ID',
      roomId: inputVal
    });
    if (res && res.success) {
      currentRoomId = res.realRoomId;
      elements.roomStatusBadge.classList.add('active');
      elements.roomStatusText.textContent = `房间解析成功！真实房间号: ${currentRoomId}`;
    } else {
      currentRoomId = null;
      elements.roomStatusBadge.classList.remove('active');
      elements.roomStatusText.textContent = `解析失败: ${res.error || '房间不存在'}`;
    }
  } catch (err) {
    alert(`解析异常: ${err.message}`);
  } finally {
    elements.btnCheckRoom.disabled = false;
    elements.btnCheckRoom.textContent = '解析';
    updateSendButtonState();
  }
}

function handleDanmakuInput() {
  const len = elements.danmakuInput.value.length;
  elements.charCounter.textContent = `${len}/20`;
  updateSendButtonState();
}

function updateSendButtonState() {
  const hasRoom = !!currentRoomId;
  const hasText = elements.danmakuInput.value.trim().length > 0;
  const enabledCount = parseInt(elements.activeSendCount.textContent || '0', 10);

  elements.btnSendDanmaku.disabled = !(hasRoom && hasText && enabledCount > 0);
  if (elements.btnSendGift) {
    elements.btnSendGift.disabled = !(hasRoom && enabledCount > 0);
  }
}

async function handleSendDanmaku() {
  const message = elements.danmakuInput.value.trim();
  if (!message || !currentRoomId) return;

  elements.btnSendDanmaku.disabled = true;
  elements.btnSendDanmaku.textContent = '正在发言...';
  elements.sendResultsBox.style.display = 'block';
  elements.resultsList.innerHTML = '<div class="sub-text">调度发送中，请稍候...</div>';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'SEND_DANMAKU_ALL',
      roomId: currentRoomId,
      message
    });

    renderResults(res.results || []);
    if (res.success) {
      elements.danmakuInput.value = '';
      elements.charCounter.textContent = '0/20';
    }
  } catch (err) {
    alert(`发送弹幕失败: ${err.message}`);
  } finally {
    elements.btnSendDanmaku.textContent = '多账号同时发言';
    updateSendButtonState();
  }
}

/**
 * 多账号送出免费心意礼物
 */
async function handleSendFreeGift() {
  if (!currentRoomId) {
    alert('请先连接或输入直播间房间号');
    return;
  }

  const enabledCount = parseInt(elements.activeSendCount.textContent || '0', 10);
  if (enabledCount === 0) {
    alert('当前没有已启用的账号');
    return;
  }

  elements.btnSendGift.disabled = true;
  elements.btnSendGift.textContent = '赠送中...';
  elements.sendResultsBox.style.display = 'block';
  elements.resultsList.innerHTML = '<div class="sub-text">正在调度各账号送出免费心意礼物...</div>';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'SEND_FREE_GIFT_ALL',
      roomId: currentRoomId
    });

    renderResults(res.results || []);
  } catch (err) {
    alert(`送礼异常: ${err.message}`);
  } finally {
    elements.btnSendGift.disabled = false;
    elements.btnSendGift.textContent = '🎁 全号送心意';
    updateSendButtonState();
  }
}

function renderResults(results) {
  if (!results || results.length === 0) {
    elements.resultsList.innerHTML = '<div class="sub-text">无操作记录</div>';
    return;
  }

  elements.resultsList.innerHTML = '';
  results.forEach(item => {
    const div = document.createElement('div');
    div.className = `result-item ${item.success ? 'success' : 'failed'}`;
    div.innerHTML = `
      <span><b>${escapeHtml(item.uname || item.mid)}</b></span>
      <span>${item.success ? '✔ ' : '✖ '}${escapeHtml(item.message)}</span>
    `;
    elements.resultsList.appendChild(div);
  });
}

// ======================= 设置模块 =======================

async function loadSettings() {
  const settings = await Storage.getSettings();
  elements.settingAutoRefresh.checked = settings.autoRefreshTab;
  elements.settingDelayMin.value = settings.delayMin;
  elements.settingDelayMax.value = settings.delayMax;
}

async function handleSaveSettings() {
  const autoRefresh = elements.settingAutoRefresh.checked;
  const delayMin = Math.max(100, parseInt(elements.settingDelayMin.value || '500', 10));
  const delayMax = Math.max(delayMin, parseInt(elements.settingDelayMax.value || '1500', 10));

  await Storage.saveSettings({
    autoRefreshTab: autoRefresh,
    delayMin,
    delayMax
  });

  elements.btnSaveSettings.textContent = '已保存 ✔';
  setTimeout(() => {
    elements.btnSaveSettings.textContent = '保存设置';
  }, 1000);
}

// ======================= 工具函数 =======================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', init);
