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
async function setTargetCookieRule(account, targetUrl = '') {
  const cookieParts = [
    `SESSDATA=${account.sessdata}`,
    `bili_jct=${account.bili_jct}`,
    `DedeUserID=${account.dedeUserId || account.mid}`,
    `DedeUserID__ckMd5=${account.dedeUserId_ckMd5 || ''}`
  ];
  const cookieStr = cookieParts.join('; ');

  const isLive = typeof targetUrl === 'string' && targetUrl.includes('live.bilibili.com');
  const origin = isLive ? 'https://live.bilibili.com' : 'https://www.bilibili.com';
  const referer = isLive ? 'https://live.bilibili.com/' : 'https://www.bilibili.com';

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_RULE_ID],
    addRules: [{
      id: DNR_RULE_ID,
      priority: 99,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Cookie', operation: 'set', value: cookieStr },
          { header: 'Origin', operation: 'set', value: origin },
          { header: 'Referer', operation: 'set', value: referer },
          { header: 'User-Agent', operation: 'set', value: navigator.userAgent }
        ]
      },
      condition: {
        urlFilter: 'bilibili.com',
        resourceTypes: ['xmlhttprequest', 'other']
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
      await setTargetCookieRule(account, url);
      const res = await fetch(url, options);
      const rawText = await res.text();
      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        // 尝试提取花括号内的合法 JSON（防御前缀或尾随内容）
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            data = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
          } catch (_) {}
        }
        if (!data) {
          const preview = rawText.trim().slice(0, 60);
          throw new Error(`接口响应非标准JSON(HTTP ${res.status}): ${preview || '空内容'}`);
        }
      }
      return data;
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
    csrf: account.bili_jct || '',
    csrf_token: account.bili_jct || ''
  });

  const res = await fetchWithAccount(account, 'https://api.live.bilibili.com/msg/send?_from_multi_acc=1', {
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
      const min = settings.delayMin ?? 100;
      const max = settings.delayMax ?? 400;
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
      const min = settings.delayMin ?? 100;
      const max = settings.delayMax ?? 400;
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
 * 获取直播间全部礼物列表（包含电池礼物、包裹专属礼物、不支持/限定礼物分类）
 */
async function fetchRoomGiftList(account, realRoomId) {
  const res = await fetchWithAccount(
    account,
    `https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig?platform=pc&room_id=${realRoomId}&area_id=&area_parent_id=&version=0&build=1`,
    { headers: { 'Accept': 'application/json' } }
  );

  if (res && res.code === 0 && res.data && Array.isArray(res.data.list)) {
    const list = res.data.list.map(g => {
      // 1. 判断是否当前房间不支持 / 专属限定
      const isBoundOtherRoom = (g.bind_roomid > 0 && String(g.bind_roomid) !== String(realRoomId));
      const isPrivilegeRequired = (g.privilege_required > 0);
      const isUnsupported = isBoundOtherRoom || isPrivilegeRequired;
      let unsupportedReason = '';
      if (isBoundOtherRoom) {
        unsupportedReason = `房间限定(${g.bind_roomid})`;
      } else if (isPrivilegeRequired) {
        unsupportedReason = '需特权身份';
      }

      // 2. 判断是否只能从包裹/背包送出 (免费活动道具/银瓜子道具/价格为0的包裹道具)
      const isBagOnly = !isUnsupported && (g.price === 0 || g.coin_type === 'silver');

      // 3. 正常电池金瓜子礼物
      const isBattery = !isUnsupported && !isBagOnly && (g.coin_type === 'gold' && g.price > 0);

      let category = 'battery';
      if (isUnsupported) {
        category = 'unsupported';
      } else if (isBagOnly) {
        category = 'bag';
      }

      return {
        id: g.id,
        name: g.name,
        price: g.price || 0,
        coinType: g.coin_type || 'gold',
        battery: Math.ceil((g.price || 0) / 100),
        img: g.img_basic || '',
        category, // 'battery' | 'bag' | 'unsupported'
        isUnsupported,
        unsupportedReason,
        isBagOnly,
        isBattery,
        cornerMark: g.corner_mark || ''
      };
    });

    // 默认排序：电池礼物按价格升序，包裹专属按 id 排序
    return list.sort((a, b) => {
      if (a.category === 'battery' && b.category === 'battery') {
        return a.price - b.price;
      }
      return 0;
    });
  }
  return [];
}

/**
 * 单账号送出直播间金瓜子礼物（扣电池）
 */
async function sendSingleGoldGift(account, roomId, anchorUid, giftId, giftPrice = 0, giftNum = 1) {
  const rnd = Math.floor(Date.now() / 1000);
  const commonParams = {
    uid: String(account.mid),
    gift_id: String(giftId),
    ruid: String(anchorUid),
    send_ruid: '0',
    gift_num: String(giftNum),
    coin_type: 'gold',
    bag_id: '0',
    platform: 'pc',
    biz_code: 'Live',
    biz_id: String(roomId),
    rnd: String(rnd),
    storm_beat_id: '0',
    metadata: '',
    price: String(giftPrice || '0'),
    csrf: account.bili_jct || '',
    csrf_token: account.bili_jct || '',
    visit_id: ''
  };

  const body = new URLSearchParams(commonParams);

  try {
    // 官方有效送礼接口
    const res = await fetchWithAccount(account, 'https://api.live.bilibili.com/gift/v2/gift/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (res && res.code === 0) {
      return { success: true, message: '送礼成功' };
    }

    const errCode = res?.code !== undefined ? res.code : -1;
    const errMsg = res?.message || res?.msg || '送礼失败';
    return { success: false, message: `${errMsg} (代码: ${errCode})` };
  } catch (err) {
    return { success: false, message: `网络异常: ${err.message}` };
  }
}

/**
 * 获取单个账号在直播间的资产 (电池、背包道具数量) 以及连接状态
 */
async function fetchAccountLiveAssets(account) {
  let battery = 0;
  let bagCount = 0;
  let bagItems = [];
  let status = 'online';

  try {
    // 1. 查询直播用户信息与电池 (底层接口 gold 字段为金瓜子，1 电池 = 100 金瓜子)
    const userRes = await fetchWithAccount(
      account,
      'https://api.live.bilibili.com/xlive/web-ucenter/user/get_user_info',
      { headers: { 'Accept': 'application/json' } }
    );

    if (userRes && userRes.code === 0 && userRes.data) {
      // 换算为实际真实电池数 (例 3200 金瓜子 => 32 电池)
      const rawGold = userRes.data.gold ?? 0;
      battery = Math.floor(rawGold / 100);
    } else if (userRes && userRes.code === -101) {
      status = 'expired';
    }

    // 2. 查询背包礼物列表与明细
    const bagRes = await fetchWithAccount(
      account,
      `https://api.live.bilibili.com/xlive/web-room/v1/gift/bag_list?t=${Date.now()}`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (bagRes && bagRes.code === 0 && bagRes.data && Array.isArray(bagRes.data.list)) {
      for (const item of bagRes.data.list) {
        bagCount += (item.gift_num || 1);
        bagItems.push({
          bag_id: item.bag_id,
          gift_id: item.gift_id,
          gift_name: item.gift_name,
          gift_num: item.gift_num,
          expire_at: item.expire_at,
          corner_mark: item.corner_mark
        });
      }
    }
  } catch (err) {
    status = 'offline';
  }

  return {
    battery,
    bagCount,
    bagItems,
    status
  };
}

/**
 * 批量获取所有已录入账号的直播间资产与连接状态
 */
async function getAccountsLiveStatus() {
  const accounts = await Storage.getAccounts();
  
  // 获取当前主账号 mid
  let currentMid = null;
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'DedeUserID' });
    if (cookie && cookie.value) {
      currentMid = String(cookie.value);
    }
  } catch (e) {}

  if (!currentMid) {
    const currentAcc = accounts.find(a => a.isCurrent);
    if (currentAcc) currentMid = String(currentAcc.mid);
  }

  const results = [];
  for (const acc of accounts) {
    const isCurrent = (String(acc.mid) === String(currentMid));
    const assets = await fetchAccountLiveAssets(acc);
    results.push({
      mid: acc.mid,
      uname: acc.uname,
      face: acc.face,
      enabled: acc.enabled,
      isCurrent,
      battery: assets.battery,
      bagCount: assets.bagCount,
      bagItems: assets.bagItems,
      status: (!acc.enabled) ? 'offline' : assets.status
    });
  }

  return results;
}

/**
 * 赠送指定账号背包中的单个道具
 */
async function sendSingleBagGift({ mid, roomId, bagId, giftId, giftNum = 1 }) {
  const accounts = await Storage.getAccounts();
  const account = accounts.find(a => String(a.mid) === String(mid));
  if (!account) {
    return { success: false, message: '未找到指定账号' };
  }

  try {
    const roomDetails = await BiliApi.getRoomDetails(roomId);
    const realRoomId = roomDetails.roomId;
    const anchorUid = roomDetails.anchorUid;
    const rnd = Math.floor(Date.now() / 1000);

    const commonParams = {
      uid: String(account.mid),
      gift_id: String(giftId),
      ruid: String(anchorUid),
      send_ruid: '0',
      gift_num: String(giftNum),
      bag_id: String(bagId),
      platform: 'pc',
      biz_code: 'Live',
      biz_id: String(realRoomId),
      rnd: String(rnd),
      storm_beat_id: '0',
      metadata: '',
      price: '0',
      csrf: account.bili_jct || '',
      csrf_token: account.bili_jct || '',
      visit_id: ''
    };

    const body = new URLSearchParams(commonParams);

    // 1. 首选尝试现代背包送礼接口
    const res = await fetchWithAccount(account, 'https://api.live.bilibili.com/xlive/revenue/v1/gift/sendBag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (res && res.code === 0) {
      return { success: true, message: '赠送成功' };
    }

    // 2. 若失败，fallback 尝试经典背包送礼接口
    const resFallback = await fetchWithAccount(account, 'https://api.live.bilibili.com/gift/v2/live/bag_send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (resFallback && resFallback.code === 0) {
      return { success: true, message: '赠送成功' };
    }

    const errCode = res?.code !== undefined ? res.code : resFallback?.code;
    const errMsg = res?.message || resFallback?.message || '赠送失败';
    return { success: false, message: `${errMsg} (${errCode})` };
  } catch (err) {
    return { success: false, message: `网络异常: ${err.message}` };
  }
}

/**
 * 单账号视频点赞
 */
async function sendSingleVideoLike(account, bvid, like = 1) {
  const body = new URLSearchParams({
    bvid,
    like: String(like),
    csrf: account.bili_jct || '',
    csrf_token: account.bili_jct || ''
  });

  const res = await fetchWithAccount(account, 'https://api.bilibili.com/x/web-interface/archive/like?_from_multi_acc=1', {
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
      const min = settings.delayMin ?? 100;
      const max = settings.delayMax ?? 400;
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

  const res = await fetchWithAccount(account, 'https://api.bilibili.com/x/web-interface/archive/like/triple?_from_multi_acc=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  return res;
}

/**
 * 记录近期已触发跟随点赞/取消点赞的 key (bvid_action) 与时间戳，防止短时间内重复请求
 */
const recentFollowLikeMap = new Map();

/**
 * 记录近期已触发跟随弹幕的 key (roomId_message) 与时间戳，防止短时间内重复请求
 */
const recentFollowDanmakuMap = new Map();

/**
 * 当主账号在网页点赞或取消点赞时，调度其余副账号自动跟随
 * @param {string} bvid 稿件 BV 号
 * @param {number|null} tabId 来源标签页 ID
 * @param {boolean} isTriple 是否为一键三连
 * @param {number} likeAction 1 为点赞，2 为取消点赞
 */
async function handleAutoFollowLike(bvid, tabId = null, isTriple = false, likeAction = 1) {
  if (!bvid) return;

  const actionName = likeAction === 2 ? '取消点赞' : '点赞';
  const debounceKey = `${bvid}_${likeAction}`;
  const now = Date.now();
  const lastTime = recentFollowLikeMap.get(debounceKey);
  // 同一视频的相同动作 4 秒内只处理一次，避免连击抖动
  if (lastTime && now - lastTime < 4000) {
    return;
  }
  recentFollowLikeMap.set(debounceKey, now);

  const settings = await Storage.getSettings();
  if (settings.autoFollowLike === false) {
    return;
  }

  const accounts = await Storage.getAccounts();
  const enabledAccounts = accounts.filter(a => a.enabled);
  if (enabledAccounts.length <= 1) {
    // 只有一个或没有账号，无需跟随
    return;
  }

  // 获取当前主账号的 mid
  let currentMid = null;
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'DedeUserID' });
    if (cookie && cookie.value) {
      currentMid = String(cookie.value);
    }
  } catch (e) {}

  if (!currentMid) {
    const currentAcc = accounts.find(a => a.isCurrent);
    if (currentAcc) currentMid = String(currentAcc.mid);
  }

  // 严格过滤出“除当前主账号以外”的其余启用副账号
  const subAccounts = enabledAccounts.filter(a => String(a.mid) !== String(currentMid));
  if (subAccounts.length === 0) {
    return;
  }

  console.log(`[自动跟随${actionName}] 检测到主账号对 ${bvid} 执行【${actionName}】，调度 ${subAccounts.length} 个副账号跟随...`);

  let successCount = 0;
  let failedCount = 0;
  let lastFailReason = '';

  for (let i = 0; i < subAccounts.length; i++) {
    const acc = subAccounts[i];
    
    // 防风控离散随机延时 (100ms - 400ms)
    const min = settings.delayMin ?? 100;
    const max = settings.delayMax ?? 400;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await sleep(delay);

    try {
      const resp = await sendSingleVideoLike(acc, bvid, likeAction);
      const isLike = (likeAction === 1);
      // like=1: 0 成功, 65006 已点赞; like=2: 0 成功, 65004 取消点赞成功
      const isSuccess = resp && (
        resp.code === 0 ||
        (isLike && resp.code === 65006) ||
        (!isLike && resp.code === 65004)
      );

      if (isSuccess) {
        successCount++;
      } else {
        failedCount++;
        let reason = resp?.message || `错误码 ${resp?.code}`;
        if (resp?.code === -101) reason = '凭据过期/未登录';
        if (resp?.code === -111) reason = 'CSRF校验失败';
        lastFailReason = `${acc.uname}: ${reason}`;
        console.warn(`[自动跟随${actionName}] 副账号【${acc.uname}】响应异常:`, resp);
      }
    } catch (err) {
      failedCount++;
      lastFailReason = `${acc.uname}: ${err.message || '网络异常'}`;
      console.warn(`[自动跟随${actionName}] 副账号【${acc.uname}】网络异常:`, err);
    }
  }

  console.log(`[自动跟随${actionName}] 执行完毕: ${successCount}/${subAccounts.length} 个副账号完成`);

  // 若开启了轻量通知且知道来源标签页，通知页面给出非侵入式的轻量浮动提示
  if (settings.notifyFollowLike !== false && tabId && tabId >= 0) {
    try {
      chrome.tabs.sendMessage(tabId, {
        action: 'NOTIFY_FOLLOW_LIKE_RESULT',
        data: {
          bvid,
          likeAction,
          actionName,
          total: subAccounts.length,
          successCount,
          failedCount,
          lastFailReason
        }
      });
    } catch (err) {
      // 页面若已刷新或关闭，忽略异常
    }
  }
}

/**
 * 当主账号在直播间发送弹幕后，调度其余副账号自动跟随发送弹幕
 * @param {string|number} roomId 直播间房间号
 * @param {string} message 弹幕文本
 * @param {number|null} tabId 来源标签页 ID
 */
async function handleAutoFollowDanmaku(roomId, message, tabId = null) {
  const msg = String(message || '').trim();
  if (!roomId || !msg) return;

  const debounceKey = `${roomId}_${msg}`;
  const now = Date.now();
  const lastTime = recentFollowDanmakuMap.get(debounceKey);
  // 3.5秒内相同房间且相同内容的发言只处理一次，避免连击抖动或网络重试导致多次发送
  if (lastTime && now - lastTime < 3500) {
    return;
  }
  recentFollowDanmakuMap.set(debounceKey, now);

  const settings = await Storage.getSettings();
  if (settings.autoFollowDanmaku === false) {
    return;
  }

  const accounts = await Storage.getAccounts();
  const enabledAccounts = accounts.filter(a => a.enabled);
  if (enabledAccounts.length <= 1) {
    // 只有一个或没有账号，无需跟随
    return;
  }

  // 获取当前主账号的 mid
  let currentMid = null;
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'DedeUserID' });
    if (cookie && cookie.value) {
      currentMid = String(cookie.value);
    }
  } catch (e) {}

  if (!currentMid) {
    const currentAcc = accounts.find(a => a.isCurrent);
    if (currentAcc) currentMid = String(currentAcc.mid);
  }

  // 严格过滤出“除当前主账号以外”的其余启用副账号
  const subAccounts = enabledAccounts.filter(a => String(a.mid) !== String(currentMid));
  if (subAccounts.length === 0) {
    return;
  }

  console.log(`[自动跟随弹幕] 检测到主账号在房间 ${roomId} 发送: "${msg}"，调度 ${subAccounts.length} 个副账号跟随发言...`);

  let successCount = 0;
  let failedCount = 0;
  let lastFailReason = '';

  for (let i = 0; i < subAccounts.length; i++) {
    const acc = subAccounts[i];

    // 防风控离散随机延时 (100ms - 400ms)
    const min = settings.delayMin ?? 100;
    const max = settings.delayMax ?? 400;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await sleep(delay);

    try {
      const resp = await sendSingleDanmaku(acc, roomId, msg);
      if (resp && resp.code === 0) {
        successCount++;
      } else {
        failedCount++;
        let reason = resp?.message || `错误码 ${resp?.code}`;
        if (resp?.code === -101) reason = '凭据过期/未登录';
        if (resp?.code === -111) reason = 'CSRF校验失败';
        if (resp?.code === 10031) reason = '发言过于频繁';
        lastFailReason = `${acc.uname}: ${reason}`;
        console.warn(`[自动跟随弹幕] 副账号【${acc.uname}】发送响应异常:`, resp);
      }
    } catch (err) {
      failedCount++;
      lastFailReason = `${acc.uname}: ${err.message || '网络异常'}`;
      console.warn(`[自动跟随弹幕] 副账号【${acc.uname}】网络异常:`, err);
    }
  }

  console.log(`[自动跟随弹幕] 执行完毕: ${successCount}/${subAccounts.length} 个副账号完成`);

  // 若开启了轻量通知且知道来源标签页，通知页面给出非侵入式的轻量浮动提示
  if (settings.notifyFollowDanmaku !== false && tabId && tabId >= 0) {
    try {
      chrome.tabs.sendMessage(tabId, {
        action: 'NOTIFY_FOLLOW_DANMAKU_RESULT',
        data: {
          roomId,
          message: msg,
          total: subAccounts.length,
          successCount,
          failedCount,
          lastFailReason
        }
      });
    } catch (err) {
      // 页面若已刷新或关闭，忽略异常
    }
  }
}

/**
 * 监听 B 站网页原生点赞/取消点赞与直播弹幕网络请求 (通过 webRequest)
 */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      // 仅处理来自普通页面 (tabId >= 0) 的 POST 请求，忽略插件内部发出的请求
      if (details.method !== 'POST') return;
      if (details.tabId < 0) return;
      if (details.url.includes('_from_multi_acc=1')) return;

      let formData = null;
      if (details.requestBody) {
        if (details.requestBody.formData) {
          formData = details.requestBody.formData;
        } else if (details.requestBody.raw && details.requestBody.raw.length > 0) {
          const decoder = new TextDecoder('utf-8');
          const rawBytes = details.requestBody.raw[0].bytes;
          if (rawBytes) {
            const str = decoder.decode(rawBytes);
            const params = new URLSearchParams(str);
            formData = {};
            for (const [k, v] of params.entries()) {
              formData[k] = [v];
            }
          }
        }
      }

      // 1. 直播间弹幕发送捕获
      const isDanmakuUrl = details.url.includes('api.live.bilibili.com/msg/send') ||
        details.url.includes('api.live.bilibili.com/xlive/web-room/v1/dM/send');

      if (isDanmakuUrl && formData) {
        const roomId = (formData.roomid && formData.roomid[0]) || (formData.room_id && formData.room_id[0]);
        const msg = formData.msg && formData.msg[0];
        if (roomId && msg) {
          handleAutoFollowDanmaku(roomId, msg, details.tabId);
          return;
        }
      }

      // 2. 视频点赞与取消点赞捕获
      let bvid = formData && formData.bvid && formData.bvid[0];
      let like = formData && formData.like && formData.like[0];

      const isTriple = details.url.includes('/archive/like/triple');
      // like: 1 为点赞，2 为取消点赞；triple 为一键三连点赞
      if ((like === '1' || like === '2' || isTriple) && bvid) {
        const likeAction = isTriple ? 1 : Number(like || 1);
        handleAutoFollowLike(bvid, details.tabId, isTriple, likeAction);
      }
    } catch (err) {
      console.warn('webRequest 解析网络数据失败:', err);
    }
  },
  {
    urls: [
      '*://api.bilibili.com/x/web-interface/archive/like*',
      '*://api.bilibili.com/x/web-interface/archive/like/triple*',
      '*://api.live.bilibili.com/msg/send*',
      '*://api.live.bilibili.com/xlive/web-room/v1/dM/send*'
    ]
  },
  ['requestBody']
);

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
      const min = settings.delayMin ?? 100;
      const max = settings.delayMax ?? 400;
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
      case 'GET_ACCOUNTS_LIVE_STATUS': {
        const results = await getAccountsLiveStatus();
        return { success: true, accounts: results };
      }

      case 'SEND_SINGLE_BAG_GIFT': {
        const res = await sendSingleBagGift(request);
        return res;
      }

      case 'GET_ROOM_GIFT_LIST': {
        // 用指定 mid 的账号凭据拉礼物列表（礼物列表与账号无关，任意有效账号均可）
        const accounts = await Storage.getAccounts();
        const account = accounts.find(a => String(a.mid) === String(request.mid) && a.enabled)
          || accounts.find(a => a.enabled);
        if (!account) return { success: false, message: '无可用账号', gifts: [] };
        const roomDetails = await BiliApi.getRoomDetails(request.roomId);
        const gifts = await fetchRoomGiftList(account, roomDetails.roomId);
        return { success: true, gifts };
      }

      case 'SEND_GOLD_GIFT': {
        const accounts = await Storage.getAccounts();
        const account = accounts.find(a => String(a.mid) === String(request.mid));
        if (!account) return { success: false, message: '未找到账号' };
        const roomDetails = await BiliApi.getRoomDetails(request.roomId);
        const res = await sendSingleGoldGift(
          account,
          roomDetails.roomId,
          roomDetails.anchorUid,
          request.giftId,
          request.price ?? 0,
          request.giftNum ?? 1
        );
        return res;
      }

      case 'TRIGGER_AUTO_FOLLOW_DANMAKU': {
        const tabId = sender.tab ? sender.tab.id : null;
        await handleAutoFollowDanmaku(request.roomId, request.message, tabId);
        return { success: true };
      }

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
      case 'TRIGGER_AUTO_FOLLOW_LIKE': {
        const tabId = sender.tab ? sender.tab.id : null;
        await handleAutoFollowLike(request.bvid, tabId, request.isTriple || false, request.likeAction ?? 1);
        return { success: true };
      }

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

      case 'GET_SETTINGS': {
        const settings = await Storage.getSettings();
        return { success: true, settings };
      }

      case 'UPDATE_SETTING': {
        const currentSettings = await Storage.getSettings();
        currentSettings[request.key] = request.value;
        await Storage.saveSettings(currentSettings);
        return { success: true };
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
