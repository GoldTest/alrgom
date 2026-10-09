/**
 * Content Script: 注入到 Bilibili 所有页面的悬浮控制面板挂件
 * 采用 Shadow DOM 隔离样式，完全避免与 B站 原生样式冲突
 */

(() => {
  // 检查扩展上下文是否有效（防止重载扩展后遗留的孤儿脚本报错）
  function isExtensionValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  }

  if (!isExtensionValid()) return;

  // 清除之前可能注入的旧挂件宿主，避免扩展重载后残留孤儿挂件
  const existingHost = document.getElementById('bili-multi-widget-host');
  if (existingHost) {
    try {
      existingHost.remove();
    } catch (_) {}
  }

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
      width: 40px;
      height: 40px;
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
      font-size: 17px;
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

    .follow-capsule {
      position: fixed;
      right: 24px;
      bottom: 75px;
      background: rgba(24, 25, 28, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #fff;
      padding: 7px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
      border: 1px solid rgba(255, 255, 255, 0.15);
      z-index: 2147483647;
      pointer-events: none;
      display: none;
      align-items: center;
      gap: 6px;
      animation: capsuleFade 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }

    @keyframes capsuleFade {
      from { opacity: 0; transform: translateY(8px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .live-accounts-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .live-accounts-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 250px;
      overflow-y: auto;
      padding-right: 2px;
    }

    .live-account-card {
      background: #fafbfc;
      border: 1px solid #e3e5e7;
      border-radius: 8px;
      padding: 7px 9px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: all 0.16s ease;
    }

    .live-account-card:hover {
      background: #fff;
      border-color: #fb7299;
      box-shadow: 0 2px 8px rgba(251, 114, 153, 0.12);
    }

    .live-account-card.is-current {
      background: #fff8fa;
      border-color: #fb7299;
      box-shadow: 0 0 0 1px #fb7299;
    }

    .live-card-main-row {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .live-avatar-wrap {
      position: relative;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
    }

    .live-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #e3e5e7;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    /* 主号粉色固定包边 */
    .live-avatar.border-main {
      border: 2px solid #fb7299;
      box-shadow: 0 0 0 1px rgba(251, 114, 153, 0.3);
    }

    /* 在线绿色呼吸包边 (微幅细腻呼吸) */
    @keyframes avatar-green-breath {
      0%, 100% {
        border-color: #2ac864;
        box-shadow: 0 0 0 0.5px rgba(42, 200, 100, 0.3);
      }
      50% {
        border-color: #2ac864;
        box-shadow: 0 0 0 1.5px rgba(42, 200, 100, 0.65);
      }
    }

    .live-avatar.border-online {
      border: 2px solid #2ac864;
      animation: avatar-green-breath 2.4s infinite ease-in-out;
    }

    /* 不在线灰色固定包边 */
    .live-avatar.border-offline {
      border: 2px solid #9499a0;
      box-shadow: 0 0 0 1px rgba(148, 153, 160, 0.2);
    }

    .live-info-col {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
      gap: 2px;
    }

    .live-name-row {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .live-name {
      font-size: 12px;
      font-weight: 600;
      color: #18191c;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 110px;
    }

    .live-assets-row {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .live-asset-tag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-weight: 500;
      white-space: nowrap;
    }

    .asset-tag-battery {
      background: #fff7e6;
      color: #fa8c16;
      border: 1px solid #ffe7ba;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    .asset-tag-battery:hover {
      background: #ffe7ba;
      border-color: #ffd591;
      transform: translateY(-1px);
    }

    .asset-tag-bag {
      background: #e6f7ff;
      color: #1890ff;
      border: 1px solid #bae7ff;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    .asset-tag-bag:hover {
      background: #bae7ff;
      border-color: #91d5ff;
      transform: translateY(-1px);
    }

    /* 背包道具展开抽屉 */
    .bag-drawer {
      display: none;
      flex-direction: column;
      gap: 4px;
      background: #f4f6f8;
      border-radius: 6px;
      padding: 6px 8px;
      margin-top: 2px;
      border: 1px solid #eaedf1;
      animation: drawerFade 0.15s ease;
    }

    @keyframes drawerFade {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .bag-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 4px 0;
      border-bottom: 1px dashed #e3e5e7;
    }

    .bag-item-row:last-child {
      border-bottom: none;
    }

    .bag-item-info {
      display: flex;
      align-items: baseline;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }

    .bag-item-name {
      font-size: 11px;
      font-weight: 500;
      color: #18191c;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bag-item-num {
      font-size: 10px;
      font-weight: 600;
      color: #fb7299;
    }

    .bag-item-expire {
      font-size: 9px;
      color: #9499a0;
      white-space: nowrap;
    }

    .bag-item-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .btn-send-gift-mini {
      background: #fb7299;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }

    .btn-send-gift-mini:hover:not(:disabled) {
      background: #f95c89;
    }

    .btn-send-gift-mini:disabled {
      background: #f7a8c0;
      cursor: not-allowed;
    }

    .btn-send-gift-all {
      background: #00aeec;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
    }

    .btn-send-gift-all:hover:not(:disabled) {
      background: #009ad1;
    }

    .btn-send-gift-all:disabled {
      background: #80d7f6;
      cursor: not-allowed;
    }

    .bag-empty-tip {
      font-size: 10px;
      color: #9499a0;
      text-align: center;
      padding: 4px 0;
    }

    /* 礼物列表抽屉 */
    .gift-drawer {
      display: none;
      flex-direction: column;
      gap: 3px;
      background: #fffbf0;
      border-radius: 6px;
      padding: 6px 7px;
      margin-top: 2px;
      border: 1px solid #ffe7ba;
      animation: drawerFade 0.15s ease;
      max-height: 220px;
    }

    /* 礼物分类 Tab 栏 */
    .gift-drawer-tabs {
      display: flex;
      flex-wrap: nowrap;
      gap: 4px;
      padding-bottom: 4px;
      margin-bottom: 3px;
      border-bottom: 1px dashed #ffe7ba;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
      cursor: grab;
      user-select: none;
    }

    .gift-drawer-tabs.is-dragging {
      cursor: grabbing;
      scroll-behavior: auto;
    }

    .gift-drawer-tabs::-webkit-scrollbar {
      height: 3px;
    }

    .gift-drawer-tabs::-webkit-scrollbar-track {
      background: rgba(255, 231, 186, 0.4);
      border-radius: 2px;
    }

    .gift-drawer-tabs::-webkit-scrollbar-thumb {
      background: #ffd591;
      border-radius: 2px;
    }

    .gift-drawer-tabs::-webkit-scrollbar-thumb:hover {
      background: #fa8c16;
    }

    .gift-tab-btn {
      background: #fdf5e6;
      border: 1px solid #ffd591;
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 10px;
      color: #873800;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      user-select: none;
    }

    .gift-tab-btn:hover {
      background: #ffe7ba;
    }

    .gift-tab-btn.active {
      background: #fa8c16;
      color: #fff;
      border-color: #d46b08;
      font-weight: 600;
    }

    /* 礼物列表滚动容器 */
    .gift-list-scroll {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 155px;
      overflow-y: auto;
      padding-right: 2px;
    }

    .gift-item-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 5px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.12s;
      border-bottom: 1px dashed #ffe7ba;
      user-select: none;
    }

    .gift-item-row:last-child {
      border-bottom: none;
    }

    .gift-item-row:hover {
      background: #fff0cc;
    }

    .gift-item-row.sending {
      opacity: 0.5;
      pointer-events: none;
    }

    .gift-item-row.is-unsupported {
      opacity: 0.5;
      background: #fafafa;
    }

    .gift-item-row.is-unsupported:hover {
      background: #f0f0f0;
    }

    .gift-item-row.is-bag-empty {
      opacity: 0.65;
    }

    .gift-item-img {
      width: 20px;
      height: 20px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .gift-item-name {
      font-size: 11px;
      font-weight: 500;
      color: #18191c;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gift-item-badge {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .badge-battery {
      background: #fff2e8;
      color: #d4380d;
      border: 1px solid #ffbb96;
    }

    .badge-bag-has {
      background: #f6ffed;
      color: #389e0d;
      border: 1px solid #b7eb8f;
    }

    .badge-bag-empty {
      background: #f5f5f5;
      color: #8c8c8c;
      border: 1px solid #d9d9d9;
    }

    .badge-unsupported {
      background: #fff1f0;
      color: #cf1322;
      border: 1px solid #ffa39e;
    }

    .gift-loading-tip {
      font-size: 10px;
      color: #9499a0;
      text-align: center;
      padding: 6px 0;
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
      background: rgba(24, 25, 28, 0.92);
      color: #fff;
      padding: 6px 12px;
      border-radius: 10px;
      font-size: 11px;
      line-height: 1.4;
      pointer-events: none;
      display: none;
      animation: fadeIn 0.2s ease-out;
      max-width: 88%;
      box-sizing: border-box;
      word-break: break-all;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 100;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translate(-50%, -6px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }

    /* 跟随发言开关（内联在标题栏） */
    .toggle-switch {
      position: relative;
      width: 30px;
      height: 16px;
      flex-shrink: 0;
      cursor: pointer;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }

    .toggle-track {
      position: absolute;
      inset: 0;
      background: #d0d4da;
      border-radius: 16px;
      transition: background 0.2s;
      cursor: pointer;
    }

    .toggle-track::after {
      content: '';
      position: absolute;
      left: 2px;
      top: 2px;
      width: 12px;
      height: 12px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .toggle-switch input:checked + .toggle-track {
      background: #fb7299;
    }

    .toggle-switch input:checked + .toggle-track::after {
      transform: translateX(14px);
    }

    .toggle-status-text {
      font-size: 10px;
      font-weight: 500;
      color: #9499a0;
      user-select: none;
      transition: color 0.2s, opacity 0.2s;
    }

    .toggle-status-text.is-on {
      color: #fb7299;
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
        <!-- 普通页面横向快速切号栏 (非直播间显示) -->
        <div id="normal-accounts-box">
          <div class="section-label">
            <span>快捷切号 (点击即切)</span>
            <span id="accounts-count-label" style="font-size: 10px; color: #9499a0;">0个</span>
          </div>
          <div id="accounts-scroll" class="accounts-scroll">
            <div style="color: #9499a0; font-size: 11px; padding: 6px 0;">暂无账号</div>
          </div>
        </div>

        <!-- 直播间各账号连接状态与资产看板 (仅直播间显示) -->
        <div id="live-accounts-section" class="live-accounts-section" style="display: none;">
          <div class="section-label" style="color: #fb7299; margin-bottom: 2px;">
            <span>各账号连接与资产状态</span>
            <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
              <span id="follow-danmaku-status-text" class="toggle-status-text is-on" title="副账号跟随发言（关闭后副账号仍在线）">💬 跟随发言</span>
              <label class="toggle-switch" title="开启/关闭副账号跟随发言（不影响副账号在线状态）">
                <input type="checkbox" id="follow-danmaku-toggle" checked />
                <span class="toggle-track"></span>
              </label>
              <span id="btn-refresh-live-assets" style="font-size: 10px; color: #9499a0; cursor: pointer; margin-left:2px;" title="点击重新查询各账号电池与背包">🔄</span>
            </div>
          </div>

          <div id="live-accounts-list" class="live-accounts-list">
            <div style="color: #9499a0; font-size: 11px; padding: 8px 0; text-align: center;">正在读取各账号资产...</div>
          </div>
        </div>

        <!-- 底部快捷动作 -->
        <div class="actions-footer">
          <button id="btn-quick-sync" class="btn-action-small" title="抓取当前网页登录的账号">🔄 同步当前号</button>
          <button id="btn-quick-login-new" class="btn-action-small" title="退出并前往登录新账号">➕ 登录新号</button>
        </div>
      </div>
    </div>

    <!-- 主号点赞时副号自动跟随的轻量胶囊提示 (非侵入式浮现) -->
    <div id="follow-capsule" class="follow-capsule"></div>
  `;

  const fab = shadow.getElementById('widget-fab');
  const badge = shadow.getElementById('fab-badge');
  const panel = shadow.getElementById('widget-panel');
  const closeBtn = shadow.getElementById('panel-close-btn');
  const toastMsg = shadow.getElementById('toast-msg');

  const mainAvatar = shadow.getElementById('panel-main-avatar');
  const mainName = shadow.getElementById('panel-main-name');
  const mainTag = shadow.getElementById('panel-main-tag');

  const normalAccountsBox = shadow.getElementById('normal-accounts-box');
  const accountsScroll = shadow.getElementById('accounts-scroll');
  const accountsCountLabel = shadow.getElementById('accounts-count-label');

  const liveAccountsSection = shadow.getElementById('live-accounts-section');
  const liveAccountsList = shadow.getElementById('live-accounts-list');
  const btnRefreshLiveAssets = shadow.getElementById('btn-refresh-live-assets');

  const followCapsule = shadow.getElementById('follow-capsule');
  let capsuleTimer = null;
  function showFollowCapsule(text, duration = 2800) {
    if (!followCapsule) return;
    if (capsuleTimer) clearTimeout(capsuleTimer);
    followCapsule.innerHTML = text;
    followCapsule.style.display = 'inline-flex';
    capsuleTimer = setTimeout(() => {
      followCapsule.style.display = 'none';
    }, duration);
  }

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

  let isFetchingLiveAssets = false;

  async function renderLiveAccountsAssets() {
    if (!isExtensionValid() || !liveAccountsList) return;
    if (isFetchingLiveAssets) return;
    isFetchingLiveAssets = true;

    liveAccountsList.innerHTML = '<div style="color: #9499a0; font-size: 11px; padding: 10px 0; text-align: center;">正在同步各账号连接与资产...</div>';

    try {
      const res = await chrome.runtime.sendMessage({ action: 'GET_ACCOUNTS_LIVE_STATUS' });
      if (!res || !res.success || !Array.isArray(res.accounts) || res.accounts.length === 0) {
        liveAccountsList.innerHTML = '<div style="color: #9499a0; font-size: 11px; padding: 10px 0; text-align: center;">暂无账号，点击下方登录新号</div>';
        return;
      }

      liveAccountsList.innerHTML = '';
      res.accounts.forEach(acc => {
        const card = document.createElement('div');
        card.className = `live-account-card ${acc.isCurrent ? 'is-current' : ''}`;

        let avatarBorderClass = 'border-online';
        let accountStatusDesc = '在线';

        if (acc.isCurrent) {
          avatarBorderClass = 'border-main';
          accountStatusDesc = '主号';
        } else if (acc.status === 'expired') {
          avatarBorderClass = 'border-offline';
          accountStatusDesc = '凭据失效';
        } else if (acc.status === 'offline' || acc.enabled === false) {
          avatarBorderClass = 'border-offline';
          accountStatusDesc = '不在线';
        } else {
          avatarBorderClass = 'border-online';
          accountStatusDesc = '在线';
        }

        const bagCount = acc.bagCount ?? 0;
        const bagItems = Array.isArray(acc.bagItems) ? acc.bagItems : [];

        // 主信息行
        const mainRow = document.createElement('div');
        mainRow.className = 'live-card-main-row';
        mainRow.title = acc.isCurrent ? '当前正在生效的主账号' : `【${accountStatusDesc}】点击一键切换为【${acc.uname || acc.mid}】`;
        mainRow.innerHTML = `
          <div class="live-avatar-wrap">
            <img class="live-avatar ${avatarBorderClass}" src="${acc.face || 'https://static.hdslb.com/images/member/noface.gif'}" onerror="this.src='https://static.hdslb.com/images/member/noface.gif'" />
          </div>
          <div class="live-info-col">
            <div class="live-name-row">
              <span class="live-name" title="${acc.uname || acc.mid}">${acc.uname || acc.mid}</span>
            </div>
          </div>
          <div class="live-assets-row">
            <span class="live-asset-tag asset-tag-battery" title="点击展开直播间礼物列表">🔋 <b class="battery-num">${acc.battery ?? 0}</b>电池 ▾</span>
            <span class="live-asset-tag asset-tag-bag" title="点击展开/折叠背包道具明细">🎒 <b class="bag-count-num">${bagCount}</b>件 ▾</span>
          </div>
        `;

        // 背包抽屉容器
        const drawer = document.createElement('div');
        drawer.className = 'bag-drawer';

        // 渲染背包道具列表
        function renderDrawerItems() {
          if (bagItems.length === 0) {
            drawer.innerHTML = '<div class="bag-empty-tip">背包暂无可用道具</div>';
            return;
          }

          drawer.innerHTML = '';
          bagItems.forEach((item, itemIdx) => {
            const itemRow = document.createElement('div');
            itemRow.className = 'bag-item-row';

            let expireText = '';
            if (item.expire_at) {
              const diffSec = item.expire_at - Math.floor(Date.now() / 1000);
              if (diffSec > 0) {
                const days = Math.floor(diffSec / 86400);
                const hours = Math.floor((diffSec % 86400) / 3600);
                expireText = days > 0 ? `${days}天后到期` : `${hours}小时后到期`;
              } else {
                expireText = '即将到期';
              }
            }

            itemRow.innerHTML = `
              <div class="bag-item-info">
                <span class="bag-item-name" title="${item.gift_name}">🎁 ${item.gift_name}</span>
                <span class="bag-item-num">x<span class="gift-num-text">${item.gift_num}</span></span>
                ${expireText ? `<span class="bag-item-expire">(${expireText})</span>` : ''}
              </div>
              <div class="bag-item-actions">
                <button class="btn-send-gift-mini btn-send-one" title="送出 1 个给当前主播">送1个</button>
                ${item.gift_num > 1 ? '<button class="btn-send-gift-all btn-send-all" title="全部送出给当前主播">全送</button>' : ''}
              </div>
            `;

            // 处理送礼
            async function handleSend(sendCount, targetBtn) {
              const pageCtx = getPageContext();
              if (!pageCtx.isLive || !pageCtx.liveShortId) {
                showToast('未检测到直播间房间号');
                return;
              }

              targetBtn.disabled = true;
              targetBtn.textContent = '...';

              try {
                const res = await chrome.runtime.sendMessage({
                  action: 'SEND_SINGLE_BAG_GIFT',
                  mid: acc.mid,
                  roomId: pageCtx.liveShortId,
                  bagId: item.bag_id,
                  giftId: item.gift_id,
                  giftNum: sendCount
                });

                if (res && res.success) {
                  showToast(`✔【${acc.uname || acc.mid}】已送出【${item.gift_name}】x${sendCount}`);
                  
                  // 局部更新该礼物数量
                  item.gift_num -= sendCount;
                  acc.bagCount = Math.max(0, (acc.bagCount || 0) - sendCount);
                  
                  // 更新主卡片上的背包数量徽章
                  const badgeNum = mainRow.querySelector('.bag-count-num');
                  if (badgeNum) badgeNum.textContent = acc.bagCount;

                  if (item.gift_num <= 0) {
                    bagItems.splice(itemIdx, 1);
                  }
                  renderDrawerItems();
                } else {
                  showToast(res?.message || '赠送失败');
                  targetBtn.disabled = false;
                  targetBtn.textContent = sendCount === 1 ? '送1个' : '全送';
                }
              } catch (err) {
                showToast(`赠送异常: ${err.message}`);
                targetBtn.disabled = false;
                targetBtn.textContent = sendCount === 1 ? '送1个' : '全送';
              }
            }

            const btnOne = itemRow.querySelector('.btn-send-one');
            if (btnOne) {
              btnOne.addEventListener('click', (e) => {
                e.stopPropagation();
                handleSend(1, btnOne);
              });
            }

            const btnAll = itemRow.querySelector('.btn-send-all');
            if (btnAll) {
              btnAll.addEventListener('click', (e) => {
                e.stopPropagation();
                handleSend(item.gift_num, btnAll);
              });
            }

            drawer.appendChild(itemRow);
          });
        }

        renderDrawerItems();

        // 点击背包标签展开/折叠背包抽屉（同时关闭礼物抽屉）
        const bagTag = mainRow.querySelector('.asset-tag-bag');
        if (bagTag) {
          bagTag.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = drawer.style.display === 'flex';
            drawer.style.display = isOpen ? 'none' : 'flex';
            bagTag.innerHTML = `🎒 <b class="bag-count-num">${acc.bagCount ?? 0}</b>件 ${isOpen ? '▾' : '▴'}`;
            // 关闭礼物抽屉
            if (!isOpen) {
              giftDrawer.style.display = 'none';
              const batTag = mainRow.querySelector('.asset-tag-battery');
              if (batTag) batTag.innerHTML = `🔋 <b class="battery-num">${acc.battery ?? 0}</b>电池 ▾`;
            }
          });
        }

        // 礼物抽屉容器
        const giftDrawer = document.createElement('div');
        giftDrawer.className = 'gift-drawer';
        let giftListLoaded = false;

        // 点击电池标签展开/折叠礼物抽屉（同时关闭背包抽屉）
        const batteryTag = mainRow.querySelector('.asset-tag-battery');
        if (batteryTag) {
          batteryTag.addEventListener('click', async (e) => {
            e.stopPropagation();
            const isOpen = giftDrawer.style.display === 'flex';

            if (isOpen) {
              giftDrawer.style.display = 'none';
              batteryTag.innerHTML = `🔋 <b class="battery-num">${acc.battery ?? 0}</b>电池 ▾`;
              return;
            }

            // 关闭背包抽屉
            drawer.style.display = 'none';
            bagTag && (bagTag.innerHTML = `🎒 <b class="bag-count-num">${acc.bagCount ?? 0}</b>件 ▾`);

            // 展开礼物抽屉
            giftDrawer.style.display = 'flex';
            batteryTag.innerHTML = `🔋 <b class="battery-num">${acc.battery ?? 0}</b>电池 ▴`;

            // 首次展开时才拉列表
            if (giftListLoaded) return;
            giftListLoaded = true;

            const pageCtx = getPageContext();
            if (!pageCtx.isLive || !pageCtx.liveShortId) {
              giftDrawer.innerHTML = '<div class="gift-loading-tip">未检测到直播间</div>';
              return;
            }

            giftDrawer.innerHTML = '<div class="gift-loading-tip">正在加载礼物列表...</div>';

            try {
              const res = await chrome.runtime.sendMessage({
                action: 'GET_ROOM_GIFT_LIST',
                mid: acc.mid,
                roomId: pageCtx.liveShortId
              });

              if (!res || !res.success || !res.gifts || res.gifts.length === 0) {
                giftDrawer.innerHTML = '<div class="gift-loading-tip">暂无可用礼物</div>';
                return;
              }

              giftDrawer.innerHTML = '';

              const allGifts = Array.isArray(res.gifts) ? res.gifts : [];

              // 电池礼物严格按电池消耗量升序排列（1电池 -> 大额电池）
              const batteryGifts = allGifts
                .filter(g => g.category === 'battery')
                .sort((a, b) => (Number(a.battery) - Number(b.battery)) || (Number(a.price) - Number(b.price)));

              // 包裹专属礼物：背包有库存的优先排在前面
              const bagGifts = allGifts
                .filter(g => g.category === 'bag')
                .sort((a, b) => {
                  const aHas = (Array.isArray(acc.bagItems) && acc.bagItems.some(item => String(item.giftId) === String(a.id) && item.giftNum > 0)) ? 1 : 0;
                  const bHas = (Array.isArray(acc.bagItems) && acc.bagItems.some(item => String(item.giftId) === String(b.id) && item.giftNum > 0)) ? 1 : 0;
                  if (aHas !== bHas) return bHas - aHas;
                  return a.id - b.id;
                });

              const unsupportedGifts = allGifts.filter(g => g.category === 'unsupported');
              const sortedAllGifts = [...batteryGifts, ...bagGifts, ...unsupportedGifts];

              // 1. 创建 Tab 栏
              const tabsRow = document.createElement('div');
              tabsRow.className = 'gift-drawer-tabs';
              tabsRow.innerHTML = `
                <button class="gift-tab-btn active" data-tab="battery">🔋 电池礼物 (${batteryGifts.length})</button>
                <button class="gift-tab-btn" data-tab="bag">🎒 包裹专属 (${bagGifts.length})</button>
                ${unsupportedGifts.length > 0 ? `<button class="gift-tab-btn" data-tab="unsupported">🚫 不支持/限定 (${unsupportedGifts.length})</button>` : ''}
                <button class="gift-tab-btn" data-tab="all">全部 (${sortedAllGifts.length})</button>
              `;

              // 2. 礼物滚动列表容器
              const listScroll = document.createElement('div');
              listScroll.className = 'gift-list-scroll';

              let currentTab = 'battery';

              function renderTabGifts(tabName) {
                listScroll.innerHTML = '';
                let targetList = [];
                if (tabName === 'battery') targetList = batteryGifts;
                else if (tabName === 'bag') targetList = bagGifts;
                else if (tabName === 'unsupported') targetList = unsupportedGifts;
                else targetList = sortedAllGifts;

                if (targetList.length === 0) {
                  listScroll.innerHTML = '<div class="gift-loading-tip">该分类下暂无礼物</div>';
                  return;
                }

                targetList.forEach(gift => {
                  const row = document.createElement('div');
                  row.className = 'gift-item-row';

                  // 匹配当前账号背包中是否有此道具
                  const myBagItem = Array.isArray(acc.bagItems)
                    ? acc.bagItems.find(b => String(b.giftId) === String(gift.id))
                    : null;

                  let badgeHtml = '';
                  let rowExtraClass = '';

                  if (gift.isUnsupported) {
                    rowExtraClass = 'is-unsupported';
                    badgeHtml = `<span class="gift-item-badge badge-unsupported" title="${gift.unsupportedReason}">🚫 ${gift.unsupportedReason || '不支持'}</span>`;
                    row.title = `【当前直播间不支持】${gift.unsupportedReason}`;
                  } else if (gift.isBagOnly) {
                    if (myBagItem && myBagItem.giftNum > 0) {
                      badgeHtml = `<span class="gift-item-badge badge-bag-has">🎒x${myBagItem.giftNum}</span>`;
                      row.title = `【包裹专属】背包剩余 ${myBagItem.giftNum} 个，点击直接送出 1 个`;
                    } else {
                      rowExtraClass = 'is-bag-empty';
                      badgeHtml = `<span class="gift-item-badge badge-bag-empty">🎒无库存</span>`;
                      row.title = `【包裹专属】只能从背包送出，当前背包无库存`;
                    }
                  } else {
                    badgeHtml = `<span class="gift-item-badge badge-battery">🔋${gift.battery}</span>`;
                    row.title = `【电池礼物】点击送出 1 个【${gift.name}】（消耗 ${gift.battery} 电池）`;
                  }

                  if (rowExtraClass) row.classList.add(rowExtraClass);

                  row.innerHTML = `
                    ${gift.img ? `<img class="gift-item-img" src="${gift.img}" onerror="this.style.display='none'" />` : '<span style="width:20px;flex-shrink:0;"></span>'}
                    <span class="gift-item-name">${gift.name}</span>
                    ${badgeHtml}
                  `;

                  row.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (row.classList.contains('sending')) return;

                    // 1. 若为不支持礼物，友好提示
                    if (gift.isUnsupported) {
                      showToast(`⚠️ 【${gift.name}】在当前直播间不支持赠送 (${gift.unsupportedReason || '限定礼物'})`);
                      return;
                    }

                    // 2. 若为包裹专属礼物
                    if (gift.isBagOnly) {
                      if (!myBagItem || myBagItem.giftNum <= 0) {
                        showToast(`⚠️ 【${gift.name}】只能从包裹送出，当前账号背包中无库存`);
                        return;
                      }

                      // 背包中有道具，直接走送背包道具接口
                      row.classList.add('sending');
                      try {
                        const sendBagRes = await chrome.runtime.sendMessage({
                          action: 'SEND_SINGLE_BAG_GIFT',
                          mid: acc.mid,
                          roomId: pageCtx.liveShortId,
                          bagId: myBagItem.bagId,
                          giftId: gift.id,
                          giftNum: 1
                        });

                        if (sendBagRes && sendBagRes.success) {
                          myBagItem.giftNum = Math.max(0, myBagItem.giftNum - 1);
                          if (acc.bagCount !== undefined && acc.bagCount > 0) {
                            acc.bagCount = Math.max(0, acc.bagCount - 1);
                            const bagNum = mainRow.querySelector('.bag-count-num');
                            if (bagNum) bagNum.textContent = acc.bagCount;
                          }
                          showToast(`✔【${acc.uname || acc.mid}】已送出包裹【${gift.name}】x1`);
                          renderTabGifts(currentTab);
                        } else {
                          showToast(sendBagRes?.message || '赠送失败');
                        }
                      } catch (err) {
                        showToast(`赠送异常: ${err.message}`);
                      } finally {
                        row.classList.remove('sending');
                      }
                      return;
                    }

                    // 3. 正常电池礼物扣除赠送
                    if (acc.battery < gift.battery) {
                      showToast(`⚠️ 【${acc.uname || acc.mid}】电池不足（需${gift.battery}，余${acc.battery}）`);
                      return;
                    }

                    row.classList.add('sending');
                    try {
                      const sendRes = await chrome.runtime.sendMessage({
                        action: 'SEND_GOLD_GIFT',
                        mid: acc.mid,
                        roomId: pageCtx.liveShortId,
                        giftId: gift.id,
                        price: gift.price,
                        giftNum: 1
                      });
                      if (sendRes && sendRes.success) {
                        acc.battery = Math.max(0, (acc.battery ?? 0) - gift.battery);
                        const batNum = mainRow.querySelector('.battery-num');
                        if (batNum) batNum.textContent = acc.battery;
                        batteryTag.innerHTML = `🔋 <b class="battery-num">${acc.battery}</b>电池 ▴`;
                        showToast(`✔【${acc.uname || acc.mid}】已送出【${gift.name}】x1`);
                      } else {
                        const errMsg = sendRes?.message || '送礼失败';

                        // 1. 遇到 200010 (仅限背包赠送)
                        if (errMsg.includes('200010')) {
                          gift.isBagOnly = true;
                          gift.category = 'bag';
                          if (myBagItem && myBagItem.giftNum > 0) {
                            showToast(`⚠️ 【${gift.name}】仅限背包赠送，正尝试消耗背包道具...`);
                            try {
                              const sendBagRes = await chrome.runtime.sendMessage({
                                action: 'SEND_SINGLE_BAG_GIFT',
                                mid: acc.mid,
                                roomId: pageCtx.liveShortId,
                                bagId: myBagItem.bagId,
                                giftId: gift.id,
                                giftNum: 1
                              });
                              if (sendBagRes && sendBagRes.success) {
                                myBagItem.giftNum = Math.max(0, myBagItem.giftNum - 1);
                                if (acc.bagCount !== undefined && acc.bagCount > 0) {
                                  acc.bagCount = Math.max(0, acc.bagCount - 1);
                                  const bagNum = mainRow.querySelector('.bag-count-num');
                                  if (bagNum) bagNum.textContent = acc.bagCount;
                                }
                                showToast(`✔【${acc.uname || acc.mid}】已从背包送出【${gift.name}】x1`);
                              } else {
                                showToast(sendBagRes?.message || '背包赠送失败');
                              }
                            } catch (_) {}
                          } else {
                            showToast(`⚠️ 【${gift.name}】仅限背包赠送 (代码 200010)，当前背包无库存`);
                          }
                          renderTabGifts(currentTab);
                          return;
                        }

                        // 2. 遇到 200036 (该道具不能在这个房间投喂)
                        if (errMsg.includes('200036')) {
                          gift.isUnsupported = true;
                          gift.category = 'unsupported';
                          gift.unsupportedReason = '非本房间道具';
                          showToast(`⚠️ 【${gift.name}】不能在这个房间投喂 (代码 200036)`);
                          renderTabGifts(currentTab);
                          return;
                        }

                        showToast(errMsg);
                      }
                    } catch (err) {
                      showToast(`送礼异常: ${err.message}`);
                    } finally {
                      row.classList.remove('sending');
                    }
                  });

                  listScroll.appendChild(row);
                });
              }

              // 1. 鼠标滚轮直接转换为左右横向滚动
              tabsRow.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                  e.preventDefault();
                  tabsRow.scrollLeft += e.deltaY;
                }
              }, { passive: false });

              // 2. 鼠标按住拖拽左右滑动
              let isDown = false;
              let startX = 0;
              let scrollLeftStart = 0;

              tabsRow.addEventListener('mousedown', (e) => {
                isDown = true;
                tabsRow.classList.add('is-dragging');
                startX = e.pageX - tabsRow.offsetLeft;
                scrollLeftStart = tabsRow.scrollLeft;
              });

              tabsRow.addEventListener('mouseleave', () => {
                isDown = false;
                tabsRow.classList.remove('is-dragging');
              });

              tabsRow.addEventListener('mouseup', () => {
                isDown = false;
                tabsRow.classList.remove('is-dragging');
              });

              tabsRow.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - tabsRow.offsetLeft;
                const walk = (x - startX) * 1.5; // 滑动灵敏度
                tabsRow.scrollLeft = scrollLeftStart - walk;
              });

              // 3. Tab 切换事件与点击自动居中滚动
              tabsRow.querySelectorAll('.gift-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  tabsRow.querySelectorAll('.gift-tab-btn').forEach(b => b.classList.remove('active'));
                  btn.classList.add('active');
                  btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                  currentTab = btn.dataset.tab;
                  renderTabGifts(currentTab);
                });
              });

              giftDrawer.appendChild(tabsRow);
              giftDrawer.appendChild(listScroll);

              // 默认渲染电池礼物 Tab
              renderTabGifts(currentTab);
            } catch (err) {
              giftDrawer.innerHTML = `<div class="gift-loading-tip">加载失败: ${err.message}</div>`;
            }
          });
        }

        // 点击卡片主行执行切号
        mainRow.addEventListener('click', async () => {
          if (!isExtensionValid()) {
            showToast('插件已重载，请按F5刷新页面');
            return;
          }
          if (acc.isCurrent) {
            showToast(`当前已是【${acc.uname || acc.mid}】`);
            return;
          }
          showToast(`正在切换为【${acc.uname || acc.mid}】...`);
          try {
            const switchRes = await chrome.runtime.sendMessage({
              action: 'SWITCH_MAIN_ACCOUNT',
              mid: acc.mid
            });
            if (switchRes && switchRes.success) {
              showToast(`已切换为【${acc.uname || acc.mid}】！刷新中...`);
            } else {
              showToast(`切换失败: ${switchRes?.error || '未知原因'}`);
            }
          } catch (err) {
            showToast(`异常: ${err.message}`);
          }
        });

        card.appendChild(mainRow);
        card.appendChild(drawer);
        card.appendChild(giftDrawer);
        liveAccountsList.appendChild(card);
      });
    } catch (_) {
      liveAccountsList.innerHTML = '<div style="color: #ff4d4f; font-size: 11px; padding: 10px 0; text-align: center;">读取资产失败，请重试</div>';
    } finally {
      isFetchingLiveAssets = false;
    }
  }

  if (btnRefreshLiveAssets) {
    btnRefreshLiveAssets.addEventListener('click', () => {
      renderLiveAccountsAssets();
    });
  }

  // ── 跟随发言开关 ──────────────────────────────────────────────
  const followDanmakuToggle = shadow.getElementById('follow-danmaku-toggle');
  const followDanmakuStatusText = shadow.getElementById('follow-danmaku-status-text');

  /** 同步开关 UI 状态（不触发 storage 写入） */
  function syncFollowDanmakuUI(enabled) {
    if (!followDanmakuToggle) return;
    followDanmakuToggle.checked = !!enabled;
    if (followDanmakuStatusText) {
      followDanmakuStatusText.classList.toggle('is-on', !!enabled);
      followDanmakuStatusText.style.opacity = enabled ? '1' : '0.45';
    }
  }

  /** 从 storage 读取当前设置并同步开关初始状态 */
  async function initFollowDanmakuToggle() {
    if (!isExtensionValid() || !followDanmakuToggle) return;
    try {
      const res = await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });
      const enabled = res?.settings?.autoFollowDanmaku !== false;
      syncFollowDanmakuUI(enabled);
    } catch (_) {}
  }

  if (followDanmakuToggle) {
    followDanmakuToggle.addEventListener('change', async () => {
      if (!isExtensionValid()) return;
      const enabled = followDanmakuToggle.checked;
      syncFollowDanmakuUI(enabled);
      try {
        await chrome.runtime.sendMessage({
          action: 'UPDATE_SETTING',
          key: 'autoFollowDanmaku',
          value: enabled
        });
        showToast(enabled ? '💬 跟随发言已开启' : '💬 跟随发言已关闭（副账号仍在线）');
      } catch (err) {
        showToast(`设置保存失败: ${err.message}`);
      }
    });
  }
  // ─────────────────────────────────────────────────────────────

  async function refreshData() {
    if (!isExtensionValid()) return;
    try {
      const pageCtx = getPageContext();
      const res = await chrome.storage.local.get({ accounts: [] });
      const accounts = Array.isArray(res?.accounts) ? res.accounts : [];

      const enabledAccounts = accounts.filter(a => a && a.enabled);
      if (badge) badge.textContent = enabledAccounts.length;
      if (accountsCountLabel) accountsCountLabel.textContent = `${accounts.length}个`;

      if (pageCtx.isLive) {
        if (normalAccountsBox) normalAccountsBox.style.display = 'none';
        if (liveAccountsSection) liveAccountsSection.style.display = 'flex';
        initFollowDanmakuToggle();
        renderLiveAccountsAssets();
      } else {
        if (normalAccountsBox) normalAccountsBox.style.display = 'block';
        if (liveAccountsSection) liveAccountsSection.style.display = 'none';
      }

      const current = accounts.find(a => a && a.isCurrent);
      if (current) {
        if (mainAvatar) mainAvatar.src = current.face || 'https://static.hdslb.com/images/member/noface.gif';
        if (mainName) mainName.textContent = current.uname || 'B站用户';
        if (mainTag) {
          mainTag.textContent = '当前主账号 (网页生效中)';
          mainTag.style.color = '#2ac864';
        }
      } else {
        if (mainAvatar) mainAvatar.src = 'https://static.hdslb.com/images/member/noface.gif';
        if (mainName) mainName.textContent = '未登录 / 未设置主号';
        if (mainTag) {
          mainTag.textContent = '点击下方头像可一键切换';
          mainTag.style.color = '#9499a0';
        }
      }

      if (accountsScroll) {
        if (accounts.length === 0) {
          accountsScroll.innerHTML = '<div style="color: #9499a0; font-size: 11px; padding: 6px 0;">暂无账号，点击下方登录</div>';
        } else {
          accountsScroll.innerHTML = '';
          accounts.filter(a => a && a.mid).forEach(acc => {
            const item = document.createElement('div');
            item.className = `account-item ${acc.isCurrent ? 'is-current' : ''}`;
            item.title = `点击切换为【${acc.uname || acc.mid}】`;
            item.innerHTML = `
              <div class="item-avatar-wrap">
                <img class="item-avatar" src="${acc.face || 'https://static.hdslb.com/images/member/noface.gif'}" onerror="this.src='https://static.hdslb.com/images/member/noface.gif'" />
                ${acc.isCurrent ? '<span class="badge-curr">主</span>' : ''}
              </div>
              <span class="item-name">${acc.uname || acc.mid}</span>
            `;

            item.addEventListener('click', async () => {
              if (!isExtensionValid()) {
                showToast('插件已重载，请按F5刷新页面');
                return;
              }
              if (acc.isCurrent) {
                showToast(`当前已是【${acc.uname || acc.mid}】`);
                return;
              }
              showToast(`正在切换为【${acc.uname || acc.mid}】...`);
              try {
                const switchRes = await chrome.runtime.sendMessage({
                  action: 'SWITCH_MAIN_ACCOUNT',
                  mid: acc.mid
                });
                if (switchRes && switchRes.success) {
                  showToast(`已切换为【${acc.uname || acc.mid}】！刷新中...`);
                } else {
                  showToast(`切换失败: ${switchRes?.error || '未知原因'}`);
                }
              } catch (err) {
                showToast(`异常: ${err.message}`);
              }
            });

            accountsScroll.appendChild(item);
          });
        }
      }
    } catch (_) {
      // 静默处理，避免 Chrome 扩展管理面板将刷新重试当成错误红标记录
    }
  }

  // 监听来自后台的自动跟随点赞/取消点赞/直播弹幕结果通知 (轻量胶囊气泡浮现，绝不弹窗打扰)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'NOTIFY_FOLLOW_LIKE_RESULT' && msg.data) {
      const { successCount, failedCount, total, lastFailReason, likeAction } = msg.data;
      const isUnlike = (likeAction === 2);
      const actionName = isUnlike ? '取消点赞' : '点赞';

      if (total > 0) {
        if (successCount > 0 && failedCount === 0) {
          showFollowCapsule(`<span>👍</span><span>副账号已跟随${actionName} (${successCount}/${total})</span>`, 2800);
        } else if (successCount > 0 && failedCount > 0) {
          showFollowCapsule(`<span>👍</span><span>副账号已跟随${actionName} (${successCount}/${total})</span><span style="opacity:0.8;font-size:10px;">(部分异常)</span>`, 3200);
        } else {
          showFollowCapsule(`<span>⚠️</span><span>副账号跟随${actionName}失败: ${lastFailReason || '请检查副账号状态'}</span>`, 3600);
        }
      }
    } else if (msg.action === 'NOTIFY_FOLLOW_DANMAKU_RESULT' && msg.data) {
      const { successCount, failedCount, total, lastFailReason } = msg.data;
      if (total > 0) {
        if (successCount > 0 && failedCount === 0) {
          showFollowCapsule(`<span>💬</span><span>副账号已跟随发言 (${successCount}/${total})</span>`, 2800);
        } else if (successCount > 0 && failedCount > 0) {
          showFollowCapsule(`<span>💬</span><span>副账号已跟随发言 (${successCount}/${total})</span><span style="opacity:0.8;font-size:10px;">(部分异常)</span>`, 3200);
        } else {
          showFollowCapsule(`<span>⚠️</span><span>副账号跟随发言失败: ${lastFailReason || '请检查副账号状态'}</span>`, 3600);
        }
      }
    }
  });

  // 监听网页原生主账号点赞/取消点赞动作 (点击点赞按钮或快捷键 'q'，作为双重兜底感知)
  function setupNativeLikeDetector() {
    // 监听页面点击事件
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const likeBtn = target.closest(
        '.video-like, .like-item, .video-like-info, [aria-label*="点赞"], [title*="点赞"], .toolbar-left-item-wrap .like'
      );
      if (likeBtn) {
        const pageCtx = getPageContext();
        if (pageCtx.isVideo && pageCtx.bvid) {
          // 判断当前按钮是否已经处于激活状态（若已激活，则点击是取消点赞）
          const isCurrentlyLiked = likeBtn.classList.contains('on') ||
            likeBtn.classList.contains('active') ||
            likeBtn.classList.contains('is-active') ||
            likeBtn.getAttribute('aria-pressed') === 'true';

          const likeAction = isCurrentlyLiked ? 2 : 1;

          chrome.runtime.sendMessage({
            action: 'TRIGGER_AUTO_FOLLOW_LIKE',
            bvid: pageCtx.bvid,
            likeAction
          }).catch(() => {});
        }
      }
    }, true);

    // 监听键盘快捷键 'q' (B站视频默认点赞快捷键)
    document.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
      }
      if (e.key === 'q' || e.key === 'Q') {
        const pageCtx = getPageContext();
        if (pageCtx.isVideo && pageCtx.bvid) {
          const likeBtn = document.querySelector(
            '.video-like, .like-item, .video-like-info, [aria-label*="点赞"], [title*="点赞"]'
          );
          const isCurrentlyLiked = likeBtn ? (
            likeBtn.classList.contains('on') ||
            likeBtn.classList.contains('active') ||
            likeBtn.classList.contains('is-active') ||
            likeBtn.getAttribute('aria-pressed') === 'true'
          ) : false;

          const likeAction = isCurrentlyLiked ? 2 : 1;

          chrome.runtime.sendMessage({
            action: 'TRIGGER_AUTO_FOLLOW_LIKE',
            bvid: pageCtx.bvid,
            likeAction
          }).catch(() => {});
        }
      }
    }, true);
  }

  // 监听网页原生直播间弹幕输入与发送交互 (作为双重兜底感知)
  function setupNativeDanmakuDetector() {
    // 监听原生发送按钮点击
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const sendBtn = target.closest(
        '.chat-input-cntr .bottom-actions .btn-section, .chat-input-border .send-btn, [class*="send-btn"], .control-panel-ctnr .danmaku-send'
      );
      if (sendBtn) {
        const pageCtx = getPageContext();
        if (pageCtx.isLive && pageCtx.liveShortId) {
          const inputEl = document.querySelector(
            '.chat-input-border textarea, .chat-input, textarea[placeholder*="弹幕"], input[placeholder*="弹幕"]'
          );
          const msg = inputEl ? inputEl.value.trim() : '';
          if (msg) {
            chrome.runtime.sendMessage({
              action: 'TRIGGER_AUTO_FOLLOW_DANMAKU',
              roomId: pageCtx.liveShortId,
              message: msg
            }).catch(() => {});
          }
        }
      }
    }, true);

    // 监听原生弹幕输入框的回车按键发送
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target;
        if (!target) return;
        const isDanmakuInput = target.matches(
          '.chat-input-border textarea, .chat-input, textarea[placeholder*="弹幕"], input[placeholder*="弹幕"]'
        );
        if (isDanmakuInput) {
          const pageCtx = getPageContext();
          if (pageCtx.isLive && pageCtx.liveShortId) {
            const msg = target.value.trim();
            if (msg) {
              chrome.runtime.sendMessage({
                action: 'TRIGGER_AUTO_FOLLOW_DANMAKU',
                roomId: pageCtx.liveShortId,
                message: msg
              }).catch(() => {});
            }
          }
        }
      }
    }, true);
  }

  setupNativeLikeDetector();
  setupNativeDanmakuDetector();

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
    if (!isExtensionValid()) return;
    if (area === 'local' && changes.accounts) {
      refreshData();
    }
  });

  if (isExtensionValid()) {
    refreshData();
  }
})();
