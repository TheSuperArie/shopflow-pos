// Offline Manager - handles caching and sync logic

const CACHE_KEYS = {
  CATEGORIES: 'offline_categories',
  GROUPS: 'offline_groups',
  VARIANTS: 'offline_variants',
  PENDING_SALES: 'offline_pending_sales',
  LAST_SYNC: 'offline_last_sync',
};

export const offlineManager = {
  // Save data to localStorage
  saveToCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Failed to save to cache:', error);
      return false;
    }
  },

  // Get data from localStorage
  getFromCache(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get from cache:', error);
      return null;
    }
  },

  // Cache all inventory data
  async cacheInventoryData(categories, groups, variants) {
    this.saveToCache(CACHE_KEYS.CATEGORIES, categories);
    this.saveToCache(CACHE_KEYS.GROUPS, groups);
    this.saveToCache(CACHE_KEYS.VARIANTS, variants);
    this.saveToCache(CACHE_KEYS.LAST_SYNC, new Date().toISOString());
  },

  // Get cached inventory data
  getCachedInventory() {
    return {
      categories: this.getFromCache(CACHE_KEYS.CATEGORIES) || [],
      groups: this.getFromCache(CACHE_KEYS.GROUPS) || [],
      variants: this.getFromCache(CACHE_KEYS.VARIANTS) || [],
    };
  },

  // Add pending sale (to sync later)
  addPendingSale(saleData) {
    const pending = this.getFromCache(CACHE_KEYS.PENDING_SALES) || [];
    pending.push({
      ...saleData,
      timestamp: new Date().toISOString(),
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });
    this.saveToCache(CACHE_KEYS.PENDING_SALES, pending);
    return pending.length;
  },

  // Get pending sales
  getPendingSales() {
    return this.getFromCache(CACHE_KEYS.PENDING_SALES) || [];
  },

  // Clear pending sales after successful sync
  clearPendingSales() {
    this.saveToCache(CACHE_KEYS.PENDING_SALES, []);
  },

  // Get last sync time
  getLastSyncTime() {
    return this.getFromCache(CACHE_KEYS.LAST_SYNC);
  },

  // Check if online
  isOnline() {
    return navigator.onLine;
  },
};