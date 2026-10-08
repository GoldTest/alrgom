/**
 * 账号与配置数据持久化模块 (基于 chrome.storage.local)
 */

export const Storage = {
  /**
   * 获取所有存储的账号列表
   * @returns {Promise<Array>}
   */
  async getAccounts() {
    const result = await chrome.storage.local.get({ accounts: [] });
    return result.accounts || [];
  },

  /**
   * 保存或更新账号
   * @param {Object} account 
   */
  async saveAccount(account) {
    const accounts = await this.getAccounts();
    const index = accounts.findIndex(item => item.mid === account.mid);
    
    if (index >= 0) {
      accounts[index] = { ...accounts[index], ...account, updatedAt: Date.now() };
    } else {
      accounts.push({
        enabled: true,
        isCurrent: false,
        ...account,
        updatedAt: Date.now()
      });
    }
    await chrome.storage.local.set({ accounts });
    return accounts;
  },

  /**
   * 设置账号启用/关闭状态
   * @param {string} mid 
   * @param {boolean} enabled 
   */
  async toggleAccount(mid, enabled) {
    const accounts = await this.getAccounts();
    const account = accounts.find(item => item.mid === mid);
    if (account) {
      account.enabled = enabled;
      account.updatedAt = Date.now();
      await chrome.storage.local.set({ accounts });
    }
    return accounts;
  },

  /**
   * 标记当前主账号
   * @param {string} mid 
   */
  async setMainAccount(mid) {
    const accounts = await this.getAccounts();
    accounts.forEach(item => {
      item.isCurrent = (item.mid === mid);
    });
    await chrome.storage.local.set({ accounts });
    return accounts;
  },

  /**
   * 删除账号
   * @param {string} mid 
   */
  async deleteAccount(mid) {
    let accounts = await this.getAccounts();
    accounts = accounts.filter(item => item.mid !== mid);
    await chrome.storage.local.set({ accounts });
    return accounts;
  },

  /**
   * 获取所有启用的账号列表
   */
  async getEnabledAccounts() {
    const accounts = await this.getAccounts();
    return accounts.filter(item => item.enabled);
  },

  /**
   * 获取全局设置
   */
  async getSettings() {
    const defaults = {
      delayMin: 500,
      delayMax: 1500,
      autoRefreshTab: true,
      autoFollowLike: true,
      notifyFollowLike: true,
      autoFollowDanmaku: true,
      notifyFollowDanmaku: true
    };
    const res = await chrome.storage.local.get({ settings: defaults });
    return { ...defaults, ...res.settings };
  },

  /**
   * 保存全局设置
   */
  async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  }
};
