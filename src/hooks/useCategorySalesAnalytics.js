import { useMemo } from 'react';

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

/**
 * Unified hook for hierarchical category sales analytics.
 * Maps: sale item → ProductGroup → Sub-category → Parent Category
 *
 * Returns:
 *   parentCategoryData: [{ id, name, revenue, cost, profit, quantity, subCategories: [...] }]
 *   flatCategoryData:   same but flat, for pie charts
 *   COLORS
 */
export function useCategorySalesAnalytics({ sales = [], categories = [], groups = [] }) {
  const analytics = useMemo(() => {
    // Build lookup maps
    const groupMap = {};
    for (const g of groups) groupMap[g.id] = g;

    const categoryMap = {};
    for (const c of categories) categoryMap[c.id] = c;

    // parentId → { id, name, revenue, cost, quantity, subMap: { subId → {...} } }
    const parentMap = {};

    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        // Find group by product_id (variant_id stored as product_id in sale items)
        // Sale items have: product_name, sell_price, quantity, cost_price
        // We identify category via group lookup by name match or product_id
        const group = groupMap[item.product_id] ||
          groups.find(g => g.name && item.product_name?.startsWith(g.name));

        const itemRevenue = (item.sell_price || 0) * (item.quantity || 0);
        const itemCost = (item.cost_price || 0) * (item.quantity || 0);
        const itemQty = item.quantity || 0;

        let parentCatName = 'אחר';
        let parentCatId = '__other__';
        let subCatName = null;
        let subCatId = null;

        if (group) {
          const cat = categoryMap[group.category_id];
          if (cat) {
            if (cat.parent_id && categoryMap[cat.parent_id]) {
              // This is a sub-category
              subCatId = cat.id;
              subCatName = cat.name;
              parentCatId = cat.parent_id;
              parentCatName = categoryMap[cat.parent_id].name;
            } else {
              // This is a top-level category
              parentCatId = cat.id;
              parentCatName = cat.name;
            }
          }
        }

        // Accumulate into parentMap
        if (!parentMap[parentCatId]) {
          parentMap[parentCatId] = {
            id: parentCatId,
            name: parentCatName,
            revenue: 0,
            cost: 0,
            quantity: 0,
            subMap: {},
          };
        }
        parentMap[parentCatId].revenue += itemRevenue;
        parentMap[parentCatId].cost += itemCost;
        parentMap[parentCatId].quantity += itemQty;

        // Accumulate sub-category
        if (subCatId) {
          if (!parentMap[parentCatId].subMap[subCatId]) {
            parentMap[parentCatId].subMap[subCatId] = {
              id: subCatId,
              name: subCatName,
              revenue: 0,
              cost: 0,
              quantity: 0,
            };
          }
          parentMap[parentCatId].subMap[subCatId].revenue += itemRevenue;
          parentMap[parentCatId].subMap[subCatId].cost += itemCost;
          parentMap[parentCatId].subMap[subCatId].quantity += itemQty;
        }
      }
    }

    const parentCategoryData = Object.values(parentMap)
      .map(p => ({
        ...p,
        profit: p.revenue - p.cost,
        subCategories: Object.values(p.subMap)
          .map(s => ({ ...s, profit: s.revenue - s.cost }))
          .sort((a, b) => b.revenue - a.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Flat version for pie charts (same data, no subMap noise)
    const flatCategoryData = parentCategoryData.map(({ subMap, ...rest }) => rest);

    return { parentCategoryData, flatCategoryData, COLORS };
  }, [sales, categories, groups]);

  return analytics;
}