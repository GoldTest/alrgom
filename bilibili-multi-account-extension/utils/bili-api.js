/**
 * B站协议接口交互封装
 */

export const BiliApi = {
  /**
   * 生成登录二维码
   * @returns {Promise<{ url: string, qrcode_key: string }>}
   */
  async generateQrCode() {
    const res = await fetch('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
    const json = await res.json();
    if (json.code !== 0) {
      throw new Error(json.message || '生成登录二维码失败');
    }
    return json.data;
  },

  /**
   * 轮询扫码登录状态
   * @param {string} qrcodeKey 
   * @returns {Promise<{ code: number, message: string, cookies?: Object }>}
   */
  async pollQrCode(qrcodeKey) {
    const res = await fetch(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`);
    const json = await res.json();
    if (json.code !== 0) {
      throw new Error(json.message || '轮询扫码接口异常');
    }

    const { code, message, url } = json.data;
    
    // code: 0 为登录成功
    if (code === 0 && url) {
      const parsedUrl = new URL(url);
      const params = parsedUrl.searchParams;
      
      const cookies = {
        sessdata: params.get('SESSDATA') || '',
        bili_jct: params.get('bili_jct') || '',
        dedeUserId: params.get('DedeUserID') || '',
        dedeUserId_ckMd5: params.get('DedeUserID__ckMd5') || '',
        expires: params.get('Expires') || ''
      };

      return {
        code: 0,
        message: '登录成功',
        cookies
      };
    }

    return {
      code,
      message
    };
  },

  /**
   * 获取账号用户信息
   */
  async fetchUserInfoWithCookie() {
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: { 'Accept': 'application/json' }
    });
    return await res.json();
  },

  /**
   * 获取直播间真实房间号与主播 UID
   * @param {string|number} roomIdOrShortId 
   * @returns {Promise<{ roomId: number, anchorUid: number, liveStatus: number }>}
   */
  async getRoomDetails(roomIdOrShortId) {
    const res = await fetch(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomIdOrShortId}`);
    const json = await res.json();
    if (json.code !== 0 || !json.data) {
      throw new Error(json.message || '获取直播间信息失败');
    }
    return {
      roomId: json.data.room_id,
      anchorUid: json.data.uid,
      liveStatus: json.data.live_status
    };
  },

  /**
   * 通过房间短号获取真实房间号
   * @param {string|number} roomIdOrShortId 
   * @returns {Promise<number>}
   */
  async getRealRoomId(roomIdOrShortId) {
    const details = await this.getRoomDetails(roomIdOrShortId);
    return details.roomId;
  }
};
