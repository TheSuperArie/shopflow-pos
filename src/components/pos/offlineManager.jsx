// Offline Manager - LocalStorage-based caching and sync queue

const KEYS = {
  CATEGORIES: 'pos_categories',
  GROUPS: 'pos_groups',
  VARIANTS: 'pos_variants',
  PENDING_SALES: 'pos_pending_sales',
  LAST_SYNC: 'pos_last_sync',
  OFFLINE_MODE: 'pos_offline_mode',
};

function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}

function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch(e) { return fallback; }
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
  cacheInventory(categories, groups, variants) {
    save(KEYS.CATEGORIES, categories);
    save(KEYS.GROUPS, groups);
    save(KEYS.VARIANTS, variants);
    save(KEYS.LAST_SYNC, new Date().toISOString());
  },

  getCachedInventory() {
    return {
      categories: load(KEYS.CATEGORIES, []),
      groups: load(KEYS.GROUPS, []),
      variants: load(KEYS.VARIANTS, []),
    };
  },

  getLastSync() {
    return load(KEYS.LAST_SYNC, null);
  },

  // Update local variant stock after offline sale
  deductLocalStock(cartItems) {
    const variants = load(KEYS.VARIANTS, []);
    const updated = variants.map(v => {
      const item = cartItems.find(i => i.variant_id === v.id);
      if (item) {
        return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
      }
      return v;
    });
    save(KEYS.VARIANTS, updated);
    return updated;
  },

  // ── Pending Sales Queue ───────────────────────────────
  addPendingSale(saleData) {
    const pending = load(KEYS.PENDING_SALES, []);
    const entry = {
      ...saleData,
      offline_id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      queued_at: new Date().toISOString(),
    };
    pending.push(entry);
    save(KEYS.PENDING_SALES, pending);
    return pending.length;
  },

  getPendingSales() {
    return load(KEYS.PENDING_SALES, []);
  },

  clearPendingSales() {
    save(KEYS.PENDING_SALES, []);
  },
};