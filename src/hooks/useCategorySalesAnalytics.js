import { useMemo } from 'react';

export const ANALYTICS_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

/**
 * Unified hierarchical category sales analytics hook.
 *
 * Lookup chain per item:
 *   item.variant_id → variant.group_id → group.category_id → category → parent category
 *
 * Falls back to name-prefix match only when variant_id is missing.
 *
 * Returns:
 *   parentCategoryData: [{ id, name, revenue, cost, profit, quantity, subCategories: [...] }]
 *   flatCategoryData:   flat version (no subCategories) for pie charts — one entry per parent
 *   COLORS
 */
export function useCategorySalesAnalytics({ sales = [], categories = [], groups = [], variants = [] }) {
  return useMemo(() => {
    // ── Build lookup maps ────────────────────────────────────────
    const groupById = {};
    for (const g of groups) groupById[g.id] = g;

    const categoryById = {};
    for (const c of categories) categoryById[c.id] = c;

    // variant_id → group  (the critical map that was missing)
    const groupByVariantId = {};
    for (const v of variants) {
      if (v.group_id && groupById[v.group_id]) {
        groupByVariantId[v.id] = groupById[v.group_id];
      }
    }

    // group name → group  (for legacy name-based fallback)
    const groupByName = {};
    for (const g of groups) groupByName[g.name] = g;

    // ── Resolve group from a sale item ───────────────────────────
    function resolveGroup(item) {
      // 1. Primary: variant_id → group  (most accurate)
      if (item.variant_id && groupByVariantId[item.variant_id]) {
        return groupByVariantId[item.variant_id];
      }
      // 2. product_id might be a group id directly (older sales)
      if (item.product_id && groupById[item.product_id]) {
        return groupById[item.product_id];
      }
      // 3. Legacy: exact name match (strip dimension suffix after " - ")
      const baseName = item.product_name?.split(' - ')[0]?.trim();
      if (baseName) {
        // Exact match first
        if (groupByName[baseName]) return groupByName[baseName];
        // Partial match as last resort
        const partial = groups.find(g => g.name === baseName || baseName.startsWith(g.name));
        if (partial) return partial;
      }
      return null;
    }

    // ── Build "other" buckets by item name so they don't all collapse ──
    const otherItems = {}; // product_name → accumulated stats

    // ── Accumulate ───────────────────────────────────────────────
    // parentId → { id, name, revenue, cost, quantity, subMap }
    const parentMap = {};

    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const itemRevenue = (item.sell_price || 0) * (item.quantity || 0);
        const itemCost    = (item.cost_price  || 0) * (item.quantity || 0);
        const itemQty     = item.quantity || 0;

        let parentCatId   = null; // null = unmapped
        let parentCatName = null;
        let subCatId      = null;
        let subCatName    = null;

        const group = resolveGroup(item);
        if (group) {
          const cat = categoryById[group.category_id];
          if (cat) {
            if (cat.parent_id && categoryById[cat.parent_id]) {
              subCatId      = cat.id;
              subCatName    = cat.name;
              parentCatId   = cat.parent_id;
              parentCatName = categoryById[cat.parent_id].name;
            } else {
              parentCatId   = cat.id;
              parentCatName = cat.name;
            }
          }
        }

        // Unmapped items: bucket individually by product name (not one giant "אחר")
        if (!parentCatId) {
          const label = item.product_name?.split(' - ')[0]?.trim() || 'אחר';
          if (!otherItems[label]) {
            otherItems[label] = { revenue: 0, cost: 0, quantity: 0 };
          }
          otherItems[label].revenue  += itemRevenue;
          otherItems[label].cost     += itemCost;
          otherItems[label].quantity += itemQty;
          continue;
        }

        // Parent bucket
        if (!parentMap[parentCatId]) {
          parentMap[parentCatId] = {
            id: parentCatId, name: parentCatName,
            revenue: 0, cost: 0, quantity: 0,
            subMap: {},
          };
        }
        parentMap[parentCatId].revenue  += itemRevenue;
        parentMap[parentCatId].cost     += itemCost;
        parentMap[parentCatId].quantity += itemQty;

        // Sub-category bucket
        if (subCatId) {
          if (!parentMap[parentCatId].subMap[subCatId]) {
            parentMap[parentCatId].subMap[subCatId] = {
              id: subCatId, name: subCatName,
              revenue: 0, cost: 0, quantity: 0,
            };
          }
          parentMap[parentCatId].subMap[subCatId].revenue  += itemRevenue;
          parentMap[parentCatId].subMap[subCatId].cost     += itemCost;
          parentMap[parentCatId].subMap[subCatId].quantity += itemQty;
        }
      }
    }

    // ── Format output ────────────────────────────────────────────
    const parentCategoryData = Object.values(parentMap)
      .map(p => ({
        ...p,
        profit: p.revenue - p.cost,
        subCategories: Object.values(p.subMap)
          .map(s => ({ ...s, profit: s.revenue - s.cost }))
          .sort((a, b) => b.revenue - a.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Flat — one row per parent, for pie charts
    const flatCategoryData = parentCategoryData.map(({ subMap, ...rest }) => rest);

    return { parentCategoryData, flatCategoryData, COLORS: ANALYTICS_COLORS };
  }, [sales, categories, groups, variants]);
}