/**
 * Content Script: 注入到 Bilibili 所有页面的悬浮控制面板挂件
 * 采用 Shadow DOM 隔离样式，完全避免与 B站 原生样式冲突
 */

(() => {
  if (document.getElementById('bili-multi-widget-host')) return;

  function getPageContext() {
    const isLive = window.location.hostname === 'live.bilibili.com';
    let liveShortId = null;
    if (isLive) {
      const match = window.location.pathname.match(/\/([0-9]+)/);
      liveShortId = match ? match[1] : null;
    }

    const videoMatch = window.location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
    const bvid = videoMatch ? videoMatch[1] : null;

    return {
      isLive,
      liveShortId,
      isVideo: !!bvid,
      bvid
    };
  }

  const host = document.createElement('div');
  host.id = 'bili-multi-widget-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    .widget-fab {
      position: fixed;
      right: 20px;
      bottom: 120px;
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #fb7299 0%, #f95c89 100%);
      color: #fff;
      border-radius: 50%;
      box-shadow: 0 4px 16px rgba(251, 114, 153, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483647;
      user-select: none;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
    }

    .widget-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(251, 114, 153, 0.6);
    }

    .widget-fab:active {
      transform: scale(0.95);
    }

    .fab-icon {
      font-size: 20px;
      font-weight: bold;
    }

    .fab-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #2ac864;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #fff;
    }

    .widget-panel {
      position: fixed;
      right: 20px;
      bottom: 120px;
      width: 295px;
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06);
      border: 1px solid rgba(251, 114, 153, 0.2);
      z-index: 2147483647;
      overflow: hidden;
      font-size: 12px;
      color: #18191c;
      display: none;
      flex-direction: column;
      animation: panelIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes panelIn {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .panel-header {
      background: linear-gradient(135deg, #fff7fa 0%, #ffffff 100%);
      padding: 10px 12px;
      border-bottom: 1px solid #f1f2f3;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .main-account-box {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }

    .main-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1.5px solid #fb7299;
      object-fit: cover;
    }

    .main-name-col {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .main-name {
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #18191c;
    }

    .main-tag {
      font-size: 10px;
      color: #2ac864;
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .main-tag::before {
      content: "●";
      font-size: 8px;
    }

    .panel-close-btn {
      background: none;
      border: none;
      color: #9499a0;
      font-size: 16px;
      cursor: pointer;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .panel-close-btn:hover {
      background: #f1f2f3;
      color: #18191c;
    }

    .panel-body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 440px;
      overflow-y: auto;
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      color: #61666d;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .accounts-scroll {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .account-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      width: 52px;
      flex-shrink: 0;
      text-align: center;
    }

    .item-avatar-wrap {
      position: relative;
      width: 38px;
      height: 38px;
    }

    .item-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid #e3e5e7;
      transition: border-color 0.2s, transform 0.2s;
    }

    .account-item:hover .item-avatar {
      transform: scale(1.06);
      border-color: #fb7299;
    }

    .account-item.is-current .item-avatar {
      border: 2px solid #fb7299;
      box-shadow: 0 0 0 2px rgba(251, 114, 153, 0.2);
    }

    .badge-curr {
      position: absolute;
      bottom: -2px;
      right: -2px;
      background: #fb7299;
      color: #fff;
      font-size: 8px;
      padding: 0 3px;
      border-radius: 4px;
      font-weight: bold;
      line-height: 12px;
    }

    .item-name {
      font-size: 10px;
      color: #61666d;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .video-control-card {
      background: #f0f7ff;
      border: 1px solid #c8e1ff;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .video-btns-row {
      display: flex;
      gap: 8px;
    }

    .btn-video-action {
      flex: 1;
      padding: 6px 8px;
      border-radius: 6px;
      border: none;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.15s;
    }

    .btn-like {
      background: #00aeec;
      color: #fff;
    }
    .btn-like:hover:not(:disabled) {
      background: #009ad1;
    }

    .btn-triple {
      background: linear-gradient(135deg, #fb7299 0%, #ff85a7 100%);
      color: #fff;
      box-shadow: 0 2px 6px rgba(251, 114, 153, 0.3);
    }
    .btn-triple:hover:not(:disabled) {
      background: #f95c89;
    }

    .btn-video-action:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .live-control-card {
      background: #fdf2f5;
      border: 1px solid #ffd6e3;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .quick-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .tag-btn {
      background: #fff;
      border: 1px solid #ffd1df;
      color: #fb7299;
      border-radius: 10px;
      font-size: 11px;
      padding: 2px 7px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .tag-btn:hover {
      background: #fb7299;
      color: #fff;
    }

    .msg-input-wrap {
      display: flex;
      gap: 6px;
    }

    .danmaku-txt {
      flex: 1;
      border: 1px solid #ffd6e3;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
      background: #fff;
    }

    .danmaku-txt:focus {
      border-color: #fb7299;
    }

    .btn-send-mini {
      background: #fb7299;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 9px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }

    .btn-send-mini:hover:not(:disabled) {
      background: #f95c89;
    }

    .btn-send-mini:disabled {
      background: #f7a8c0;
      cursor: not-allowed;
    }

    .btn-gift-mini {
      background: #2ac864;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-gift-mini:hover:not(:disabled) {
      background: #23b056;
    }

    .btn-gift-mini:disabled {
      background: #a3e7be;
      cursor: not-allowed;
    }

    .actions-footer {
      display: flex;
      gap: 6px;
      border-top: 1px solid #f1f2f3;
      padding-top: 10px;
    }

    .btn-action-small {
      flex: 1;
      padding: 5px;
      background: #f6f7f8;
      border: 1px solid #e3e5e7;
      border-radius: 6px;
      font-size: 11px;
      color: #61666d;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s;
    }

    .btn-action-small:hover {
      background: #fff;
      color: #fb7299;
      border-color: #ffd6e3;
    }

    .toast-msg {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(24, 25, 28, 0.88);
      color: #fff;
      padding: 5px 12px;
      border-radius: 14px;
      font-size: 11px;
      pointer-events: none;
      display: none;
      animation: fadeIn 0.2s ease-out;
      white-space: nowrap;
      z-index: 10;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, -6px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
  `;

  shadow.innerHTML = `
    <style>${style}</style>
    <!-- 悬浮球 -->
    <div id="widget-fab" class="widget-fab" title="B站多账号快捷助手">
      <span class="fab-icon">B</span>
      <span id="fab-badge" class="fab-badge">0</span>
    </div>

    <!-- 悬浮面板 -->
    <div id="widget-panel" class="widget-panel">
      <div id="toast-msg" class="toast-msg"></div>

      <!-- 头部 -->
      <div class="panel-header">
        <div class="main-account-box">
          <img id="panel-main-avatar" class="main-avatar" src="https://static.hdslb.com/images/member/noface.gif" alt="avatar" />
          <div class="main-name-col">
            <span id="panel-main-name" class="main-name">正在加载...</span>
            <span id="panel-main-tag" class="main-tag">当前主账号</span>
          </div>
        </div>
        <button id="panel-close-btn" class="panel-close-btn" title="收起面板">&times;</button>
      </div>

      <!-- 主体 -->
      <div class="panel-body">
        <!-- 账号快速切换 -->
        <div>
          <div class="section-label">
            <span>快捷切号 (点击即切)</span>
            <span id="accounts-count-label" style="font-size: 10px; color: #9499a0;">0个</span>
          </div>
          <div id="accounts-scroll" class="accounts-scroll">
            <div style="color: #9499a0; font-size: 11px; padding: 6px 0;">暂无账号</div>
          </div>
        </div>

        <!-- 视频操作卡片 (仅视频播放页显示) -->
        <div id="video-section" class="video-control-card" style="display: none;">
          <div class="section-label" style="color: #00aeec; margin-bottom: 2px;">
            <span>当前视频群控 (<b id="video-account-count">0</b>号就绪)</span>
          </div>
          <div style="font-size: 10px; color: #61666d;" id="video-bvid-text">BV...</div>
          <div class="video-btns-row">
            <button id="btn-video-like" class="btn-video-action btn-like">👍 全号点赞</button>
            <button id="btn-video-triple" class="btn-video-action btn-triple">⚡ 全号三连</button>
          </div>
        </div>

        <!-- 直播间快捷发言与送礼卡片 (仅直播间显示) -->
        <div id="live-section" class="live-control-card" style="display: none;">
          <div class="section-label" style="color: #c93b68; margin-bottom: 2px;">
            <span>直播间快捷同发 (<b id="live-account-count">0</b>号就绪)</span>
          </div>
          <div class="quick-tags">
            <button class="tag-btn" data-msg="666">666</button>
            <button class="tag-btn" data-msg="哈哈哈">哈哈哈</button>
            <button class="tag-btn" data-msg="打卡">打卡</button>
            <button class="tag-btn" data-msg="好听">好听</button>
            <button class="tag-btn" data-msg="太强了">太强了</button>
            <button class="tag-btn" data-msg="点赞">点赞</button>
          </div>
          <div class="msg-input-wrap">
            <input type="text" id="danmaku-quick-input" class="danmaku-txt" placeholder="输入弹幕内容..." maxlength="20" />
            <button id="btn-quick-send" class="btn-send-mini">全发</button>
          </div>
          <!-- 免费礼物打赏行 -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #ffd1df; padding-top: 6px; margin-top: 2px;">
            <span style="font-size: 11px; color: #c93b68;">免费礼物心意:</span>
            <button id="btn-quick-gift" class="btn-gift-mini" title="为各账号赠送背包免费道具或小心心 (安全绝不扣费)">🎁 全号送小心心</button>
          </div>
        </div>

        <!-- 底部快捷动作 -->
        <div class="actions-footer">
          <button id="btn-quick-sync" class="btn-action-small" title="抓取当前网页登录的账号">🔄 同步当前号</button>
          <button id="btn-quick-login-new" class="btn-action-small" title="退出并前往登录新账号">➕ 登录新号</button>
        </div>
      </div>
    </div>
  `;

  const fab = shadow.getElementById('widget-fab');
  const badge = shadow.getElementById('fab-badge');
  const panel = shadow.getElementById('widget-panel');
  const closeBtn = shadow.getElementById('panel-close-btn');
  const toastMsg = shadow.getElementById('toast-msg');

  const mainAvatar = shadow.getElementById('panel-main-avatar');
  const mainName = shadow.getElementById('panel-main-name');
  const mainTag = shadow.getElementById('panel-main-tag');
  const accountsScroll = shadow.getElementById('accounts-scroll');
  const accountsCountLabel = shadow.getElementById('accounts-count-label');

  const videoSection = shadow.getElementById('video-section');
  const videoAccountCount = shadow.getElementById('video-account-count');
  const videoBvidText = shadow.getElementById('video-bvid-text');
  const btnVideoLike = shadow.getElementById('btn-video-like');
  const btnVideoTriple = shadow.getElementById('btn-video-triple');

  const liveSection = shadow.getElementById('live-section');
  const liveAccountCount = shadow.getElementById('live-account-count');
  const quickInput = shadow.getElementById('danmaku-quick-input');
  const quickSendBtn = shadow.getElementById('btn-quick-send');
  const btnQuickGift = shadow.getElementById('btn-quick-gift');
  const tagBtns = shadow.querySelectorAll('.tag-btn');

  const btnQuickSync = shadow.getElementById('btn-quick-sync');
  const btnQuickLoginNew = shadow.getElementById('btn-quick-login-new');

  let toastTimer = null;
  function showToast(text, duration = 2200) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMsg.textContent = text;
    toastMsg.style.display = 'block';
    toastTimer = setTimeout(() => {
      toastMsg.style.display = 'none';
    }, duration);
  }

  fab.addEventListener('click', () => {
    panel.style.display = 'flex';
    fab.style.display = 'none';
    refreshData();
  });

  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    fab.style.display = 'flex';
  });

  async function refreshData() {
    try {
      const pageCtx = getPageContext();
      const res = await chrome.storage.local.get({ accounts: [] });
      const accounts = res.accounts || [];

      const enabledAccounts = accounts.filter(a => a.enabled);
      badge.textContent = enabledAccounts.length;
      accountsCountLabel.textContent = `${accounts.length}个`;

      if (pageCtx.isLive) {
        liveSection.style.display = 'flex';
        videoSection.style.display = 'none';
        liveAccountCount.textContent = enabledAccounts.length;
      } else if (pageCtx.isVideo) {
        liveSection.style.display = 'none';
        videoSection.style.display = 'flex';
        videoAccountCount.textContent = enabledAccounts.length;
        videoBvidText.textContent = `稿件: ${pageCtx.bvid}`;
      } else {
        liveSection.style.display = 'none';
        videoSection.style.display = 'none';
      }

      const current = accounts.find(a => a.isCurrent);
      if (current) {
        mainAvatar.src = current.face || 'https://static.hdslb.com/images/member/noface.gif';
        mainName.textContent = current.uname;
        mainTag.textContent = '当前主账号 (网页生效中)';
        mainTag.style.color = '#2ac864';
      } else {
        mainAvatar.src = 'https://static.hdslb.com/images/member/noface.gif';
        mainName.textContent = '未登录 / 未设置主号';
        mainTag.textContent = '点击下方头像可一键切换';
        mainTag.style.color = '#9499a0';
      }

      if (accounts.length === 0) {
        accountsScroll.innerHTML = '<div style="color: #9499a0; font-size: 11px; padding: 6px 0;">暂无账号，点击下方登录</div>';
      } else {
        accountsScroll.innerHTML = '';
        accounts.forEach(acc => {
          const item = document.createElement('div');
          item.className = `account-item ${acc.isCurrent ? 'is-current' : ''}`;
          item.title = `点击切换为【${acc.uname}】`;
          item.innerHTML = `
            <div class="item-avatar-wrap">
              <img class="item-avatar" src="${acc.face}" onerror="this.src='https://static.hdslb.com/images/member/noface.gif'" />
              ${acc.isCurrent ? '<span class="badge-curr">主</span>' : ''}
            </div>
            <span class="item-name">${acc.uname}</span>
          `;

          item.addEventListener('click', async () => {
            if (acc.isCurrent) {
              showToast(`当前已是【${acc.uname}】`);
              return;
            }
            showToast(`正在切换为【${acc.uname}】...`);
            try {
              const switchRes = await chrome.runtime.sendMessage({
                action: 'SWITCH_MAIN_ACCOUNT',
                mid: acc.mid
              });
              if (switchRes.success) {
                showToast(`已切换为【${acc.uname}】！刷新中...`);
              } else {
                showToast(`切换失败: ${switchRes.error || '未知原因'}`);
              }
            } catch (err) {
              showToast(`异常: ${err.message}`);
            }
          });

          accountsScroll.appendChild(item);
        });
      }
    } catch (e) {
      console.warn('刷新挂件数据失败:', e);
    }
  }

  // 视频操作
  async function handleVideoAction(type) {
    const pageCtx = getPageContext();
    if (!pageCtx.isVideo || !pageCtx.bvid) {
      showToast('未检测到有效视频 BV 号');
      return;
    }

    const btn = type === 'like' ? btnVideoLike : btnVideoTriple;
    const actionName = type === 'like' ? '点赞' : '三连';

    btn.disabled = true;
    btn.textContent = `${actionName}中...`;
    showToast(`正在调度各账号执行【${actionName}】...`);

    try {
      const msgAction = type === 'like' ? 'SEND_VIDEO_LIKE_ALL' : 'SEND_VIDEO_TRIPLE_ALL';
      const res = await chrome.runtime.sendMessage({
        action: msgAction,
        bvid: pageCtx.bvid
      });

      if (res && res.results) {
        const successes = res.results.filter(r => r.success).length;
        const total = res.results.length;
        showToast(`✔ 成功${actionName}: ${successes}/${total} 个账号`);
      } else {
        showToast(res?.message || `${actionName}失败`);
      }
    } catch (err) {
      showToast(`${actionName}异常: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = type === 'like' ? '👍 全号点赞' : '⚡ 全号三连';
    }
  }

  if (btnVideoLike) btnVideoLike.addEventListener('click', () => handleVideoAction('like'));
  if (btnVideoTriple) btnVideoTriple.addEventListener('click', () => handleVideoAction('triple'));

  // 直播发言
  async function sendQuickDanmaku(text) {
    const msg = (text || quickInput.value || '').trim();
    if (!msg) {
      showToast('请输入弹幕内容');
      return;
    }

    const pageCtx = getPageContext();
    if (!pageCtx.isLive || !pageCtx.liveShortId) {
      showToast('未检测到直播间房间号');
      return;
    }

    quickSendBtn.disabled = true;
    quickSendBtn.textContent = '发送中';
    showToast('多账号正在依次发言...');

    try {
      const roomRes = await chrome.runtime.sendMessage({
        action: 'GET_REAL_ROOM_ID',
        roomId: pageCtx.liveShortId
      });
      const realRoomId = roomRes?.realRoomId || pageCtx.liveShortId;

      const sendRes = await chrome.runtime.sendMessage({
        action: 'SEND_DANMAKU_ALL',
        roomId: realRoomId,
        message: msg
      });

      if (sendRes && sendRes.results) {
        const successes = sendRes.results.filter(r => r.success).length;
        const total = sendRes.results.length;
        showToast(`✔ 成功发送: ${successes}/${total} 个账号`);
        if (sendRes.success) {
          quickInput.value = '';
        }
      } else {
        showToast(sendRes?.message || '发送失败');
      }
    } catch (err) {
      showToast(`发送失败: ${err.message}`);
    } finally {
      quickSendBtn.disabled = false;
      quickSendBtn.textContent = '全发';
    }
  }

  if (quickSendBtn) quickSendBtn.addEventListener('click', () => sendQuickDanmaku());
  if (quickInput) {
    quickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendQuickDanmaku();
      }
    });
  }

  tagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = btn.dataset.msg;
      quickInput.value = msg;
      sendQuickDanmaku(msg);
    });
  });

  // 直播免费礼物赠送
  if (btnQuickGift) {
    btnQuickGift.addEventListener('click', async () => {
      const pageCtx = getPageContext();
      if (!pageCtx.isLive || !pageCtx.liveShortId) {
        showToast('未检测到直播间房间号');
        return;
      }

      btnQuickGift.disabled = true;
      btnQuickGift.textContent = '赠送中...';
      showToast('正在调度各账号送出免费心意礼物...');

      try {
        const res = await chrome.runtime.sendMessage({
          action: 'SEND_FREE_GIFT_ALL',
          roomId: pageCtx.liveShortId
        });

        if (res && res.results) {
          const successes = res.results.filter(r => r.success).length;
          const total = res.results.length;
          showToast(`✔ 礼物送出完成: ${successes}/${total} 个账号`);
        } else {
          showToast(res?.message || '礼物赠送失败');
        }
      } catch (err) {
        showToast(`送礼异常: ${err.message}`);
      } finally {
        btnQuickGift.disabled = false;
        btnQuickGift.textContent = '🎁 全号送小心心';
      }
    });
  }

  // 底部动作
  btnQuickSync.addEventListener('click', async () => {
    showToast('正在抓取当前网页账号...');
    try {
      const res = await chrome.runtime.sendMessage({ action: 'SYNC_CURRENT_ACCOUNT' });
      if (res && res.success && res.account) {
        showToast(`✔ 成功同步: ${res.account.uname}`);
        refreshData();
      } else {
        showToast('当前网页未登录或检测失败');
      }
    } catch (e) {
      showToast(`同步失败: ${e.message}`);
    }
  });

  btnQuickLoginNew.addEventListener('click', async () => {
    if (confirm('是否退出当前网页登录，前往登录新账号？已有账号凭据已妥善保存。')) {
      showToast('正在前往登录页...');
      try {
        await chrome.runtime.sendMessage({ action: 'PREPARE_LOGIN_NEW' });
      } catch (e) {
        showToast(`跳转失败: ${e.message}`);
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.accounts) {
      refreshData();
    }
  });

  refreshData();
})();
