import { Storage } from './utils/storage.js';
import { BiliApi } from './utils/bili-api.js';

// 用于 DNR 修改 Cookie 的固定规则 ID
const DNR_RULE_ID = 8888;

/**
 * 互斥锁，确保带特定 Cookie 的后台请求按序执行，不互相干扰
 */
class AsyncLock {
  constructor() {
    this.queue = Promise.resolve();
  }
  run(fn) {
    const result = this.queue.then(() => fn());
    this.queue = result.catch(() => {});
    return result;
  }
}

const requestLock = new AsyncLock();

/**
 * 设置当前请求的 Session Cookie (通过 declarativeNetRequest)
 */
async function setTargetCookieRule(account) {
  const cookieParts = [
    `SESSDATA=${account.sessdata}`,
    `bili_jct=${account.bili_jct}`,
    `DedeUserID=${account.dedeUserId || account.mid}`,
    `DedeUserID__ckMd5=${account.dedeUserId_ckMd5 || ''}`
  ];
  const cookieStr = cookieParts.join('; ');

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_RULE_ID],
    addRules: [{
      id: DNR_RULE_ID,
      priority: 99,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Cookie', operation: 'set', value: cookieStr },
          { header: 'User-Agent', operation: 'set', value: navigator.userAgent }
        ]
      },
      condition: {
        urlFilter: 'bilibili.com',
        resourceTypes: ['xmlhttprequest']
      }
    }]
  });
}

/**
 * 清除 Session 临时 Cookie 规则
 */
async function clearTargetCookieRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [DNR_RULE_ID]
    });
  } catch (err) {
    console.warn('清除 DNR 规则失败:', err);
  }
}

/**
 * 带指定账号凭证发起请求
 */
async function fetchWithAccount(account, url, options = {}) {
  return requestLock.run(async () => {
    try {
      await setTargetCookieRule(account);
      const res = await fetch(url, options);
      return await res.json();
    } finally {
      await clearTargetCookieRule();
    }
  });
}

/**
 * 获取账号详细信息 (用户名、头像等)
 */
async function fetchAccountProfile(account) {
  const res = await fetchWithAccount(account, 'https://api.bilibili.com/x/web-interface/nav', {
    headers: { 'Accept': 'application/json' }
  });
  if (res && res.code === 0 && res.data && res.data.isLogin) {
    return {
      mid: String(res.data.mid),
      uname: res.data.uname,
      face: res.data.face,
      level: res.data.level_info?.current_level || 0,
      money: res.data.money || 0
    };
  }
  return null;
}

/**
 * 从浏览器当前作用域中读取 B 站登录凭据并自动入库/更新
 */
async function syncCurrentBrowserAccount() {
  const cookies = await chrome.cookies.getAll({ domain: '.bilibili.com' });
  const cookieMap = {};
  cookies.forEach(c => {
    cookieMap[c.name] = c.value;
  });

  const sessdata = cookieMap['SESSDATA'];
  const bili_jct = cookieMap['bili_jct'];
  const dedeUserId = cookieMap['DedeUserID'];
  const dedeUserId_ckMd5 = cookieMap['DedeUserID__ckMd5'];

  if (!sessdata || !dedeUserId) {
    const accounts = await Storage.getAccounts();
    accounts.forEach(a => a.isCurrent = false);
    await chrome.storage.local.set({ accounts });
    return { isLogin: false, account: null };
  }

  const tempAccount = {
    sessdata,
    bili_jct: bili_jct || '',
    dedeUserId,
    dedeUserId_ckMd5: dedeUserId_ckMd5 || '',
    mid: dedeUserId
  };

  const profile = await fetchAccountProfile(tempAccount);
  if (!profile) {
    return { isLogin: false, account: null };
  }

  const accountData = {
    mid: profile.mid,
    uname: profile.uname,
    face: profile.face,
    level: profile.level,
    sessdata,
    bili_jct: bili_jct || '',
    dedeUserId,
    dedeUserId_ckMd5: dedeUserId_ckMd5 || '',
    enabled: true,
    isCurrent: true
  };

  await Storage.saveAccount(accountData);
  await Storage.setMainAccount(accountData.mid);

  return { isLogin: true, account: accountData };
}

/**
 * 准备在网页端登录新账号（保存当前号后，清除网页Cookie并引导至登录页）
 */
async function prepareLoginNewAccount() {
  await syncCurrentBrowserAccount();

  const loginCookieNames = [
    'SESSDATA',
    'bili_jct',
    'DedeUserID',
    'DedeUserID__ckMd5',
    'sid',
    'bili_ticket',
    'bili_ticket_expires'
  ];

  const cookies = await chrome.cookies.getAll({ domain: '.bilibili.com' });
  for (const c of cookies) {
    if (loginCookieNames.includes(c.name)) {
      await chrome.cookies.remove({
        url: `https://www.bilibili.com${c.path}`,
        name: c.name
      });
      await chrome.cookies.remove({
        url: `https://passport.bilibili.com${c.path}`,
        name: c.name
      });
    }
  }

  const accounts = await Storage.getAccounts();
  accounts.forEach(a => a.isCurrent = false);
  await chrome.storage.local.set({ accounts });

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0 && tabs[0].url && tabs[0].url.includes('bilibili.com')) {
    chrome.tabs.update(tabs[0].id, { url: 'https://passport.bilibili.com/login' });
  } else {
    chrome.tabs.create({ url: 'https://passport.bilibili.com/login' });
  }

  return { success: true };
}

/**
 * 切换主账号：将对应账号的 Cookie 写入当前浏览器作用域
 */
async function switchMainAccount(mid) {
  const accounts = await Storage.getAccounts();
  const target = accounts.find(a => a.mid === mid);
  if (!target) {
    throw new Error('未找到对应账号');
  }

  const domain = '.bilibili.com';
  const url = 'https://www.bilibili.com';
  const expires = Math.floor(Date.now() / 1000) + 180 * 86400; // 180天

  await chrome.cookies.set({
    url,
    domain,
    name: 'SESSDATA',
    value: target.sessdata,
    path: '/',
    secure: true,
    httpOnly: true,
    expirationDate: expires
  });

  await chrome.cookies.set({
    url,
    domain,
    name: 'bili_jct',
    value: target.bili_jct,
    path: '/',
    secure: false,
    httpOnly: false,
    expirationDate: expires
  });

  await chrome.cookies.set({
    url,
    domain,
    name: 'DedeUserID',
    value: target.dedeUserId || target.mid,
    path: '/',
    secure: false,
    httpOnly: false,
    expirationDate: expires
  });

  if (target.dedeUserId_ckMd5) {
    await chrome.cookies.set({
      url,
      domain,
      name: 'DedeUserID__ckMd5',
      value: target.dedeUserId_ckMd5,
      path: '/',
      secure: false,
      httpOnly: false,
      expirationDate: expires
    });
  }

  await Storage.setMainAccount(mid);

  const settings = await Storage.getSettings();
  if (settings.autoRefreshTab) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].url && tabs[0].url.includes('bilibili.com')) {
      chrome.tabs.reload(tabs[0].id);
    }
  }

  return { success: true, target };
}

/**
 * 辅助函数：睡眠延时
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 单个账号发送弹幕
 */
async function sendSingleDanmaku(account, roomId, message) {
  const body = new URLSearchParams({
    bubble: '0',
    msg: message,
    color: '16777215',
    mode: '1',
    roomid: String(roomId),
    rnd: String(Math.floor(Date.now() / 1000)),
    fontsize: '25',
    csrf: account.bili_jct,
    csrf_token: account.bili_jct
  });

  const res = await fetchWithAccount(account, 'https://api.live.bilibili.com/msg/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  return res;
}

/**
 * 多账号同时在直播间发言 (带防风控离散延时)
 */
async function sendDanmakuAll(roomId, message) {
  const accounts = await Storage.getEnabledAccounts();
  if (!accounts || accounts.length === 0) {
    return { success: false, message: '当前没有已启用的账号', results: [] };
  }

  const settings = await Storage.getSettings();
  const results = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    
    if (i > 0) {
      const min = settings.delayMin || 500;
      const max = settings.delayMax || 1500;
      const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
      await sleep(randomDelay);
    }

    try {
      const resp = await sendSingleDanmaku(account, roomId, message);
      if (resp && resp.code === 0) {
        results.push({
          mid: account.mid,
          uname: account.uname,
          success: true,
          message: '发送成功'
        });
      } else {
        results.push({
          mid: account.mid,
          uname: account.uname,
          success: false,
          message: resp?.message || `发送失败(错误码: ${resp?.code})`
        });
      }
    } catch (err) {
      results.push({
        mid: account.mid,
        uname: account.uname,
        success: false,
        message: err.message || '网络请求异常'
      });
    }
  }

  const allSuccess = results.every(r => r.success);
  return {
    success: allSuccess,
    results
  };
}

/**
 * 单账号送出免费礼物（优先背包礼物，其次小心心，绝不扣费）
 */
async function sendSingleFreeGift(account, roomId, anchorUid) {
  // 1. 查询背包礼物
  const bagRes = await fetchWithAccount(
    account,
    `https://api.live.bilibili.com/xlive/web-room/v1/gift/bag_list?t=${Date.now()}&room_id=${roomId}`,
    { headers: { 'Accept': 'application/json' } }
  );

  if (bagRes && bagRes.code === 0 && bagRes.data && bagRes.data.list && bagRes.data.list.length > 0) {
    const item = bagRes.data.list[0];
    const sendBagBody = new URLSearchParams({
      uid: String(account.mid),
      gift_id: String(item.gift_id),
      ruid: String(anchorUid),
      send_ruid: '0',
      gift_num: '1',
      bag_id: String(item.bag_id),
      platform: 'pc',
      biz_code: 'live',
      biz_id: String(roomId),
      rnd: String(Math.floor(Date.now() / 1000)),
      price: '0',
      csrf: account.bili_jct,
      csrf_token: account.bili_jct
    });

    const sendRes = await fetchWithAccount(account, 'https://api.live.bilibili.com/xlive/revenue/v1/gift/sendBag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: sendBagBody.toString()
    });

    if (sendRes && sendRes.code === 0) {
      return { success: true, message: `赠送背包【${item.gift_name}】x1 成功` };
    }
  }

  // 2. 背包无礼物，尝试送免费小心心
  const sendWebBody = new URLSearchParams({
    biz_id: String(roomId),
    biz_code: 'live',
    gift_id: '30607', // 小心心
    gift_num: '1',
    coin_type: 'silver',
    ruid: String(anchorUid),
    csrf: account.bili_jct,
    csrf_token: account.bili_jct
  });

  const webRes = await fetchWithAccount(account, 'https://api.live.bilibili.com/xlive/revenue/v1/gift/sendWeb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: sendWebBody.toString()
  });

  if (webRes && webRes.code === 0) {
    return { success: true, message: '赠送【小心心】x1 成功' };
  } else {
    return { success: false, message: webRes?.message || '无可用免费礼物/已达今日上限' };
  }
}

/**
 * 全账号同时赠送免费礼物 (带防风控离散延时)
 */
async function sendFreeGiftAll(roomId) {
  const accounts = await Storage.getEnabledAccounts();
  if (!accounts || accounts.length === 0) {
    return { success: false, message: '当前没有已启用的账号', results: [] };
  }

  // 获取真实房间号与主播 UID
  const roomDetails = await BiliApi.getRoomDetails(roomId);
  const realRoomId = roomDetails.roomId;
  const anchorUid = roomDetails.anchorUid;

  const settings = await Storage.getSettings();
  const results = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (i > 0) {
      const min = settings.delayMin || 500;
      const max = settings.delayMax || 1500;
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      await sleep(delay);
    }

    try {
      const res = await sendSingleFreeGift(account, realRoomId, anchorUid);
      results.push({
        mid: account.mid,
        uname: account.uname,
        success: res.success,
        message: res.message
      });
    } catch (err) {
      results.push({
        mid: account.mid,
        uname: account.uname,
        success: false,
        message: err.message || '网络异常'
      });
    }
  }

  const allSuccess = results.some(r => r.success);
  return { success: allSuccess, results };
}

/**
 * 单账号视频点赞
 */
async function sendSingleVideoLike(account, bvid, like = 1) {
  const body = new URLSearchParams({
    bvid,
    like: String(like),
    csrf: account.bili_jct
  });

  const res = await fetchWithAccount(account, 'https://api.bilibili.com/x/web-interface/archive/like', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  return res;
}

/**
 * 全账号同时视频点赞 (带防风控离散延时)
 */
async function sendVideoLikeAll(bvid, like = 1) {
  const accounts = await Storage.getEnabledAccounts();
  if (!accounts || accounts.length === 0) {
    return { success: false, message: '当前没有已启用的账号', results: [] };
  }

  const settings = await Storage.getSettings();
  const results = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (i > 0) {
      const min = settings.delayMin || 500;
      const max = settings.delayMax || 1500;
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      await sleep(delay);
    }

    try {
      const resp = await sendSingleVideoLike(account, bvid, like);
      if (resp && (resp.code === 0 || resp.code === 65006)) {
        results.push({
          mid: account.mid,
          uname: account.uname,
          success: true,
          message: resp.code === 65006 ? '已点赞' : '点赞成功'
        });
      } else {
        results.push({
          mid: account.mid,
          uname: account.uname,
          success: false,
          message: resp?.message || `失败(${resp?.code})`
        });
      }
    } catch (err) {
      results.push({
        mid: account.mid,
        uname: account.uname,
        success: false,
        message: err.message || '网络异常'
      });
    }
  }

  const allSuccess = results.every(r => r.success);
  return { success: allSuccess, results };
}

/**
 * 单账号视频一键三连 (点赞+投币+收藏)
 */
async function sendSingleVideoTriple(account, bvid) {
  const body = new URLSearchParams({
    bvid,
    csrf: account.bili_jct
  });

  const res = await fetchWithAccount(account, 'https://api.bilibili.com/x/web-interface/archive/like/triple', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  return res;
}

/**
 * 全账号同时视频一键三连 (带防风控离散延时)
 */
async function sendVideoTripleAll(bvid) {
  const accounts = await Storage.getEnabledAccounts();
  if (!accounts || accounts.length === 0) {
    return { success: false, message: '当前没有已启用的账号', results: [] };
  }

  const settings = await Storage.getSettings();
  const results = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    if (i > 0) {
      const min = settings.delayMin || 500;
      const max = settings.delayMax || 1500;
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      await sleep(delay);
    }

    try {
      const resp = await sendSingleVideoTriple(account, bvid);
      if (resp && (resp.code === 0 || resp.code === 34005)) {
        results.push({
          mid: account.mid,
          uname: account.uname,
          success: true,
          message: resp.code === 34005 ? '已三连过' : '三连成功'
        });
      } else {
        results.push({
          mid: account.mid,
          uname: account.uname,
          success: false,
          message: resp?.message || `失败(${resp?.code})`
        });
      }
    } catch (err) {
      results.push({
        mid: account.mid,
        uname: account.uname,
        success: false,
        message: err.message || '网络异常'
      });
    }
  }

  const allSuccess = results.every(r => r.success);
  return { success: allSuccess, results };
}

// 防抖计时器，避免 Cookie 多次触发
let cookieSyncDebounce = null;

// 监听浏览器 Cookie 变动，实现全自动发现新登录账号
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain.includes('bilibili.com') && changeInfo.cookie.name === 'SESSDATA') {
    if (!changeInfo.removed) {
      if (cookieSyncDebounce) clearTimeout(cookieSyncDebounce);
      cookieSyncDebounce = setTimeout(async () => {
        try {
          await syncCurrentBrowserAccount();
        } catch (err) {
          console.warn('自动发现账号失败:', err);
        }
      }, 800);
    }
  }
});

/**
 * 监听来自 Popup 与 Content Script 的消息路由
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleMessage = async () => {
    switch (request.action) {
      case 'SYNC_CURRENT_ACCOUNT': {
        const res = await syncCurrentBrowserAccount();
        return { success: true, ...res };
      }

      case 'PREPARE_LOGIN_NEW': {
        const res = await prepareLoginNewAccount();
        return res;
      }

      case 'GET_QR_CODE': {
        const qrData = await BiliApi.generateQrCode();
        return { success: true, data: qrData };
      }

      case 'POLL_QR_CODE': {
        const pollRes = await BiliApi.pollQrCode(request.qrcodeKey);
        if (pollRes.code === 0 && pollRes.cookies) {
          const profile = await fetchAccountProfile({
            sessdata: pollRes.cookies.sessdata,
            bili_jct: pollRes.cookies.bili_jct,
            dedeUserId: pollRes.cookies.dedeUserId,
            dedeUserId_ckMd5: pollRes.cookies.dedeUserId_ckMd5
          });

          const account = {
            mid: profile?.mid || pollRes.cookies.dedeUserId,
            uname: profile?.uname || `B站用户_${pollRes.cookies.dedeUserId}`,
            face: profile?.face || 'https://static.hdslb.com/images/member/noface.gif',
            level: profile?.level || 0,
            sessdata: pollRes.cookies.sessdata,
            bili_jct: pollRes.cookies.bili_jct,
            dedeUserId: pollRes.cookies.dedeUserId,
            dedeUserId_ckMd5: pollRes.cookies.dedeUserId_ckMd5,
            enabled: true
          };

          const accounts = await Storage.saveAccount(account);
          if (accounts.length === 1) {
            await switchMainAccount(account.mid);
          }

          return { success: true, status: 'SUCCESS', account };
        }
        return { success: true, status: pollRes.code, message: pollRes.message };
      }

      case 'SWITCH_MAIN_ACCOUNT': {
        const res = await switchMainAccount(request.mid);
        return { success: true, data: res };
      }

      case 'TOGGLE_ACCOUNT': {
        const accounts = await Storage.toggleAccount(request.mid, request.enabled);
        return { success: true, accounts };
      }

      case 'DELETE_ACCOUNT': {
        const accounts = await Storage.deleteAccount(request.mid);
        return { success: true, accounts };
      }

      // 直播间弹幕与送礼
      case 'GET_REAL_ROOM_ID': {
        const realRoomId = await BiliApi.getRealRoomId(request.roomId);
        return { success: true, realRoomId };
      }

      case 'SEND_DANMAKU_ALL': {
        const res = await sendDanmakuAll(request.roomId, request.message);
        return res;
      }

      case 'SEND_FREE_GIFT_ALL': {
        const res = await sendFreeGiftAll(request.roomId);
        return res;
      }

      // 视频点赞与一键三连
      case 'SEND_VIDEO_LIKE_ALL': {
        const res = await sendVideoLikeAll(request.bvid, request.like ?? 1);
        return res;
      }

      case 'SEND_VIDEO_TRIPLE_ALL': {
        const res = await sendVideoTripleAll(request.bvid);
        return res;
      }

      case 'GET_ACTIVE_LIVE_INFO': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].url) {
          const match = tabs[0].url.match(/live\.bilibili\.com\/([0-9]+)/);
          if (match && match[1]) {
            try {
              const realRoomId = await BiliApi.getRealRoomId(match[1]);
              return { success: true, inLive: true, shortId: match[1], realRoomId, title: tabs[0].title };
            } catch (e) {
              return { success: true, inLive: true, shortId: match[1], realRoomId: match[1] };
            }
          }
        }
        return { success: true, inLive: false };
      }

      default:
        return { success: false, error: '未知操作指令' };
    }
  };

  handleMessage()
    .then(sendResponse)
    .catch(err => {
      console.error('Background 处理异常:', err);
      sendResponse({ success: false, error: err.message || String(err) });
    });

  return true;
});
