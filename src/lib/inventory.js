import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { variantLabel } from '@/lib/supplyOrders';

export { variantLabel };

export const DEFAULT_THRESHOLD = 5;

/** A product's own shortage threshold wins over the store-wide one. */
export const thresholdFor = (group, globalThreshold = DEFAULT_THRESHOLD) => {
  const own = group?.low_stock_threshold;
  return own === null || own === undefined || own === '' ? Number(globalThreshold ?? DEFAULT_THRESHOLD) : Number(own);
};

/** 'out' | 'low' | 'ok' */
export const stockStatus = (stock, threshold) => {
  const s = Number(stock || 0);
  if (s <= 0) return 'out';
  if (s < threshold) return 'low';
  return 'ok';
};

/**
 * One indexed view of a catalog: categories (with children), products per category,
 * sizes per product, and per-node totals (units / sizes / low / out).
 */
export function buildInventoryIndex({ categories = [], groups = [], variants = [], globalThreshold }) {
  const activeGroups = groups.filter(g => g.is_active !== false);
  const groupById = new Map(activeGroups.map(g => [g.id, g]));
  const catById = new Map(categories.map(c => [c.id, c]));

  const variantsByGroup = new Map();
  variants.forEach(v => {
    if (!groupById.has(v.group_id)) return;
    if (!variantsByGroup.has(v.group_id)) variantsByGroup.set(v.group_id, []);
    variantsByGroup.get(v.group_id).push(v);
  });

  const childrenOf = new Map();
  categories.forEach(c => {
    const parent = c.parent_id && catById.has(c.parent_id) ? c.parent_id : null;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(c);
  });
  const sortCats = (list = []) => [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'he'));

  const groupsByCat = new Map();
  activeGroups.forEach(g => {
    const key = g.category_id && catById.has(g.category_id) ? g.category_id : null;
    if (!groupsByCat.has(key)) groupsByCat.set(key, []);
    groupsByCat.get(key).push(g);
  });

  const productStats = (g) => {
    const th = thresholdFor(g, globalThreshold);
    const vs = variantsByGroup.get(g.id) || [];
    let units = 0, low = 0, out = 0;
    vs.forEach(v => {
      units += Number(v.stock || 0);
      const st = stockStatus(v.stock, th);
      if (st === 'low') low += 1;
      if (st === 'out') out += 1;
    });
    return { units, sizes: vs.length, low, out, threshold: th, variantIds: vs.map(v => v.id) };
  };

  const statsCache = new Map();
  const categoryStats = (catId) => {
    if (statsCache.has(catId)) return statsCache.get(catId);
    const acc = { units: 0, sizes: 0, low: 0, out: 0, products: 0, variantIds: [] };
    (groupsByCat.get(catId) || []).forEach(g => {
      const s = productStats(g);
      acc.units += s.units; acc.sizes += s.sizes; acc.low += s.low; acc.out += s.out; acc.products += 1;
      acc.variantIds.push(...s.variantIds);
    });
    (childrenOf.get(catId) || []).forEach(child => {
      const s = categoryStats(child.id);
      acc.units += s.units; acc.sizes += s.sizes; acc.low += s.low; acc.out += s.out; acc.products += s.products;
      acc.variantIds.push(...s.variantIds);
    });
    statsCache.set(catId, acc);
    return acc;
  };

  return {
    groupById,
    catById,
    variantsOf: (groupId) => variantsByGroup.get(groupId) || [],
    childCategories: (catId) => sortCats(childrenOf.get(catId ?? null) || []),
    productsIn: (catId) => [...(groupsByCat.get(catId ?? null) || [])].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    hasUncategorized: (groupsByCat.get(null) || []).length > 0,
    productStats,
    categoryStats,
    allVariants: variants.filter(v => groupById.has(v.group_id)),
    thresholdOfVariant: (v) => thresholdFor(groupById.get(v.group_id), globalThreshold),
    globalThreshold,
  };
}

const CHUNK = 20;

/**
 * Applies stock changes in small batches.
 *  ops: [{ variant, mode: 'add' | 'set', value }]
 * 'add' re-reads the current stock right before writing (the POS may have sold meanwhile).
 * Every change is logged in StockUpdate (quantity_added = the actual delta) for the history tab.
 */
export async function applyStockChanges(ops, { branchId = null, groupById, note = '', onProgress } = {}) {
  const done = [];
  for (let start = 0; start < ops.length; start += CHUNK) {
    const chunk = ops.slice(start, start + CHUNK);
    const ids = chunk.map(o => o.variant.id);
    const fresh = await base44.entities.ProductVariant.filter({ id: { $in: ids } }, undefined, ids.length);
    const freshById = new Map(fresh.map(v => [v.id, v]));

    const updates = [];
    const logs = [];
    chunk.forEach(({ variant, mode, value }) => {
      const current = Number(freshById.get(variant.id)?.stock ?? variant.stock ?? 0);
      const next = Math.max(0, mode === 'add' ? current + Number(value) : Number(value));
      if (!freshById.has(variant.id) || next === current) return;
      updates.push({ id: variant.id, stock: next });
      const group = groupById?.get(variant.group_id);
      const label = variantLabel(variant);
      logs.push({
        product_id: variant.id,
        product_name: `${group?.name || 'מוצר'}${label ? ` - ${label}` : ''}`,
        quantity_added: next - current,
        arrival_date: format(new Date(), 'yyyy-MM-dd'),
        notes: [mode === 'add' ? `הוספה (${current} → ${next})` : `עדכון כמות (${current} → ${next})`, note].filter(Boolean).join(' · '),
        ...(branchId ? { branch_id: branchId } : {}),
      });
    });

    if (updates.length) {
      await base44.entities.ProductVariant.bulkUpdate(updates);
      try { await base44.entities.StockUpdate.bulkCreate(logs); } catch { /* history is best-effort */ }
    }
    done.push(...updates);
    onProgress?.(Math.round(((start + chunk.length) / ops.length) * 100));
  }
  return done;
}
