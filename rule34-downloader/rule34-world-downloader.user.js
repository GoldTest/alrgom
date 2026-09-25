// ==UserScript==
// @name         Rule34.world 高级下载助手 (Rule34 World Downloader Pro)
// @namespace    https://github.com/alrgom/rule34-downloader
// @version      1.3.0
// @description  为 rule34.world 提供列表网格与详情页一键下载、实时下载任务面板、Tag多页全量批量下载悬浮面板、本地任意文件夹选择(File System Access API)、下载进度实时显示、下载状态持久化防重复下载、一二级页状态多标签页实时同步、悬浮配置面板。
// @author       Mavis & Assistant
// @match        https://rule34.world/*
// @match        https://*.rule34.world/*
// @icon         https://rule34.world/favicon.ico
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      rule34.world
// @connect      rule34storage.b-cdn.net
// @connect      b-cdn.net
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /**
   * ==========================================
   * 1. 常量与默认配置 (Constants & Config)
   * ==========================================
   */

  const SCRIPT_NAME = 'Rule34 World Downloader Pro';
  const STORAGE_KEY_SETTINGS = 'r34w_settings';
  const STORAGE_KEY_HISTORY = 'r34w_history';
  const STORAGE_KEY_ACTIVE_TASKS = 'r34w_active_tasks';
  const DB_NAME = 'r34_fs_db';
  const STORE_NAME = 'handles';
  const DIR_HANDLE_KEY = 'chosen_download_dir';

  const DEFAULT_SETTINGS = {
    useNativeFolderPicker: true,
    savedFolderName: '',
    subFolder: 'Rule34World/{artist}',
    filenameTemplate: '{id}_{artist}_{character}',
    maxTagCountInName: 3,

    // 画质与格式偏好
    imageFormat: 'original_jpg',
    videoQuality: '1080p',
    videoCodec: 'mp4',

    // 重复下载策略
    duplicateAction: 'ask',

    // 批量下载配置
    batchConcurrency: 3,
    batchSkipDownloaded: true,
    batchFilterMediaType: 'all',
    batchMaxPages: 0,

    // 功能开关
    saveMetadataJson: false,
    showNotification: true,
    btnPosition: 'bottom-right',
    quickSettingsFab: true,
  };

  const FILE_TYPES = {
    1: 'raw',
    10: 'pic.jpg',
    11: 'pic256.jpg',
    12: 'pic256ex.jpg',
    13: 'picpreview.jpg',
    14: 'picsmall.jpg',
    30: 'picavif.avif',
    31: 'pic256avif.avif',
    32: 'pic256exavif.avif',
    33: 'picpreviewavif.avif',
    34: 'picsmallavif.avif',
    100: 'mov.mp4',
    101: 'mov256.mp4',
    102: 'mov256ex.mp4',
    111: '360.mp4',
    112: 'mov480.mp4',
    113: 'mov720.mp4',
    114: '1080.mp4',
    200: 'hevc.mp4',
    201: 'thumbnail.hevc.mp4',
    202: 'thumbnailEx.hevc.mp4',
    211: '360.hevc.mp4',
    212: '480.hevc.mp4',
    213: '720.hevc.mp4',
    214: '1080.hevc.mp4',
    300: 'av1.mp4',
    301: 'thumbnail.av1.mp4',
    302: 'thumbnailEx.av1.mp4',
    311: '360.av1.mp4',
    312: '480.av1.mp4',
    313: '720.av1.mp4',
    314: '1080.av1.mp4',
  };

  const DEFAULT_CDN_HOST = 'https://rule34storage.b-cdn.net';

  /**
   * ==========================================
   * 2. 本地文件夹选择器 (Native File System Access API)
   * ==========================================
   */

  class DirectoryPickerManager {
    static dbPromise = null;
    static cachedHandle = null;

    static getDB() {
      if (!this.dbPromise) {
        this.dbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return this.dbPromise;
    }

    static async pickDirectory() {
      if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('当前浏览器不支持 File System Access API，将采用常规下载方式');
      }

      try {
        const dirHandle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'downloads',
        });

        const db = await this.getDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(dirHandle, DIR_HANDLE_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });

        this.cachedHandle = dirHandle;
        const settings = StorageManager.getSettings();
        settings.savedFolderName = dirHandle.name;
        settings.useNativeFolderPicker = true;
        StorageManager.saveSettings(settings);

        return dirHandle;
      } catch (e) {
        if (e.name === 'AbortError') return null;
        throw e;
      }
    }

    static async getSavedDirectoryHandle(requestPermissionIfPrompt = false) {
      const settings = StorageManager.getSettings();
      if (!settings.useNativeFolderPicker) return null;
      if (typeof window.showDirectoryPicker !== 'function') return null;

      if (this.cachedHandle) {
        try {
          const perm = await this.cachedHandle.queryPermission({ mode: 'readwrite' });
          if (perm === 'granted') return this.cachedHandle;
        } catch (e) {}
      }

      try {
        const db = await this.getDB();
        const handle = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(DIR_HANDLE_KEY);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        if (!handle) return null;

        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          this.cachedHandle = handle;
          return handle;
        }

        if (requestPermissionIfPrompt) {
          try {
            const reqPerm = await handle.requestPermission({ mode: 'readwrite' });
            if (reqPerm === 'granted') {
              this.cachedHandle = handle;
              return handle;
            }
          } catch (permErr) {
            console.warn(`[${SCRIPT_NAME}] 请求目录读写权限受限:`, permErr);
          }
        }

        return null;
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] 读取已保存目录失败:`, e);
        return null;
      }
    }

    static async clearSavedDirectory() {
      try {
        this.cachedHandle = null;
        const db = await this.getDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.delete(DIR_HANDLE_KEY);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });

        const settings = StorageManager.getSettings();
        settings.savedFolderName = '';
        settings.useNativeFolderPicker = false;
        StorageManager.saveSettings(settings);
      } catch (e) {
        console.error(e);
      }
    }

    static async saveFileToHandle(dirHandle, subFolderPath, fileName, blobData, onProgress) {
      let currentDir = dirHandle;
      if (subFolderPath) {
        const parts = subFolderPath.split(/[/\\]+/).filter(Boolean);
        for (const part of parts) {
          currentDir = await currentDir.getDirectoryHandle(part, { create: true });
        }
      }

      const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      try {
        await writable.write(blobData);
        await writable.close();
        if (onProgress) onProgress(100);
      } catch (e) {
        await writable.abort();
        throw e;
      }
    }
  }

  /**
   * ==========================================
   * 3. 数据存储管理 (State & Storage Manager)
   * ==========================================
   */

  class StorageManager {
    static getSettings() {
      try {
        const saved = GM_getValue(STORAGE_KEY_SETTINGS, null);
        return saved ? Object.assign({}, DEFAULT_SETTINGS, saved) : Object.assign({}, DEFAULT_SETTINGS);
      } catch (e) {
        console.error(`[${SCRIPT_NAME}] 读取设置失败:`, e);
        return Object.assign({}, DEFAULT_SETTINGS);
      }
    }

    static saveSettings(settings) {
      try {
        GM_setValue(STORAGE_KEY_SETTINGS, settings);
      } catch (e) {
        console.error(`[${SCRIPT_NAME}] 保存设置失败:`, e);
      }
    }

    static getHistory() {
      try {
        return GM_getValue(STORAGE_KEY_HISTORY, {}) || {};
      } catch (e) {
        return {};
      }
    }

    static isDownloaded(postId) {
      const history = this.getHistory();
      return !!history[postId];
    }

    static getDownloadInfo(postId) {
      const history = this.getHistory();
      return history[postId] || null;
    }

    static markDownloaded(postId, info) {
      try {
        const history = this.getHistory();
        history[postId] = {
          id: postId,
          time: Date.now(),
          filename: info.filename || '',
          url: info.url || '',
          type: info.type || 'unknown',
          title: info.title || '',
          artist: info.artist || '',
          character: info.character || '',
        };
        GM_setValue(STORAGE_KEY_HISTORY, history);
      } catch (e) {
        console.error(`[${SCRIPT_NAME}] 记录下载历史失败:`, e);
      }
    }

    static removeHistory(postId) {
      try {
        const history = this.getHistory();
        if (history[postId]) {
          delete history[postId];
          GM_setValue(STORAGE_KEY_HISTORY, history);
        }
      } catch (e) {}
    }

    static clearHistory() {
      GM_setValue(STORAGE_KEY_HISTORY, {});
    }

    static getActiveTasks() {
      try {
        return GM_getValue(STORAGE_KEY_ACTIVE_TASKS, {}) || {};
      } catch (e) {
        return {};
      }
    }

    static setActiveTask(postId, taskData) {
      try {
        const tasks = this.getActiveTasks();
        if (taskData) {
          tasks[postId] = taskData;
        } else {
          delete tasks[postId];
        }
        GM_setValue(STORAGE_KEY_ACTIVE_TASKS, tasks);
      } catch (e) {}
    }
  }

  /**
   * ==========================================
   * 4. API 与资源解析 (Resource Resolver)
   * ==========================================
   */

  class ResourceResolver {
    static postCache = new Map();

    static async fetchPostDetails(postId) {
      if (this.postCache.has(postId)) {
        return this.postCache.get(postId);
      }

      const apiUrl = `/api/v2/post/${postId}`;
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
          }
        });
        if (!response.ok) {
          throw new Error(`API 状态异常: ${response.status}`);
        }
        const data = await response.json();
        this.postCache.set(postId, data);
        return data;
      } catch (e) {
        console.error(`[${SCRIPT_NAME}] 请求 Post ${postId} 详情失败:`, e);
        throw e;
      }
    }

    static async fetchTagPosts(tagName, options = {}, onProgressPage = null) {
      const allPosts = [];
      let cursor = null;
      let page = 1;
      const take = 30;
      const maxPages = options.maxPages || 0;

      while (true) {
        const payload = {
          includeTags: [tagName],
          take: take,
        };
        if (cursor) {
          payload.cursor = cursor;
        }

        try {
          const res = await fetch('/api/v2/post/search/root', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            throw new Error(`搜索 API 响应异常: ${res.status}`);
          }

          const data = await res.json();
          const items = data.items || [];
          if (items.length === 0) break;

          allPosts.push(...items);

          if (onProgressPage) {
            onProgressPage({
              page: page,
              loadedCount: allPosts.length,
              currentItems: items,
            });
          }

          if (!data.cursor || data.cursor === cursor) {
            break;
          }

          cursor = data.cursor;
          page++;

          if (maxPages > 0 && page > maxPages) {
            break;
          }

          await new Promise(r => setTimeout(r, 100));
        } catch (e) {
          console.error(`[${SCRIPT_NAME}] 抓取 Tag ${tagName} 第 ${page} 页失败:`, e);
          break;
        }
      }

      return allPosts;
    }

    static resolveDownloadTarget(postData, settings) {
      const postId = postData.id;
      const isVideo = postData.type === 1;
      const files = postData.files || {};
      const filesDirect = postData.filesDirect || {};
      const folderNumber = Math.trunc(postId / 1000);

      const hasCode = (code) => {
        return (files && files[code] !== undefined) || (filesDirect && filesDirect[code] !== undefined);
      };

      const buildUrl = (code) => {
        if (filesDirect && filesDirect[code]) {
          return filesDirect[code];
        }
        const partName = FILE_TYPES[code];
        if (!partName) return '';
        return `${DEFAULT_CDN_HOST}/posts/${folderNumber}/${postId}/${postId}.${partName}`;
      };

      let chosenCode = null;
      let extension = isVideo ? 'mp4' : 'jpg';

      if (isVideo) {
        const codec = settings.videoCodec || 'mp4';
        const quality = settings.videoQuality || '1080p';

        let candidateLadder = [];

        if (codec === 'av1') {
          if (quality === '1080p') candidateLadder = [314, 313, 312, 300, 1, 114, 113, 112, 100];
          else if (quality === '720p') candidateLadder = [313, 312, 314, 300, 113, 112, 114, 100];
          else if (quality === '480p') candidateLadder = [312, 311, 313, 112, 111, 100];
          else candidateLadder = [1, 100, 314, 313, 312, 300, 114, 113];
        } else if (codec === 'hevc') {
          if (quality === '1080p') candidateLadder = [214, 213, 212, 200, 1, 114, 113, 112, 100];
          else if (quality === '720p') candidateLadder = [213, 212, 214, 200, 113, 112, 114, 100];
          else if (quality === '480p') candidateLadder = [212, 211, 213, 112, 111, 100];
          else candidateLadder = [1, 100, 214, 213, 212, 200, 114, 113];
        } else {
          // MP4
          if (quality === '1080p') candidateLadder = [114, 100, 1, 113, 112, 314, 214];
          else if (quality === '720p') candidateLadder = [113, 114, 100, 112, 313, 213];
          else if (quality === '480p') candidateLadder = [112, 111, 113, 100, 312, 212];
          else candidateLadder = [100, 1, 114, 113, 112, 314, 214];
        }

        for (const code of candidateLadder) {
          if (hasCode(code)) {
            chosenCode = code;
            break;
          }
        }

        if (!chosenCode) {
          const fallbackCodes = [114, 100, 1, 113, 112, 111, 314, 313, 312, 300, 214, 213, 212, 200];
          for (const c of fallbackCodes) {
            if (hasCode(c)) {
              chosenCode = c;
              break;
            }
          }
        }
        extension = 'mp4';
      } else {
        if (settings.imageFormat === 'avif' && hasCode(30)) {
          chosenCode = 30;
          extension = 'avif';
        } else if (hasCode(1)) {
          chosenCode = 1;
          extension = 'jpg';
        } else if (hasCode(10)) {
          chosenCode = 10;
          extension = 'jpg';
        } else if (hasCode(30)) {
          chosenCode = 30;
          extension = 'avif';
        } else if (hasCode(14)) {
          chosenCode = 14;
          extension = 'jpg';
        } else {
          chosenCode = 10;
          extension = 'jpg';
        }
      }

      const fileUrl = buildUrl(chosenCode);

      const tags = postData.tags || [];
      const artists = tags.filter(t => t.type === 8 || t.type === '8').map(t => t.value);
      const characters = tags.filter(t => t.type === 4 || t.type === '4').map(t => t.value);
      const copyrights = tags.filter(t => t.type === 2 || t.type === '2').map(t => t.value);
      const generals = tags.filter(t => t.type === 1 || t.type === '1').map(t => t.value);

      const artistStr = artists[0] || 'unknown';
      const characterStr = characters.slice(0, settings.maxTagCountInName).join('_') || 'original';
      const copyrightStr = copyrights[0] || 'general';
      const generalTagsStr = generals.slice(0, settings.maxTagCountInName).join('_');

      const postDate = new Date(postData.posted || postData.created || Date.now());
      const dateStr = postDate.toISOString().split('T')[0];

      let filename = settings.filenameTemplate || '{id}_{artist}_{character}';
      filename = filename
        .replace(/\{id\}/gi, postId)
        .replace(/\{artist\}/gi, sanitizeFilename(artistStr))
        .replace(/\{character\}/gi, sanitizeFilename(characterStr))
        .replace(/\{copyright\}/gi, sanitizeFilename(copyrightStr))
        .replace(/\{tags\}/gi, sanitizeFilename(generalTagsStr))
        .replace(/\{type\}/gi, isVideo ? 'video' : 'image')
        .replace(/\{date\}/gi, dateStr)
        .replace(/\{width\}/gi, postData.width || '')
        .replace(/\{height\}/gi, postData.height || '')
        .replace(/\{resolution\}/gi, `${postData.width || 0}x${postData.height || 0}`);

      filename = sanitizeFilename(filename).trim();
      if (!filename) filename = `post_${postId}`;
      filename = `${filename}.${extension}`;

      let subFolder = (settings.subFolder || 'Rule34World').trim();
      subFolder = subFolder
        .replace(/\{id\}/gi, postId)
        .replace(/\{artist\}/gi, sanitizeFilename(artistStr))
        .replace(/\{character\}/gi, sanitizeFilename(characterStr))
        .replace(/\{copyright\}/gi, sanitizeFilename(copyrightStr))
        .replace(/\{type\}/gi, isVideo ? 'video' : 'image')
        .replace(/\{date\}/gi, dateStr);

      subFolder = subFolder.replace(/^[/\\]+|[/\\]+$/g, '');
      const finalSavePath = subFolder ? `${subFolder}/${filename}` : filename;

      return {
        url: fileUrl,
        filename: filename,
        subFolder: subFolder,
        savePath: finalSavePath,
        postId: postId,
        isVideo: isVideo,
        extension: extension,
        artist: artistStr,
        character: characterStr,
        copyright: copyrightStr,
        postData: postData,
      };
    }
  }

  function sanitizeFilename(name) {
    if (!name) return '';
    return name
      .replace(/[\\/:*?"<>|#%&{}\\$!'@+`=]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * ==========================================
   * 5. 下载核心调度器 (Download Manager)
   * ==========================================
   */

  class DownloadController {
    static listeners = new Set();
    static activeDownloads = new Map();

    static init() {
      if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(STORAGE_KEY_HISTORY, (name, oldVal, newVal, remote) => {
          if (remote) this.notifyStateChanged();
        });
        GM_addValueChangeListener(STORAGE_KEY_ACTIVE_TASKS, (name, oldVal, newVal, remote) => {
          if (remote) this.notifyStateChanged();
        });
      }
    }

    static subscribe(callback) {
      this.listeners.add(callback);
      return () => this.listeners.delete(callback);
    }

    static notifyStateChanged(postId) {
      for (const cb of this.listeners) {
        try {
          cb(postId);
        } catch (e) {
          console.error(e);
        }
      }
    }

    static isDownloading(postId) {
      return this.activeDownloads.has(postId);
    }

    static getTaskProgress(postId) {
      const task = this.activeDownloads.get(postId);
      return task ? task.progress : 0;
    }

    static getActiveTasksList() {
      return Array.from(this.activeDownloads.values());
    }

    static async startDownload(postId, options = {}) {
      if (this.isDownloading(postId)) {
        if (!options.silent) showToast(`Post #${postId} 正在下载中...`, 'info');
        return;
      }

      const settings = StorageManager.getSettings();
      const isDownloaded = StorageManager.isDownloaded(postId);

      if (isDownloaded && !options.force) {
        if (settings.duplicateAction === 'skip' || options.skipIfDownloaded) {
          if (!options.silent) showToast(`Post #${postId} 已经下载过，已自动跳过`, 'info');
          return;
        } else if (settings.duplicateAction === 'ask') {
          const downloadInfo = StorageManager.getDownloadInfo(postId);
          const timeStr = downloadInfo && downloadInfo.time ? new Date(downloadInfo.time).toLocaleString() : '之前';
          const confirmAgain = confirm(`[Rule34 下载器] 该作品 (Post #${postId}) 已于 ${timeStr} 下载过！\n\n文件名: ${downloadInfo?.filename || '未知'}\n\n是否重新下载？`);
          if (!confirmAgain) {
            return;
          }
        }
      }

      const taskState = {
        postId,
        progress: 0,
        status: 'preparing',
        filename: `post_${postId}`,
        isVideo: false,
        startTime: Date.now(),
        loaded: 0,
        total: 0,
        error: null,
      };
      this.activeDownloads.set(postId, taskState);
      StorageManager.setActiveTask(postId, { status: 'preparing', progress: 0 });
      this.notifyStateChanged(postId);

      try {
        const postData = await ResourceResolver.fetchPostDetails(postId);
        const target = ResourceResolver.resolveDownloadTarget(postData, settings);

        taskState.status = 'downloading';
        taskState.target = target;
        taskState.filename = target.filename;
        taskState.isVideo = target.isVideo;
        this.notifyStateChanged(postId);

        const nativeDirHandle = await DirectoryPickerManager.getSavedDirectoryHandle(false);
        let downloadSuccess = false;

        if (nativeDirHandle) {
          try {
            await this.downloadViaNativeFs(target, nativeDirHandle, (prog, loaded, total) => {
              taskState.progress = prog;
              if (loaded) taskState.loaded = loaded;
              if (total) taskState.total = total;
              this.notifyStateChanged(postId);
            });
            downloadSuccess = true;
          } catch (fsErr) {
            console.warn(`[${SCRIPT_NAME}] 本地目录写入失败，自动降级为常规下载:`, fsErr);
          }
        }

        if (!downloadSuccess) {
          await this.executeGmDownload(target, (prog, loaded, total) => {
            taskState.progress = prog;
            if (loaded) taskState.loaded = loaded;
            if (total) taskState.total = total;
            this.notifyStateChanged(postId);
          });
        }

        if (settings.saveMetadataJson) {
          try {
            const metaJson = JSON.stringify(postData, null, 2);
            const blob = new Blob([metaJson], { type: 'application/json' });
            const metaFilename = target.filename.replace(/\.[^.]+$/, '.json');

            if (nativeDirHandle && downloadSuccess) {
              await DirectoryPickerManager.saveFileToHandle(nativeDirHandle, target.subFolder, metaFilename, blob);
            } else {
              const metaUrl = URL.createObjectURL(blob);
              const metaSavePath = target.savePath.replace(/\.[^.]+$/, '.json');
              await this.executeGmDownload({ url: metaUrl, savePath: metaSavePath, isBlob: true });
              URL.revokeObjectURL(metaUrl);
            }
          } catch (metaErr) {
            console.warn(`[${SCRIPT_NAME}] 元数据保存跳过:`, metaErr);
          }
        }

        taskState.status = 'completed';
        taskState.progress = 100;
        StorageManager.markDownloaded(postId, {
          filename: target.filename,
          url: target.url,
          type: target.isVideo ? 'video' : 'image',
          artist: target.artist,
          character: target.character,
        });

        if (settings.showNotification && typeof GM_notification === 'function' && !options.silent) {
          GM_notification({
            title: 'Rule34 下载完成',
            text: `Post #${postId} 已保存为 ${target.filename}`,
            timeout: 3000,
          });
        }
      } catch (err) {
        console.error(`[${SCRIPT_NAME}] Post #${postId} 下载失败:`, err);
        taskState.status = 'error';
        taskState.error = err.message || '下载失败';
        if (!options.silent) {
          showToast(`Post #${postId} 下载失败: ${err.message || '网络或存储错误'}`, 'error');
        }
        throw err;
      } finally {
        setTimeout(() => {
          this.activeDownloads.delete(postId);
          StorageManager.setActiveTask(postId, null);
          this.notifyStateChanged(postId);
        }, 1200);
      }
    }

    static downloadViaNativeFs(target, dirHandle, onProgress) {
      return new Promise((resolve, reject) => {
        const handleBlobSuccess = async (blob) => {
          try {
            await DirectoryPickerManager.saveFileToHandle(dirHandle, target.subFolder, target.filename, blob, onProgress);
            resolve();
          } catch (saveErr) {
            reject(saveErr);
          }
        };

        if (typeof GM_xmlhttpRequest === 'function') {
          GM_xmlhttpRequest({
            method: 'GET',
            url: target.url,
            responseType: 'blob',
            headers: {
              'Referer': 'https://rule34.world/',
            },
            onprogress: (pe) => {
              if (pe.total > 0 && onProgress) {
                const percent = Math.floor((pe.loaded / pe.total) * 100);
                onProgress(Math.min(99, percent), pe.loaded, pe.total);
              }
            },
            onload: async (res) => {
              if (res.status >= 200 && res.status < 300) {
                let blob = res.response;
                if (!(blob instanceof Blob)) {
                  if (res.response instanceof ArrayBuffer) {
                    blob = new Blob([res.response], { type: target.isVideo ? 'video/mp4' : 'image/jpeg' });
                  } else {
                    blob = new Blob([res.responseText || ''], { type: target.isVideo ? 'video/mp4' : 'image/jpeg' });
                  }
                }
                await handleBlobSuccess(blob);
              } else {
                reject(new Error(`HTTP ${res.status}`));
              }
            },
            onerror: () => reject(new Error('网络连接异常')),
            ontimeout: () => reject(new Error('下载超时')),
          });
        } else {
          fetch(target.url)
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.blob();
            })
            .then(blob => handleBlobSuccess(blob))
            .catch(reject);
        }
      });
    }

    static executeGmDownload(target, onProgress) {
      return new Promise((resolve, reject) => {
        if (typeof GM_download === 'function') {
          const downloadArgs = {
            url: target.url,
            name: target.savePath,
            saveAs: false,
            headers: {
              'Referer': 'https://rule34.world/',
            },
            onload: () => {
              if (onProgress) onProgress(100);
              resolve();
            },
            onprogress: (progressObj) => {
              if (progressObj.total > 0 && onProgress) {
                const percent = Math.floor((progressObj.loaded / progressObj.total) * 100);
                onProgress(Math.min(99, percent), progressObj.loaded, progressObj.total);
              }
            },
            onerror: (err) => {
              console.warn(`[${SCRIPT_NAME}] GM_download 出错，尝试 Blob 降级方案...`, err);
              this.fallbackBlobDownload(target, onProgress).then(resolve).catch(reject);
            },
            ontimeout: () => {
              reject(new Error('下载超时'));
            }
          };

          try {
            GM_download(downloadArgs);
          } catch (e) {
            console.warn(`[${SCRIPT_NAME}] GM_download 调用异常，切换降级方案...`, e);
            this.fallbackBlobDownload(target, onProgress).then(resolve).catch(reject);
          }
        } else {
          this.fallbackBlobDownload(target, onProgress).then(resolve).catch(reject);
        }
      });
    }

    static fallbackBlobDownload(target, onProgress) {
      return new Promise((resolve, reject) => {
        const triggerDirectAnchor = (blobOrUrl) => {
          const a = document.createElement('a');
          if (typeof blobOrUrl === 'string') {
            a.href = blobOrUrl;
          } else {
            a.href = URL.createObjectURL(blobOrUrl);
          }
          a.download = target.filename;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            if (typeof blobOrUrl !== 'string') URL.revokeObjectURL(a.href);
          }, 2000);
          if (onProgress) onProgress(100);
          resolve();
        };

        if (typeof GM_xmlhttpRequest === 'function') {
          GM_xmlhttpRequest({
            method: 'GET',
            url: target.url,
            responseType: 'blob',
            headers: {
              'Referer': 'https://rule34.world/',
            },
            onprogress: (pe) => {
              if (pe.total > 0 && onProgress) {
                const percent = Math.floor((pe.loaded / pe.total) * 100);
                onProgress(Math.min(99, percent), pe.loaded, pe.total);
              }
            },
            onload: (res) => {
              if (res.status >= 200 && res.status < 300) {
                let blob = res.response;
                if (!(blob instanceof Blob)) {
                  if (res.response instanceof ArrayBuffer) {
                    blob = new Blob([res.response], { type: target.isVideo ? 'video/mp4' : 'image/jpeg' });
                  } else {
                    blob = new Blob([res.responseText || ''], { type: target.isVideo ? 'video/mp4' : 'image/jpeg' });
                  }
                }
                triggerDirectAnchor(blob);
              } else {
                triggerDirectAnchor(target.url);
              }
            },
            onerror: () => triggerDirectAnchor(target.url),
            ontimeout: () => triggerDirectAnchor(target.url),
          });
        } else {
          triggerDirectAnchor(target.url);
        }
      });
    }
  }

  /**
   * ==========================================
   * 6. 批量下载任务调度器 (Batch Download Manager)
   * ==========================================
   */

  class BatchDownloadManager {
    static isRunning = false;
    static isPaused = false;
    static shouldStop = false;

    static queue = [];
    static totalCount = 0;
    static completedCount = 0;
    static skippedCount = 0;
    static failedCount = 0;
    static currentTagName = '';
    static currentProcessingPostId = null;

    static activeWorkers = 0;
    static concurrency = 3;

    static updateUiCallback = null;

    static async startBatchDownload(tagName, options = {}, updateCallback = null) {
      if (this.isRunning) {
        showToast('已有批量下载任务正在进行中', 'info');
        return;
      }

      this.isRunning = true;
      this.isPaused = false;
      this.shouldStop = false;
      this.currentTagName = tagName;
      this.updateUiCallback = updateCallback;

      this.queue = [];
      this.completedCount = 0;
      this.skippedCount = 0;
      this.failedCount = 0;
      this.currentProcessingPostId = null;

      const settings = StorageManager.getSettings();
      this.concurrency = options.concurrency || settings.batchConcurrency || 3;

      this.notifyProgress({
        statusText: `正在全量扫描 Tag #${tagName} 的全部多页作品...`,
        phase: 'scanning',
      });

      const rawPosts = await ResourceResolver.fetchTagPosts(tagName, {
        maxPages: options.maxPages || settings.batchMaxPages || 0,
      }, (scanProgress) => {
        this.notifyProgress({
          statusText: `正在扫描第 ${scanProgress.page} 页 (已发现 ${scanProgress.loadedCount} 篇作品)...`,
          phase: 'scanning',
          scannedCount: scanProgress.loadedCount,
        });
      });

      if (rawPosts.length === 0) {
        this.isRunning = false;
        this.notifyProgress({
          statusText: `未找到与 Tag #${tagName} 相关的作品`,
          phase: 'finished',
        });
        showToast(`未找到 Tag #${tagName} 的作品`, 'info');
        return;
      }

      let filteredPosts = rawPosts;
      const mediaFilter = options.filterMediaType || settings.batchFilterMediaType || 'all';
      if (mediaFilter === 'video') {
        filteredPosts = rawPosts.filter(p => p.type === 1);
      } else if (mediaFilter === 'image') {
        filteredPosts = rawPosts.filter(p => p.type === 0);
      }

      const skipDownloaded = options.skipDownloaded !== undefined ? options.skipDownloaded : settings.batchSkipDownloaded;
      const downloadList = [];

      for (const p of filteredPosts) {
        const isDownloaded = StorageManager.isDownloaded(p.id);
        if (skipDownloaded && isDownloaded) {
          this.skippedCount++;
        } else {
          downloadList.push(p);
        }
      }

      this.queue = downloadList;
      this.totalCount = filteredPosts.length;

      this.notifyProgress({
        statusText: `扫描完成！共发现 ${filteredPosts.length} 篇作品（待下载: ${downloadList.length}，已跳过: ${this.skippedCount}）`,
        phase: 'downloading',
      });

      if (downloadList.length === 0) {
        this.isRunning = false;
        this.notifyProgress({
          statusText: `所有作品已在之前下载完毕，无需重复下载！`,
          phase: 'finished',
        });
        showToast(`Tag #${tagName} 所有作品均已下载过`, 'info');
        return;
      }

      await this.runWorkerQueue();

      this.isRunning = false;
      this.currentProcessingPostId = null;
      this.notifyProgress({
        statusText: `🎉 批量下载完成！成功: ${this.completedCount}，跳过: ${this.skippedCount}，失败: ${this.failedCount}`,
        phase: 'finished',
      });

      if (settings.showNotification && typeof GM_notification === 'function') {
        GM_notification({
          title: `Tag #${tagName} 批量下载完成`,
          text: `共处理 ${this.totalCount} 篇，成功下载 ${this.completedCount} 篇`,
          timeout: 4000,
        });
      }
    }

    static async runWorkerQueue() {
      const workers = [];
      for (let i = 0; i < this.concurrency; i++) {
        workers.push(this.workerLoop());
      }
      await Promise.all(workers);
    }

    static async workerLoop() {
      while (this.queue.length > 0 && !this.shouldStop) {
        if (this.isPaused) {
          await new Promise(r => setTimeout(r, 400));
          continue;
        }

        const post = this.queue.shift();
        if (!post) break;

        this.activeWorkers++;
        this.currentProcessingPostId = post.id;
        this.notifyProgress({
          phase: 'downloading',
          currentPostId: post.id,
          statusText: `正在下载 Post #${post.id} (剩余待下载: ${this.queue.length})...`,
        });

        try {
          await DownloadController.startDownload(post.id, {
            silent: true,
            force: true,
          });
          this.completedCount++;
        } catch (err) {
          console.error(`[${SCRIPT_NAME}] 批量下载 Post #${post.id} 失败:`, err);
          this.failedCount++;
        } finally {
          this.activeWorkers--;
          this.notifyProgress({
            phase: 'downloading',
          });
          await new Promise(r => setTimeout(r, 150));
        }
      }
    }

    static pause() {
      this.isPaused = true;
      this.notifyProgress({ phase: 'paused', statusText: '批量下载已暂停' });
    }

    static resume() {
      this.isPaused = false;
      this.notifyProgress({ phase: 'downloading', statusText: '批量下载继续中...' });
    }

    static stop() {
      this.shouldStop = true;
      this.isRunning = false;
      this.queue = [];
      this.notifyProgress({ phase: 'finished', statusText: '批量下载已终止' });
    }

    static notifyProgress(extra = {}) {
      if (typeof this.updateUiCallback === 'function') {
        this.updateUiCallback(Object.assign({
          tagName: this.currentTagName,
          totalCount: this.totalCount,
          completedCount: this.completedCount,
          skippedCount: this.skippedCount,
          failedCount: this.failedCount,
          remainingCount: this.queue.length,
          activeWorkers: this.activeWorkers,
          isRunning: this.isRunning,
          isPaused: this.isPaused,
          currentPostId: this.currentProcessingPostId,
        }, extra));
      }
    }
  }

  /**
   * ==========================================
   * 7. 样式注入 (Styles & Themes)
   * ==========================================
   */

  function injectStyles() {
    if (document.getElementById('r34-downloader-styles')) return;

    const css = `
      @keyframes r34-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes r34-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }

      /* --- 批量下载顶部工具条按钮 --- */
      .r34-batch-tag-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        background: linear-gradient(135deg, #721199, #520071);
        color: #ffffff;
        border: 1px solid rgba(235, 178, 255, 0.4);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 2px 8px rgba(114, 17, 153, 0.4);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        margin: 4px 8px;
        vertical-align: middle;
      }
      .r34-batch-tag-btn:hover {
        background: linear-gradient(135deg, #8c33b3, #721199);
        box-shadow: 0 4px 14px rgba(114, 17, 153, 0.7);
        transform: translateY(-1px) scale(1.03);
      }
      .r34-batch-tag-btn .material-icons {
        font-size: 16px;
      }

      /* --- 网格卡片右下角下载按钮 --- */
      .r34-card-dl-btn {
        position: absolute;
        right: 6px;
        bottom: 6px;
        z-index: 20 !important;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: rgba(26, 28, 28, 0.9);
        color: #e2e2e2;
        border: 1px solid rgba(255, 255, 255, 0.22);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
        user-select: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        pointer-events: auto !important;
      }
      .r34-card-dl-btn:hover {
        background: #721199;
        color: #ffffff;
        border-color: #ebb2ff;
        transform: translateY(-2px) scale(1.08);
        box-shadow: 0 4px 14px rgba(114, 17, 153, 0.7);
      }
      .r34-card-dl-btn:active {
        transform: translateY(0) scale(0.95);
      }
      .r34-card-dl-btn * {
        pointer-events: none;
      }
      .r34-card-dl-btn .r34-btn-progress {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: -0.5px;
      }
      .r34-card-dl-btn.r34-status-downloaded {
        background: rgba(0, 82, 51, 0.92);
        color: #57de9e;
        border-color: #57de9e;
      }
      .r34-card-dl-btn.r34-status-downloaded:hover {
        background: #00874e;
        color: #ffffff;
      }
      .r34-card-dl-btn.r34-status-downloading {
        background: rgba(114, 17, 153, 0.95);
        color: #ebb2ff;
        border-color: #ebb2ff;
        cursor: wait;
      }

      /* --- 二级详情页下载按钮 --- */
      .r34-detail-dl-chip {
        display: inline-flex;
        align-items: center;
        height: 36px;
        border-radius: 999px;
        padding: 0 14px;
        background: var(--r-chip-background, #333535);
        color: var(--r-chip-label, #e2e2e2);
        border: 1px solid rgba(235, 178, 255, 0.3);
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        user-select: none;
        transition: all 0.2s ease;
        margin-right: 8px;
        box-sizing: border-box;
      }
      .r34-detail-dl-chip:hover {
        background: #721199;
        color: #ffffff;
        border-color: #ebb2ff;
        box-shadow: 0 0 10px rgba(235, 178, 255, 0.4);
      }
      .r34-detail-dl-chip .icon {
        font-size: 18px;
        margin-right: 6px;
      }
      .r34-detail-dl-chip.r34-status-downloaded {
        background: #005233;
        color: #57de9e;
        border-color: #57de9e;
      }
      .r34-detail-dl-chip.r34-status-downloaded:hover {
        background: #006c46;
        color: #ffffff;
      }
      .r34-detail-dl-chip.r34-status-downloading {
        background: #721199;
        color: #ebb2ff;
        border-color: #ebb2ff;
      }

      /* --- 右侧悬浮工具条 (Floating Multi-Panel Dock) --- */
      .r34-dock-container {
        position: fixed;
        right: 20px;
        bottom: 24px;
        z-index: 9998;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
        user-select: none;
      }
      .r34-dock-btn {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: #1e2020;
        color: #e2e2e2;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5), 0 0 8px rgba(114, 17, 153, 0.3);
        border: 1.5px solid rgba(235, 178, 255, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 20px;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }
      .r34-dock-btn:hover {
        transform: scale(1.12);
        background: #721199;
        color: #ffffff;
        border-color: #ebb2ff;
        box-shadow: 0 6px 20px rgba(114, 17, 153, 0.8);
      }
      .r34-dock-btn.active {
        background: #721199;
        color: #ffffff;
        border-color: #57de9e;
        box-shadow: 0 0 14px rgba(87, 222, 158, 0.6);
      }
      .r34-dock-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #e91e63;
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        border: 1.5px solid #1e2020;
        animation: r34-pulse 1.5s infinite;
      }

      /* --- 通用弹窗 Modal --- */
      .r34-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.68);
        backdrop-filter: blur(6px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: r34-fade-in 0.2s ease;
      }
      @keyframes r34-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .r34-modal-dialog {
        background: #1e2020;
        color: #e2e2e2;
        width: 90%;
        max-width: 640px;
        max-height: 88vh;
        border-radius: 14px;
        border: 1px solid rgba(226, 226, 226, 0.15);
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 16px rgba(114, 17, 153, 0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .r34-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: #282a2b;
        border-bottom: 1px solid rgba(226, 226, 226, 0.1);
      }
      .r34-modal-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 500;
        color: #ebb2ff;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .r34-modal-close-btn {
        background: transparent;
        border: none;
        color: rgba(226, 226, 226, 0.7);
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
      }
      .r34-modal-close-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }
      .r34-modal-body {
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .r34-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .r34-form-group label {
        font-size: 13px;
        font-weight: 500;
        color: rgba(226, 226, 226, 0.9);
      }
      .r34-form-group .hint {
        font-size: 11px;
        color: rgba(226, 226, 226, 0.5);
      }
      .r34-input, .r34-select {
        background: #121414;
        border: 1px solid rgba(226, 226, 226, 0.2);
        color: #e2e2e2;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s ease;
      }
      .r34-input:focus, .r34-select:focus {
        border-color: #ebb2ff;
        box-shadow: 0 0 0 2px rgba(235, 178, 255, 0.2);
      }
      .r34-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .r34-tag-helper {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }
      .r34-tag-badge {
        font-size: 11px;
        background: rgba(114, 17, 153, 0.3);
        color: #ebb2ff;
        padding: 2px 6px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid rgba(235, 178, 255, 0.2);
        transition: all 0.15s ease;
      }
      .r34-tag-badge:hover {
        background: #721199;
        color: #ffffff;
      }

      /* 任务列表条目 (Task item card) */
      .r34-task-item {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(226, 226, 226, 0.12);
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .r34-task-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .r34-task-title {
        font-size: 13px;
        font-weight: 500;
        color: #e2e2e2;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .r34-task-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .r34-task-badge.video {
        background: rgba(233, 30, 99, 0.3);
        color: #ff80ab;
        border: 1px solid rgba(233, 30, 99, 0.4);
      }
      .r34-task-badge.image {
        background: rgba(87, 222, 158, 0.2);
        color: #57de9e;
        border: 1px solid rgba(87, 222, 158, 0.3);
      }

      /* 进度条 */
      .r34-progress-bar-bg {
        width: 100%;
        height: 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
        overflow: hidden;
        position: relative;
      }
      .r34-progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #721199, #57de9e);
        width: 0%;
        transition: width 0.2s ease;
      }

      .r34-folder-box {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(235, 178, 255, 0.25);
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .r34-folder-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .r34-folder-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 6px;
        background: rgba(0, 82, 51, 0.4);
        color: #57de9e;
        border: 1px solid rgba(87, 222, 158, 0.3);
      }
      .r34-folder-badge.unset {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(226, 226, 226, 0.7);
        border-color: rgba(255, 255, 255, 0.15);
      }

      /* 统计格 */
      .r34-batch-stat-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        text-align: center;
      }
      .r34-stat-card {
        background: rgba(255, 255, 255, 0.05);
        padding: 8px 4px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .r34-stat-card .val {
        font-size: 16px;
        font-weight: 700;
        color: #ebb2ff;
      }
      .r34-stat-card .lbl {
        font-size: 11px;
        color: rgba(226, 226, 226, 0.6);
        margin-top: 2px;
      }

      .r34-checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        cursor: pointer;
        user-select: none;
      }
      .r34-modal-footer {
        padding: 14px 20px;
        background: #282a2b;
        border-top: 1px solid rgba(226, 226, 226, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .r34-btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .r34-btn-primary {
        background: #721199;
        color: #ffffff;
      }
      .r34-btn-primary:hover {
        background: #8c33b3;
      }
      .r34-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #e2e2e2;
      }
      .r34-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.18);
      }
      .r34-btn-danger {
        background: rgba(147, 1, 0, 0.4);
        color: #ffb4a8;
        border: 1px solid rgba(255, 180, 168, 0.3);
      }
      .r34-btn-danger:hover {
        background: #930100;
        color: #ffffff;
      }

      .r34-toast {
        position: fixed;
        bottom: 84px;
        right: 24px;
        z-index: 100000;
        background: rgba(30, 32, 32, 0.95);
        color: #e2e2e2;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 13px;
        border: 1px solid rgba(235, 178, 255, 0.3);
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        animation: r34-toast-in 0.25s ease;
        backdrop-filter: blur(8px);
        max-width: 340px;
        word-break: break-all;
      }
      .r34-toast.r34-toast-error {
        border-color: #ffb4a8;
        color: #ffb4a8;
      }
      @keyframes r34-toast-in {
        from { transform: translateY(12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;

    const styleEl = document.createElement('style');
    styleEl.id = 'r34-downloader-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `r34-toast ${type === 'error' ? 'r34-toast-error' : ''}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, 2800);
  }

  /**
   * ==========================================
   * 8. 实时下载任务面板 Modal (Active Downloads Panel)
   * ==========================================
   */

  class DownloadsManagerModal {
    static overlay = null;

    static show() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }

      this.overlay = document.createElement('div');
      this.overlay.className = 'r34-modal-overlay';

      this.render();
      document.body.appendChild(this.overlay);

      // 订阅状态更新
      const unsub = DownloadController.subscribe(() => {
        if (this.overlay) this.updateList();
      });

      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          unsub();
          this.overlay.remove();
          this.overlay = null;
        }
      });
    }

    static render() {
      const activeTasks = DownloadController.getActiveTasksList();
      const history = StorageManager.getHistory();
      const historyList = Object.values(history).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 15);

      this.overlay.innerHTML = `
        <div class="r34-modal-dialog">
          <div class="r34-modal-header">
            <h2>
              <span class="material-icons" style="font-size:20px; color:#57de9e;">file_download</span>
              下载任务管理器 (<span id="r34-active-count">${activeTasks.length}</span>)
            </h2>
            <button class="r34-modal-close-btn" id="r34-tasks-close">✕</button>
          </div>
          <div class="r34-modal-body" id="r34-tasks-body">
            <!-- 正在下载的活跃任务 -->
            <div style="font-size:14px; font-weight:700; color:#ebb2ff; display:flex; justify-content:space-between; align-items:center;">
              <span>🚀 正在下载中的任务</span>
              <span style="font-size:12px; font-weight:normal; color:rgba(226,226,226,0.6);">实时进度同步</span>
            </div>

            <div id="r34-active-tasks-list" style="display:flex; flex-direction:column; gap:10px;">
              ${this.buildActiveTasksHtml(activeTasks)}
            </div>

            <!-- 最近完成下载历史 -->
            <div style="font-size:14px; font-weight:700; color:#57de9e; margin-top:14px; display:flex; justify-content:space-between; align-items:center;">
              <span>✅ 最近下载历史 (前 15 项)</span>
              <span style="font-size:11px; font-weight:normal; color:rgba(226,226,226,0.6);">共记录 ${Object.keys(history).length} 篇</span>
            </div>

            <div id="r34-history-tasks-list" style="display:flex; flex-direction:column; gap:8px;">
              ${this.buildHistoryHtml(historyList)}
            </div>
          </div>
          <div class="r34-modal-footer">
            <button class="r34-btn r34-btn-secondary" id="r34-tasks-refresh">刷新列表</button>
            <button class="r34-btn r34-btn-primary" id="r34-tasks-ok">确定</button>
          </div>
        </div>
      `;

      this.overlay.querySelector('#r34-tasks-close').onclick = () => {
        this.overlay.remove();
        this.overlay = null;
      };
      this.overlay.querySelector('#r34-tasks-ok').onclick = () => {
        this.overlay.remove();
        this.overlay = null;
      };
      this.overlay.querySelector('#r34-tasks-refresh').onclick = () => this.updateList();
    }

    static updateList() {
      if (!this.overlay) return;

      const activeTasks = DownloadController.getActiveTasksList();
      const activeListContainer = this.overlay.querySelector('#r34-active-tasks-list');
      const activeCountSpan = this.overlay.querySelector('#r34-active-count');

      if (activeCountSpan) activeCountSpan.textContent = activeTasks.length;
      if (activeListContainer) activeListContainer.innerHTML = this.buildActiveTasksHtml(activeTasks);
    }

    static buildActiveTasksHtml(tasks) {
      if (tasks.length === 0) {
        return `
          <div style="padding: 16px; text-align:center; background: rgba(255,255,255,0.03); border-radius:8px; color: rgba(226,226,226,0.5); font-size:13px;">
            当前没有正在进行的下载任务。去网格卡片点击下载图标试试吧！
          </div>
        `;
      }

      return tasks.map(t => {
        const percent = t.progress || 0;
        return `
          <div class="r34-task-item">
            <div class="r34-task-header">
              <div class="r34-task-title">
                <span class="material-icons" style="font-size:16px; color:#ebb2ff; animation: r34-spin 1.5s linear infinite;">sync</span>
                <a href="/post/${t.postId}" target="_blank" style="color:#ebb2ff; font-weight:bold;">#${t.postId}</a>
                <span class="r34-task-badge ${t.isVideo ? 'video' : 'image'}">${t.isVideo ? 'VIDEO' : 'IMAGE'}</span>
                <span style="font-size:12px; color:rgba(226,226,226,0.7);">${escapeHtml(t.filename || '正在解析...')}</span>
              </div>
              <span style="font-size:13px; font-weight:700; color:#57de9e;">${percent}%</span>
            </div>
            <div class="r34-progress-bar-bg">
              <div class="r34-progress-bar-fill" style="width: ${percent}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    static buildHistoryHtml(items) {
      if (items.length === 0) {
        return `<div style="color:rgba(226,226,226,0.4); font-size:12px; padding:8px 0;">暂无下载历史</div>`;
      }

      return items.map(item => {
        const timeStr = item.time ? new Date(item.time).toLocaleString() : '';
        return `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:rgba(0,0,0,0.25); border-radius:6px; border:1px solid rgba(255,255,255,0.06); font-size:12px;">
            <div style="display:flex; align-items:center; gap:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              <span class="material-icons" style="font-size:14px; color:#57de9e;">check_circle</span>
              <a href="/post/${item.id}" target="_blank" style="color:#ebb2ff; font-weight:500;">#${item.id}</a>
              <span style="color:rgba(226,226,226,0.8);">${escapeHtml(item.filename || 'post_' + item.id)}</span>
            </div>
            <span style="color:rgba(226,226,226,0.4); font-size:11px; flex-shrink:0; margin-left:8px;">${timeStr}</span>
          </div>
        `;
      }).join('');
    }
  }

  /**
   * ==========================================
   * 9. 批量下载面板 Modal (Batch Modal - 独立悬浮面板)
   * ==========================================
   */

  class BatchDownloadModal {
    static overlay = null;

    static show(initialTag = '') {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }

      const settings = StorageManager.getSettings();
      const detectedTag = initialTag || UIController.getCurrentPageTag() || 'rwt4184';

      this.overlay = document.createElement('div');
      this.overlay.className = 'r34-modal-overlay';

      this.overlay.innerHTML = `
        <div class="r34-modal-dialog">
          <div class="r34-modal-header">
            <h2>
              <span class="material-icons" style="font-size:20px; color:#ebb2ff;">layers</span>
              Tag 全量多页批量下载
            </h2>
            <button class="r34-modal-close-btn" id="r34-batch-close">✕</button>
          </div>
          <div class="r34-modal-body">
            <!-- Tag 输入与配置 -->
            <div class="r34-form-group">
              <label>🏷️ 目标标签 (Tag 名称，如 rwt4184, overwatch, 2026 等)</label>
              <input type="text" class="r34-input" id="r34-batch-tag-input" value="${escapeHtml(detectedTag)}" placeholder="输入要全量下载的 tag...">
              <div class="hint">系统将自动翻页爬取该 Tag 下的全部作品并按队列并发下载。</div>
            </div>

            <!-- 批量过滤与并发参数 -->
            <div class="r34-row">
              <div class="r34-form-group">
                <label>🎞️ 媒体类型过滤</label>
                <select class="r34-select" id="r34-batch-media-filter">
                  <option value="all">下载全部 (图片 + 视频)</option>
                  <option value="video">仅下载视频 (MP4)</option>
                  <option value="image">仅下载图片 (JPG/AVIF)</option>
                </select>
              </div>

              <div class="r34-form-group">
                <label>⚡ 下载并发数 (建议 3-4)</label>
                <select class="r34-select" id="r34-batch-concurrency">
                  <option value="1">1 (单线程温和)</option>
                  <option value="2">2</option>
                  <option value="3" selected>3 (推荐)</option>
                  <option value="4">4 (极速)</option>
                  <option value="6">6 (高并发)</option>
                </select>
              </div>
            </div>

            <div class="r34-row">
              <div class="r34-form-group">
                <label>📄 最大扫描页数</label>
                <select class="r34-select" id="r34-batch-max-pages">
                  <option value="0" selected>全部页 (直至末页)</option>
                  <option value="1">仅前 1 页 (约 30 篇)</option>
                  <option value="3">前 3 页 (约 90 篇)</option>
                  <option value="5">前 5 页 (约 150 篇)</option>
                  <option value="10">前 10 页 (约 300 篇)</option>
                  <option value="20">前 20 页 (约 600 篇)</option>
                </select>
              </div>

              <div class="r34-form-group" style="justify-content: flex-end; padding-bottom: 4px;">
                <label class="r34-checkbox-label">
                  <input type="checkbox" id="r34-batch-skip-downloaded" checked>
                  <span>跳过历史已下载作品 (智能去重)</span>
                </label>
              </div>
            </div>

            <!-- 实时进度展示盒 -->
            <div class="r34-batch-progress-box" id="r34-batch-progress-panel">
              <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:500;">
                <span id="r34-batch-status-text">准备就绪，点击下方按钮开始批量下载</span>
                <span id="r34-batch-percent-text" style="color:#57de9e;">0%</span>
              </div>
              <div class="r34-progress-bar-bg">
                <div class="r34-progress-bar-fill" id="r34-batch-progress-bar"></div>
              </div>
              <div class="r34-batch-stat-grid">
                <div class="r34-stat-card">
                  <div class="val" id="r34-stat-total">0</div>
                  <div class="lbl">发现总数</div>
                </div>
                <div class="r34-stat-card">
                  <div class="val" id="r34-stat-success" style="color:#57de9e;">0</div>
                  <div class="lbl">成功下载</div>
                </div>
                <div class="r34-stat-card">
                  <div class="val" id="r34-stat-skip" style="color:#ebb2ff;">0</div>
                  <div class="lbl">已跳过</div>
                </div>
                <div class="r34-stat-card">
                  <div class="val" id="r34-stat-fail" style="color:#ffb4a8;">0</div>
                  <div class="lbl">失败/错误</div>
                </div>
              </div>
            </div>
          </div>
          <div class="r34-modal-footer">
            <div style="display:flex; gap:8px;">
              <button class="r34-btn r34-btn-secondary" id="r34-batch-pause" style="display:none;">暂停</button>
              <button class="r34-btn r34-btn-danger" id="r34-batch-stop" style="display:none;">终止下载</button>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="r34-btn r34-btn-secondary" id="r34-batch-cancel">关闭</button>
              <button class="r34-btn r34-btn-primary" id="r34-batch-start">
                <span class="material-icons" style="font-size:16px;">cloud_download</span>
                开始批量下载
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.overlay);

      const close = () => {
        if (this.overlay) {
          this.overlay.remove();
          this.overlay = null;
        }
      };

      this.overlay.querySelector('#r34-batch-close').onclick = close;
      this.overlay.querySelector('#r34-batch-cancel').onclick = close;

      const startBtn = this.overlay.querySelector('#r34-batch-start');
      const pauseBtn = this.overlay.querySelector('#r34-batch-pause');
      const stopBtn = this.overlay.querySelector('#r34-batch-stop');
      const tagInput = this.overlay.querySelector('#r34-batch-tag-input');
      const statusText = this.overlay.querySelector('#r34-batch-status-text');
      const percentText = this.overlay.querySelector('#r34-batch-percent-text');
      const progressBar = this.overlay.querySelector('#r34-batch-progress-bar');
      const statTotal = this.overlay.querySelector('#r34-stat-total');
      const statSuccess = this.overlay.querySelector('#r34-stat-success');
      const statSkip = this.overlay.querySelector('#r34-stat-skip');
      const statFail = this.overlay.querySelector('#r34-stat-fail');

      // 如果当前已有正在运行的任务，恢复显示
      if (BatchDownloadManager.isRunning) {
        startBtn.disabled = true;
        tagInput.disabled = true;
        pauseBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'inline-flex';
        BatchDownloadManager.notifyProgress();
      }

      pauseBtn.onclick = () => {
        if (BatchDownloadManager.isPaused) {
          BatchDownloadManager.resume();
          pauseBtn.textContent = '暂停';
        } else {
          BatchDownloadManager.pause();
          pauseBtn.textContent = '继续';
        }
      };

      stopBtn.onclick = () => {
        if (confirm('确定终止当前的批量下载任务吗？')) {
          BatchDownloadManager.stop();
        }
      };

      startBtn.onclick = async () => {
        const tagName = tagInput.value.trim();
        if (!tagName) {
          alert('请输入要下载的 Tag 名称！');
          return;
        }

        startBtn.disabled = true;
        tagInput.disabled = true;
        pauseBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'inline-flex';

        const options = {
          concurrency: parseInt(this.overlay.querySelector('#r34-batch-concurrency').value, 10) || 3,
          maxPages: parseInt(this.overlay.querySelector('#r34-batch-max-pages').value, 10) || 0,
          filterMediaType: this.overlay.querySelector('#r34-batch-media-filter').value,
          skipDownloaded: this.overlay.querySelector('#r34-batch-skip-downloaded').checked,
        };

        await BatchDownloadManager.startBatchDownload(tagName, options, (prog) => {
          if (!this.overlay) return;

          if (prog.statusText) statusText.textContent = prog.statusText;
          if (prog.totalCount !== undefined) statTotal.textContent = prog.totalCount;
          if (prog.completedCount !== undefined) statSuccess.textContent = prog.completedCount;
          if (prog.skippedCount !== undefined) statSkip.textContent = prog.skippedCount;
          if (prog.failedCount !== undefined) statFail.textContent = prog.failedCount;

          if (prog.totalCount > 0) {
            const processed = (prog.completedCount || 0) + (prog.skippedCount || 0) + (prog.failedCount || 0);
            const percent = Math.min(100, Math.floor((processed / prog.totalCount) * 100));
            progressBar.style.width = `${percent}%`;
            percentText.textContent = `${percent}%`;
          }

          if (prog.phase === 'finished') {
            startBtn.disabled = false;
            tagInput.disabled = false;
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'none';
          }
        });
      };
    }
  }

  /**
   * ==========================================
   * 10. 偏好设置面板 Modal (Settings Modal)
   * ==========================================
   */

  class SettingsModal {
    static isOpen = false;

    static async show() {
      if (this.isOpen) return;
      this.isOpen = true;

      const settings = StorageManager.getSettings();
      const history = StorageManager.getHistory();
      const historyCount = Object.keys(history).length;

      const hasNativePicker = typeof window.showDirectoryPicker === 'function';
      const currentHandle = await DirectoryPickerManager.getSavedDirectoryHandle(false);
      const folderDisplayName = currentHandle ? currentHandle.name : (settings.savedFolderName || '');

      const overlay = document.createElement('div');
      overlay.className = 'r34-modal-overlay';

      overlay.innerHTML = `
        <div class="r34-modal-dialog">
          <div class="r34-modal-header">
            <h2>
              <span class="material-icons" style="font-size:20px; color:#ebb2ff;">settings</span>
              ${SCRIPT_NAME} 偏好配置
            </h2>
            <button class="r34-modal-close-btn" id="r34-modal-close">✕</button>
          </div>
          <div class="r34-modal-body">

            <!-- 目标文件夹选择 -->
            <div class="r34-form-group">
              <label>📁 本地保存目标文件夹</label>
              <div class="r34-folder-box">
                <div class="r34-folder-status-row">
                  <div class="r34-folder-badge ${folderDisplayName ? '' : 'unset'}" id="r34-folder-badge">
                    <span class="material-icons" style="font-size:16px;">${folderDisplayName ? 'folder_special' : 'folder'}</span>
                    <span id="r34-folder-label">${folderDisplayName ? `已绑定目标文件夹: ${escapeHtml(folderDisplayName)}` : '使用浏览器默认 Downloads 目录'}</span>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button class="r34-btn r34-btn-primary" id="r34-pick-folder-btn" style="padding: 4px 10px; font-size: 12px;" ${!hasNativePicker ? 'disabled title="当前浏览器不支持直接选择文件夹"' : ''}>
                      <span class="material-icons" style="font-size:14px;">folder_open</span>
                      选择文件夹
                    </button>
                    ${folderDisplayName ? `<button class="r34-btn r34-btn-secondary" id="r34-clear-folder-btn" style="padding: 4px 8px; font-size: 12px;" title="解除绑定">重置</button>` : ''}
                  </div>
                </div>
                <div class="hint">
                  ${hasNativePicker ? '💡 点击“选择文件夹”可直接将文件存放到硬盘的任意位置（如 <code>D:\\Images\\Rule34</code>），无需受浏览器默认下载路径限制。' : '⚠️ 当前浏览器暂不支持原生文件夹选择，将自动使用浏览器默认下载目录下的相对路径。'}
                </div>
              </div>
            </div>

            <!-- 子目录与分类预设 -->
            <div class="r34-form-group">
              <label>📂 分类子目录结构</label>
              <div style="display:flex; gap:8px;">
                <input type="text" class="r34-input" style="flex:1;" id="r34-subfolder" value="${escapeHtml(settings.subFolder)}">
                <select class="r34-select" id="r34-subfolder-preset" style="width: 170px;">
                  <option value="">⚡ 快捷预设...</option>
                  <option value="Rule34World/{artist}">按作者分类 ({artist})</option>
                  <option value="Rule34World/{copyright}">按作品分类 ({copyright})</option>
                  <option value="Rule34World/{character}">按角色分类 ({character})</option>
                  <option value="Rule34World/{type}">按类型 (image/video)</option>
                  <option value="Rule34World/{date}">按发布日期 ({date})</option>
                  <option value="Rule34World">平铺保存 (Rule34World)</option>
                </select>
              </div>
              <div class="r34-tag-helper">
                <span class="r34-tag-badge" data-target="r34-subfolder" data-tag="{artist}">+ {artist} 作者</span>
                <span class="r34-tag-badge" data-target="r34-subfolder" data-tag="{copyright}">+ {copyright} 原作</span>
                <span class="r34-tag-badge" data-target="r34-subfolder" data-tag="{character}">+ {character} 角色</span>
                <span class="r34-tag-badge" data-target="r34-subfolder" data-tag="{type}">+ {type} 媒介类型</span>
                <span class="r34-tag-badge" data-target="r34-subfolder" data-tag="{date}">+ {date} 日期</span>
              </div>
            </div>

            <!-- 文件命名模板 -->
            <div class="r34-form-group">
              <label>📝 文件名命名模板 (无需输入扩展名)</label>
              <input type="text" class="r34-input" id="r34-filename-template" value="${escapeHtml(settings.filenameTemplate)}">
              <div class="r34-tag-helper">
                <span class="r34-tag-badge" data-target="r34-filename-template" data-tag="{id}">+ {id} 帖子ID</span>
                <span class="r34-tag-badge" data-target="r34-filename-template" data-tag="{artist}">+ {artist} 作者</span>
                <span class="r34-tag-badge" data-target="r34-filename-template" data-tag="{character}">+ {character} 角色</span>
                <span class="r34-tag-badge" data-target="r34-filename-template" data-tag="{copyright}">+ {copyright} 原作</span>
                <span class="r34-tag-badge" data-target="r34-filename-template" data-tag="{tags}">+ {tags} 普通标签</span>
                <span class="r34-tag-badge" data-target="r34-filename-template" data-tag="{resolution}">+ {resolution} 分辨率</span>
              </div>
            </div>

            <!-- 画质与格式偏好 -->
            <div class="r34-row">
              <div class="r34-form-group">
                <label>🖼️ 图片首选格式</label>
                <select class="r34-select" id="r34-img-format">
                  <option value="original_jpg" ${settings.imageFormat === 'original_jpg' ? 'selected' : ''}>原画 JPG (最高原图 pic.jpg)</option>
                  <option value="avif" ${settings.imageFormat === 'avif' ? 'selected' : ''}>高效 AVIF (picavif.avif)</option>
                </select>
              </div>

              <div class="r34-form-group">
                <label>🎬 视频首选画质</label>
                <select class="r34-select" id="r34-video-quality">
                  <option value="1080p" ${settings.videoQuality === '1080p' ? 'selected' : ''}>最高画质 (1080p / 原画)</option>
                  <option value="720p" ${settings.videoQuality === '720p' ? 'selected' : ''}>高清 (720p)</option>
                  <option value="480p" ${settings.videoQuality === '480p' ? 'selected' : ''}>流畅 (480p / 360p)</option>
                  <option value="original" ${settings.videoQuality === 'original' ? 'selected' : ''}>原版压制 (mov.mp4)</option>
                </select>
              </div>
            </div>

            <div class="r34-row">
              <div class="r34-form-group">
                <label>📼 视频编码偏好</label>
                <select class="r34-select" id="r34-video-codec">
                  <option value="mp4" ${settings.videoCodec === 'mp4' ? 'selected' : ''}>H.264 (MP4，兼容性最佳)</option>
                  <option value="av1" ${settings.videoCodec === 'av1' ? 'selected' : ''}>AV1 (高压缩率)</option>
                  <option value="hevc" ${settings.videoCodec === 'hevc' ? 'selected' : ''}>HEVC / H.265</option>
                </select>
              </div>

              <div class="r34-form-group">
                <label>⚠️ 遇已下载项目策略</label>
                <select class="r34-select" id="r34-duplicate-action">
                  <option value="ask" ${settings.duplicateAction === 'ask' ? 'selected' : ''}>弹窗询问是否重新下载</option>
                  <option value="skip" ${settings.duplicateAction === 'skip' ? 'selected' : ''}>直接跳过 (防重复下载)</option>
                  <option value="overwrite" ${settings.duplicateAction === 'overwrite' ? 'selected' : ''}>直接重新下载</option>
                </select>
              </div>
            </div>

            <div class="r34-form-group" style="gap: 10px; margin-top: 4px;">
              <label class="r34-checkbox-label">
                <input type="checkbox" id="r34-save-meta" ${settings.saveMetadataJson ? 'checked' : ''}>
                <span>保存标签与元数据 JSON 文件 (.json)</span>
              </label>
              <label class="r34-checkbox-label">
                <input type="checkbox" id="r34-notification" ${settings.showNotification ? 'checked' : ''}>
                <span>下载完成时发送系统/浏览器通知</span>
              </label>
            </div>

            <div class="r34-form-group" style="padding: 10px 14px; background: rgba(0,0,0,0.25); border-radius: 8px; border: 1px dashed rgba(226,226,226,0.15);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; color:rgba(226,226,226,0.8);">📊 已记录已下载作品：<strong>${historyCount}</strong> 篇</span>
                <button class="r34-btn r34-btn-danger" id="r34-clear-history" style="padding:4px 10px; font-size:11px;">清空历史记录</button>
              </div>
            </div>
          </div>
          <div class="r34-modal-footer">
            <button class="r34-btn r34-btn-secondary" id="r34-modal-reset">恢复默认</button>
            <div style="display:flex; gap:8px;">
              <button class="r34-btn r34-btn-secondary" id="r34-modal-cancel">取消</button>
              <button class="r34-btn r34-btn-primary" id="r34-modal-save">保存设置</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const close = () => {
        overlay.remove();
        this.isOpen = false;
      };

      overlay.querySelector('#r34-modal-close').onclick = close;
      overlay.querySelector('#r34-modal-cancel').onclick = close;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      const pickBtn = overlay.querySelector('#r34-pick-folder-btn');
      if (pickBtn) {
        pickBtn.onclick = async () => {
          try {
            const handle = await DirectoryPickerManager.pickDirectory();
            if (handle) {
              const badge = overlay.querySelector('#r34-folder-badge');
              const label = overlay.querySelector('#r34-folder-label');
              badge.classList.remove('unset');
              label.textContent = `已绑定目标文件夹: ${handle.name}`;
              showToast(`已成功选择保存文件夹: ${handle.name}`);
            }
          } catch (err) {
            alert(`选择文件夹失败: ${err.message}`);
          }
        };
      }

      const clearFolderBtn = overlay.querySelector('#r34-clear-folder-btn');
      if (clearFolderBtn) {
        clearFolderBtn.onclick = async () => {
          await DirectoryPickerManager.clearSavedDirectory();
          const badge = overlay.querySelector('#r34-folder-badge');
          const label = overlay.querySelector('#r34-folder-label');
          badge.classList.add('unset');
          label.textContent = '使用浏览器默认 Downloads 目录';
          clearFolderBtn.remove();
          showToast('已重置为默认下载目录');
        };
      }

      const presetSelect = overlay.querySelector('#r34-subfolder-preset');
      presetSelect.onchange = () => {
        if (presetSelect.value) {
          overlay.querySelector('#r34-subfolder').value = presetSelect.value;
        }
      };

      overlay.querySelectorAll('.r34-tag-badge').forEach(badge => {
        badge.onclick = () => {
          const targetId = badge.getAttribute('data-target');
          const tag = badge.getAttribute('data-tag');
          const input = overlay.querySelector(`#${targetId}`);
          if (input) {
            input.value += (input.value.endsWith('/') || input.value.endsWith('_') || input.value === '') ? tag : `_${tag}`;
            input.focus();
          }
        };
      });

      overlay.querySelector('#r34-clear-history').onclick = () => {
        if (confirm('确定清空所有已下载状态记录吗？清空后网格上的已下载标记将被重置。')) {
          StorageManager.clearHistory();
          DownloadController.notifyStateChanged();
          close();
          showToast('已清空下载记录');
        }
      };

      overlay.querySelector('#r34-modal-reset').onclick = () => {
        if (confirm('确定恢复所有设置为默认吗？')) {
          StorageManager.saveSettings(DEFAULT_SETTINGS);
          close();
          showToast('已恢复默认设置');
        }
      };

      overlay.querySelector('#r34-modal-save').onclick = () => {
        const newSettings = Object.assign({}, settings, {
          subFolder: overlay.querySelector('#r34-subfolder').value.trim() || 'Rule34World',
          filenameTemplate: overlay.querySelector('#r34-filename-template').value.trim() || '{id}_{artist}_{character}',
          imageFormat: overlay.querySelector('#r34-img-format').value,
          videoQuality: overlay.querySelector('#r34-video-quality').value,
          videoCodec: overlay.querySelector('#r34-video-codec').value,
          duplicateAction: overlay.querySelector('#r34-duplicate-action').value,
          saveMetadataJson: overlay.querySelector('#r34-save-meta').checked,
          showNotification: overlay.querySelector('#r34-notification').checked,
        });

        StorageManager.saveSettings(newSettings);
        close();
        showToast('设置已保存');
      };
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * ==========================================
   * 11. 页面 DOM 注入与右侧悬浮工具条 (DOM Observers & Dock)
   * ==========================================
   */

  class UIController {
    static init() {
      injectStyles();
      this.createFloatingDock();
      this.bindGlobalEvents();
      this.observeDOM();
      this.scanAndInject();

      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('📥 下载管理器 (Downloads)', () => DownloadsManagerModal.show());
        GM_registerMenuCommand('⚡ 批量多页下载 (Batch Download)', () => BatchDownloadModal.show());
        GM_registerMenuCommand('⚙️ 偏好设置 (Settings)', () => SettingsModal.show());
      }

      DownloadController.subscribe(() => {
        this.updateAllButtonStates();
        this.updateDockBadge();
      });
    }

    static getCurrentPageTag() {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
      if (!path) return null;

      const reserved = ['highest', 'hot', 'playlists', 'trends', 'comments', 'announcements', 'contact-us', 'terms', 'dmca', 'post', 'auth', 'upgrade-to-premium'];
      const firstSegment = path.split('/')[0];
      if (reserved.includes(firstSegment)) return null;

      return decodeURIComponent(firstSegment);
    }

    static bindGlobalEvents() {
      const handleDownloadClick = (e) => {
        const targetBtn = e.target.closest('.r34-card-dl-btn, .r34-detail-dl-chip');
        if (targetBtn) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const postId = targetBtn.getAttribute('data-post-id');
          if (postId) {
            DownloadController.startDownload(postId);
          }
        }
      };

      document.addEventListener('click', handleDownloadClick, true);
      document.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.r34-card-dl-btn, .r34-detail-dl-chip')) {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      }, true);
      document.addEventListener('mousedown', (e) => {
        if (e.target.closest('.r34-card-dl-btn, .r34-detail-dl-chip')) {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      }, true);
    }

    /**
     * 创建右侧悬浮工具条 (包含任务面板、批量面板、设置面板)
     */
    static createFloatingDock() {
      if (document.getElementById('r34-dock-container')) return;

      const dock = document.createElement('div');
      dock.id = 'r34-dock-container';
      dock.className = 'r34-dock-container';

      dock.innerHTML = `
        <!-- 1. 下载任务管理器按钮 -->
        <div class="r34-dock-btn" id="r34-dock-downloads-btn" title="查看正在下载的任务与历史">
          <span class="material-icons">file_download</span>
          <div class="r34-dock-badge" id="r34-dock-badge" style="display:none;">0</div>
        </div>

        <!-- 2. 批量多页下载按钮 -->
        <div class="r34-dock-btn" id="r34-dock-batch-btn" title="Tag 多页全量批量下载">
          <span class="material-icons">layers</span>
        </div>

        <!-- 3. 设置按钮 -->
        <div class="r34-dock-btn" id="r34-dock-settings-btn" title="偏好设置与保存文件夹">
          <span class="material-icons">settings</span>
        </div>
      `;

      document.body.appendChild(dock);

      dock.querySelector('#r34-dock-downloads-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        DownloadsManagerModal.show();
      };

      dock.querySelector('#r34-dock-batch-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        BatchDownloadModal.show();
      };

      dock.querySelector('#r34-dock-settings-btn').onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        SettingsModal.show();
      };

      this.updateDockBadge();
    }

    static updateDockBadge() {
      const badge = document.getElementById('r34-dock-badge');
      if (!badge) return;

      const activeCount = DownloadController.getActiveTasksList().length;
      if (activeCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = activeCount;
      } else {
        badge.style.display = 'none';
      }
    }

    static observeDOM() {
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.scanAndInject();
        }, 120);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      window.addEventListener('popstate', () => {
        setTimeout(() => this.scanAndInject(), 150);
      });
    }

    static extractPostId(card) {
      const dataId = card.getAttribute('data-post-id');
      if (dataId && /^\d+$/.test(dataId.trim())) return dataId.trim();

      const href = card.getAttribute('href') || '';
      const match = href.match(/\/post\/(\d+)/);
      if (match) return match[1];

      return null;
    }

    static scanAndInject() {
      this.injectTagPageBatchButton();
      this.injectGridCardButtons();
      this.injectDetailPageButton();
    }

    static injectTagPageBatchButton() {
      const currentTag = this.getCurrentPageTag();
      if (!currentTag) return;

      const targetHeader = document.querySelector('app-filters-and-settings, .page-container--side-padding, app-posts-page');
      if (!targetHeader) return;

      if (!document.querySelector(`.r34-batch-tag-btn[data-tag="${currentTag}"]`)) {
        const btn = document.createElement('button');
        btn.className = 'r34-batch-tag-btn';
        btn.setAttribute('data-tag', currentTag);
        btn.setAttribute('type', 'button');
        btn.innerHTML = `
          <span class="material-icons">layers</span>
          <span>批量下载 #${currentTag} (多页全量)</span>
        `;

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          BatchDownloadModal.show(currentTag);
        };

        const filterHead = document.querySelector('app-filters-and-settings') || targetHeader;
        if (filterHead) {
          filterHead.parentNode.insertBefore(btn, filterHead);
        }
      }
    }

    static injectGridCardButtons() {
      const cardLinks = document.querySelectorAll('a.box, a[href*="/post/"]');

      cardLinks.forEach(card => {
        const postId = this.extractPostId(card);
        if (!postId) return;

        const targetContainer = card.querySelector('.box-inner') || card;
        if (!targetContainer) return;

        let btn = targetContainer.querySelector(`.r34-card-dl-btn[data-post-id="${postId}"]`);
        if (!btn) {
          btn = document.createElement('button');
          btn.className = 'r34-card-dl-btn';
          btn.setAttribute('data-post-id', postId);
          btn.setAttribute('type', 'button');
          btn.title = `下载 Post #${postId}`;

          targetContainer.appendChild(btn);
        }

        this.renderCardButtonState(btn, postId);
      });
    }

    static injectDetailPageButton() {
      const match = window.location.pathname.match(/\/post\/(\d+)/);
      if (!match) return;

      const postId = match[1];
      const actionsContainer = document.querySelector('app-post-actions .con');
      if (actionsContainer) {
        const existingChips = actionsContainer.querySelectorAll('.r34-detail-dl-chip');
        let chip = existingChips[0];

        if (!chip) {
          chip = document.createElement('button');
          chip.className = 'r34-detail-dl-chip';
          chip.setAttribute('type', 'button');
          actionsContainer.insertBefore(chip, actionsContainer.firstChild);
        }

        for (let i = 1; i < existingChips.length; i++) {
          existingChips[i].remove();
        }

        chip.setAttribute('data-post-id', postId);
        this.renderDetailButtonState(chip, postId);
      }
    }

    static updateAllButtonStates() {
      document.querySelectorAll('.r34-card-dl-btn').forEach(btn => {
        const postId = btn.getAttribute('data-post-id');
        if (postId) this.renderCardButtonState(btn, postId);
      });

      document.querySelectorAll('.r34-detail-dl-chip').forEach(chip => {
        const postId = chip.getAttribute('data-post-id');
        if (postId) this.renderDetailButtonState(chip, postId);
      });
    }

    static renderCardButtonState(btn, postId) {
      const isDownloaded = StorageManager.isDownloaded(postId);
      const isDownloading = DownloadController.isDownloading(postId);

      btn.classList.remove('r34-status-downloaded', 'r34-status-downloading', 'r34-status-error');

      if (isDownloading) {
        btn.classList.add('r34-status-downloading');
        const progress = DownloadController.getTaskProgress(postId);
        if (progress > 0) {
          btn.innerHTML = `<span class="r34-btn-progress">${progress}%</span>`;
        } else {
          btn.innerHTML = `<span class="material-icons r34-btn-icon" style="font-size:16px; animation: r34-spin 1s linear infinite;">sync</span>`;
        }
        btn.title = `正在下载: ${progress}%`;
      } else if (isDownloaded) {
        btn.classList.add('r34-status-downloaded');
        btn.innerHTML = `<span class="material-icons r34-btn-icon" style="font-size:18px;">check</span>`;
        btn.title = `已下载 (点击可重新下载)`;
      } else {
        btn.innerHTML = `<span class="material-icons r34-btn-icon" style="font-size:18px;">file_download</span>`;
        btn.title = `点击下载 Post #${postId}`;
      }
    }

    static renderDetailButtonState(chip, postId) {
      const isDownloaded = StorageManager.isDownloaded(postId);
      const isDownloading = DownloadController.isDownloading(postId);

      chip.classList.remove('r34-status-downloaded', 'r34-status-downloading', 'r34-status-error');

      if (isDownloading) {
        chip.classList.add('r34-status-downloading');
        const progress = DownloadController.getTaskProgress(postId);
        chip.innerHTML = `
          <span class="material-icons icon" style="animation: r34-spin 1s linear infinite;">sync</span>
          <span class="label">下载中 ${progress}%</span>
        `;
      } else if (isDownloaded) {
        chip.classList.add('r34-status-downloaded');
        chip.innerHTML = `
          <span class="material-icons icon">check_circle</span>
          <span class="label">已下载</span>
        `;
      } else {
        chip.innerHTML = `
          <span class="material-icons icon">file_download</span>
          <span class="label">下载原画</span>
        `;
      }
    }
  }

  /**
   * ==========================================
   * 12. 启动入口 (Initialization)
   * ==========================================
   */

  function init() {
    DownloadController.init();
    UIController.init();
    console.log(`[${SCRIPT_NAME}] v1.3.0 初始化就绪！`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
