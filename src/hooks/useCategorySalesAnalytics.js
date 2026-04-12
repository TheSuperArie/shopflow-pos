import { useMemo } from 'react';

export const ANALYTICS_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

/**
 * Unified hierarchical category sales analytics hook.
 * Lookup chain per item:
 *   item.variant_id → variant.group_id → group.category_id → category → parent category
 * Falls back to exact name match for legacy data (older sales without variant_id).
 * Unmapped items are bucketed individually by name (no giant "אחר" slice).
 */
export function useCategorySalesAnalytics({ sales = [], categories = [], groups = [], variants = [] }) {
  return useMemo(() => {
    // ── Build lookup maps ────────────────────────────────────────
    const groupById = {};
    for (const g of groups) groupById[g.id] = g;

    const categoryById = {};
    for (const c of categories) categoryById[c.id] = c;

    // variant_id → group (String keys to avoid type mismatch)
    const groupByVariantId = {};
    for (const v of variants) {
      if (v.group_id && groupById[v.group_id]) {
        groupByVariantId[String(v.id)] = groupById[v.group_id];
      }
    }

    // group name → array of groups (for disambiguation when multiple share same name)
    const groupsByName = {};
    for (const g of groups) {
      if (!groupsByName[g.name]) groupsByName[g.name] = [];
      groupsByName[g.name].push(g);
    }

    // sub-category name → category object (for suffix-based disambiguation)
    const subCatByName = {};
    for (const c of categories) subCatByName[c.name] = c;

    // ── Resolve group from a sale item ───────────────────────────
    // Groups sorted by name length desc for partial matching (longest/most-specific first)
    const groupsSortedByNameLen = [...groups].sort((a, b) => b.name.length - a.name.length);

    function resolveGroup(item) {
      // 1. Primary: variant_id → group (most accurate, String-coerced)
      const rawVarId = item.variant_id ?? item.variantId;
      if (rawVarId && groupByVariantId[String(rawVarId)]) {
        return groupByVariantId[String(rawVarId)];
      }
      // 2. product_id might be a group id directly (older sales)
      if (item.product_id && groupById[item.product_id]) {
        return groupById[item.product_id];
      }
      // 3. Legacy: name match (strip dimension suffix after " - ")
      const baseName = item.product_name?.split(' - ')[0]?.trim();
      if (baseName) {
        const matchingGroups = groupsByName[baseName] || [];
        if (matchingGroups.length === 1) return matchingGroups[0];
        if (matchingGroups.length > 1) {
          // Try to match using first suffix part as sub-category name to disambiguate
          const firstSuffix = item.product_name?.split(' - ')[1]?.split(' / ')[0]?.trim();
          if (firstSuffix) {
            const subCat = subCatByName[firstSuffix];
            if (subCat) {
              const match = matchingGroups.find(g => g.category_id === subCat.id);
              if (match) return match;
            }
          }
          return matchingGroups[0];
        }
        // Partial name match fallback
        const partial = groupsSortedByNameLen.find(g =>
          baseName.startsWith(g.name) || g.name.startsWith(baseName)
        );
        if (partial) return partial;
      }
      return null;
    }

    // ── Accumulate ───────────────────────────────────────────────
    const parentMap = {};

    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const itemRevenue = (item.sell_price || 0) * (item.quantity || 0);
        const itemCost    = (item.cost_price  || 0) * (item.quantity || 0);
        const itemQty     = item.quantity || 0;

        let parentCatId   = null;
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

        // Unmapped: bucket individually by product name (not one giant slice)
        if (!parentCatId) {
          const label = item.product_name?.split(' - ')[0]?.trim() || 'אחר';
          parentCatId   = `__other__${label}`;
          parentCatName = label;
        }

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

    const flatCategoryData = parentCategoryData.map(({ subMap, ...rest }) => rest);

    return { parentCategoryData, flatCategoryData, COLORS: ANALYTICS_COLORS };
  }, [sales, categories, groups, variants]);
}