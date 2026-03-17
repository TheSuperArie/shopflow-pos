// Offline Manager - IndexedDB-based caching, FIFO sync queue, and bi-directional sync

const DB_NAME = 'pos_offline_db';
const DB_VERSION = 1;

const STORES = {
  PENDING_SALES: 'pending_sales',
  FAILED_SYNCS: 'failed_syncs',
  INVENTORY_CACHE: 'inventory_cache',
};

const KEYS = {
  OFFLINE_MODE: 'pos_offline_mode',
  LAST_SYNC: 'pos_last_sync',
  SYNC_IN_PROGRESS: 'pos_sync_in_progress',
};

// Initialize IndexedDB
let db = null;

async function initDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORES.PENDING_SALES)) {
        const store = database.createObjectStore(STORES.PENDING_SALES, { keyPath: 'offline_id' });
        store.createIndex('queued_at', 'queued_at', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.FAILED_SYNCS)) {
        const store = database.createObjectStore(STORES.FAILED_SYNCS, { keyPath: 'offline_id' });
        store.createIndex('error_date', 'error_date', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.INVENTORY_CACHE)) {
        database.createObjectStore(STORES.INVENTORY_CACHE, { keyPath: 'key' });
      }
    };
  });
}

// LocalStorage helpers for simple flags
function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}

function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch(e) { return fallback; }
}

// IndexedDB helpers
async function dbGet(storeName, key) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, data) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(storeName, key) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName, indexName = null, query = null) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const source = indexName ? store.index(indexName) : store;
    const request = query ? source.getAll(query) : source.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbClear(storeName) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export const offlineManager = {
  // ── Mode ──────────────────────────────────────────────
  isOfflineMode() {
    return load(KEYS.OFFLINE_MODE, false);
  },
  setOfflineMode(val) {
    save(KEYS.OFFLINE_MODE, val);
  },

  // ── Inventory Cache ───────────────────────────────────
  async cacheInventory(categories, groups, variants) {
    await dbPut(STORES.INVENTORY_CACHE, { key: 'categories', data: categories });
    await dbPut(STORES.INVENTORY_CACHE, { key: 'groups', data: groups });
    await dbPut(STORES.INVENTORY_CACHE, { key: 'variants', data: variants });
    save(KEYS.LAST_SYNC, new Date().toISOString());
  },

  async getCachedInventory() {
    try {
      const [catObj, groupObj, varObj] = await Promise.all([
        dbGet(STORES.INVENTORY_CACHE, 'categories'),
        dbGet(STORES.INVENTORY_CACHE, 'groups'),
        dbGet(STORES.INVENTORY_CACHE, 'variants'),
      ]);
      return {
        categories: catObj?.data || [],
        groups: groupObj?.data || [],
        variants: varObj?.data || [],
      };
    } catch (e) {
      console.error('Error reading cached inventory:', e);
      return { categories: [], groups: [], variants: [] };
    }
  },

  getLastSync() {
    return load(KEYS.LAST_SYNC, null);
  },

  // Update local variant stock after offline sale (IMMEDIATE)
  async deductLocalStock(cartItems) {
    try {
      const cachedObj = await dbGet(STORES.INVENTORY_CACHE, 'variants');
      const variants = cachedObj?.data || [];
      
      const updated = variants.map(v => {
        const item = cartItems.find(i => i.id === v.id || i.variant_id === v.id);
        if (item) {
          return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
        }
        return v;
      });
      
      await dbPut(STORES.INVENTORY_CACHE, { key: 'variants', data: updated });
      return updated;
    } catch (e) {
      console.error('Error deducting local stock:', e);
      return [];
    }
  },

  // ── Pending Sales Queue (FIFO) ────────────────────────
  async addPendingSale(saleData) {
    try {
      const entry = {
        ...saleData,
        offline_id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        queued_at: new Date().toISOString(),
        status: 'pending', // 'pending', 'syncing', 'synced'
      };
      await dbPut(STORES.PENDING_SALES, entry);
      const pending = await dbGetAll(STORES.PENDING_SALES, 'status', 'pending');
      return pending.length;
    } catch (e) {
      console.error('Error adding pending sale:', e);
      return 0;
    }
  },

  async getPendingSales() {
    try {
      return await dbGetAll(STORES.PENDING_SALES, 'status', 'pending');
    } catch (e) {
      console.error('Error getting pending sales:', e);
      return [];
    }
  },

  async getFailedSyncs() {
    try {
      return await dbGetAll(STORES.FAILED_SYNCS);
    } catch (e) {
      console.error('Error getting failed syncs:', e);
      return [];
    }
  },

  async markSaleAsSyncing(offlineId) {
    try {
      const sale = await dbGet(STORES.PENDING_SALES, offlineId);
      if (sale) {
        await dbPut(STORES.PENDING_SALES, { ...sale, status: 'syncing' });
      }
    } catch (e) {
      console.error('Error marking sale as syncing:', e);
    }
  },

  async markSaleAsSynced(offlineId) {
    try {
      await dbDelete(STORES.PENDING_SALES, offlineId);
    } catch (e) {
      console.error('Error marking sale as synced:', e);
    }
  },

  async moveSaleToFailed(offlineId, errorMessage) {
    try {
      const sale = await dbGet(STORES.PENDING_SALES, offlineId);
      if (sale) {
        await dbPut(STORES.FAILED_SYNCS, {
          ...sale,
          error_message: errorMessage,
          error_date: new Date().toISOString(),
        });
        await dbDelete(STORES.PENDING_SALES, offlineId);
      }
    } catch (e) {
      console.error('Error moving sale to failed:', e);
    }
  },

  async clearFailedSync(offlineId) {
    try {
      await dbDelete(STORES.FAILED_SYNCS, offlineId);
    } catch (e) {
      console.error('Error clearing failed sync:', e);
    }
  },

  async clearAllPendingSales() {
    try {
      await dbClear(STORES.PENDING_SALES);
    } catch (e) {
      console.error('Error clearing pending sales:', e);
    }
  },

  isSyncInProgress() {
    return load(KEYS.SYNC_IN_PROGRESS, false);
  },

  setSyncInProgress(val) {
    save(KEYS.SYNC_IN_PROGRESS, val);
  },
};