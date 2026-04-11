import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ANALYTICS_COLORS } from '@/hooks/useCategorySalesAnalytics';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/**
 * Drill-down hierarchy:
 *   Level 0 (default): group by sub-category (or group/product name if no sub-cats)
 *   Level 1: clicked a sub-cat → group by 1st variant dimension
 *   Level 2: clicked a dim value → group by 2nd variant dimension
 *   ...
 *
 * drillPath shape:
 *   []                                                     → Level 0
 *   [{ type:'subcat', id, name }]                          → Level 1
 *   [{ type:'subcat', ... }, { type:'dim', dimName, dimValue }]  → Level 2
 */
export default function AdminCategoryInsights() {
  const { id: categoryId } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [drillPath, setDrillPath] = useState([]);

  // ── Data fetching ────────────────────────────────────────────────
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => user ? base44.entities.Category.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales', user?.email],
    queryFn: () => user ? base44.entities.Sale.filter({ created_by: user.email }, '-created_date', 2000) : [],
    enabled: !!user,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups', user?.email],
    queryFn: () => user ? base44.entities.ProductGroup.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants', user?.email],
    queryFn: () => user ? base44.entities.ProductVariant.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  // ── Lookup maps ──────────────────────────────────────────────────
  const categoryById = useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const groupById = useMemo(() => {
    const m = {};
    for (const g of groups) m[g.id] = g;
    return m;
  }, [groups]);

  const variantById = useMemo(() => {
    const m = {};
    for (const v of variants) m[v.id] = v;
    return m;
  }, [variants]);

  // ── Category tree ────────────────────────────────────────────────
  const category = categoryById[categoryId];
  const subCategoryIds = useMemo(
    () => categories.filter(c => c.parent_id === categoryId).map(c => c.id),
    [categories, categoryId]
  );
  const allCatIds = useMemo(() => [categoryId, ...subCategoryIds], [categoryId, subCategoryIds]);

  // ── Fetch ALL dimensions for the whole tree in one query ─────────
  const { data: allDimensions = [] } = useQuery({
    queryKey: ['variant-dimensions-tree', allCatIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(allCatIds.map(id => base44.entities.VariantDimension.filter({ category_id: id })));
      return results.flat();
    },
    enabled: allCatIds.length > 0,
  });

  const dimsByCatId = useMemo(() => {
    const m = {};
    for (const d of allDimensions) {
      if (!m[d.category_id]) m[d.category_id] = [];
      m[d.category_id].push(d);
    }
    return m;
  }, [allDimensions]);

  // Get effective sorted active dims for a category (respects inheritance)
  const getEffectiveDims = (catId) => {
    const cat = categoryById[catId];
    if (!cat) return [];
    let dims;
    if (cat.inherit_dimensions !== false && cat.parent_id && dimsByCatId[cat.parent_id]?.length) {
      dims = dimsByCatId[cat.parent_id];
    } else {
      dims = dimsByCatId[catId] || [];
    }
    return dims.filter(d => d.is_active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };

  // ── Enrich all sold items with catalog context ───────────────────
  const soldItems = useMemo(() => {
    const items = [];
    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        // Resolve variant and group
        const variant = item.variant_id ? variantById[item.variant_id] : null;
        const groupId = variant?.group_id || item.product_id;
        const group = groupById[groupId];
        if (!group) continue;

        const catId = group.category_id;
        const cat = categoryById[catId];
        if (!cat) continue;

        // Must belong to our tree (direct child or sub-category)
        const isDirectChild = catId === categoryId;
        const isSubCatChild = cat.parent_id === categoryId;
        if (!isDirectChild && !isSubCatChild) continue;

        // Determine which sub-cat bucket this item belongs to
        const subCatId = isSubCatChild ? catId : '__direct__';
        const subCatName = isSubCatChild ? cat.name : (category?.name || '');

        items.push({
          ...item,
          groupId,
          groupName: group.name,
          subCatId,
          subCatName,
          catId,
          variantDimensions: variant?.dimensions || {},
        });
      }
    }
    return items;
  }, [sales, variantById, groupById, categoryById, categoryId, category]);

  // ── Drill-path derived state ─────────────────────────────────────
  const subcatStep = drillPath.find(s => s.type === 'subcat') || null;
  const dimSteps = drillPath.filter(s => s.type === 'dim');

  // Distinct sub-cats with actual sales
  const activeSaleSubCatIds = useMemo(
    () => [...new Set(soldItems.map(i => i.subCatId))],
    [soldItems]
  );
  // True if there's more than one real sub-cat bucket, or a non-direct bucket
  const hasSubCats = activeSaleSubCatIds.length > 1
    || (activeSaleSubCatIds.length === 1 && activeSaleSubCatIds[0] !== '__direct__');

  // Items after sub-cat filter
  const subcatFilteredItems = useMemo(() => {
    if (!subcatStep) return soldItems;
    return soldItems.filter(i => i.subCatId === subcatStep.id);
  }, [soldItems, subcatStep]);

  // Items after sub-cat + dimension filters
  const filteredItems = useMemo(() => {
    let items = subcatFilteredItems;
    for (const step of dimSteps) {
      items = items.filter(i => i.variantDimensions[step.dimName] === step.dimValue);
    }
    return items;
  }, [subcatFilteredItems, dimSteps]);

  // Effective dims for the selected sub-cat (for Level 1+)
  const effectiveDims = useMemo(() => {
    if (!subcatStep || subcatStep.id === '__direct__') return [];
    return getEffectiveDims(subcatStep.id);
  }, [subcatStep, dimsByCatId, categoryById]);

  // Current dimension to show (based on how many dim steps we've already taken)
  const currentDim = subcatStep ? (effectiveDims[dimSteps.length] || null) : null;

  // Can we drill further?
  const canDrill = !subcatStep || (currentDim && effectiveDims[dimSteps.length + 1]);

  // Label for the current chart level
  const currentLabel = !subcatStep
    ? (hasSubCats ? 'תת-קטגוריה' : 'מוצר')
    : (currentDim?.name || '—');

  // ── Chart data ───────────────────────────────────────────────────
  const chartData = useMemo(() => {
    // Level 0: group by sub-cat (or group name if flat)
    if (!subcatStep) {
      const map = {};
      for (const item of soldItems) {
        const key = hasSubCats ? item.subCatId : item.groupId;
        const label = hasSubCats ? item.subCatName : item.groupName;
        if (!map[key]) map[key] = { id: key, name: label, revenue: 0, quantity: 0 };
        map[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
        map[key].quantity += item.quantity || 0;
      }
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }

    // Level 1+: group by current dimension value
    if (!currentDim) return [];
    const map = {};
    for (const item of filteredItems) {
      const val = item.variantDimensions[currentDim.name] || 'לא ידוע';
      if (!map[val]) map[val] = { id: val, name: val, revenue: 0, quantity: 0 };
      map[val].revenue += (item.sell_price || 0) * (item.quantity || 0);
      map[val].quantity += item.quantity || 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [soldItems, filteredItems, subcatStep, currentDim, hasSubCats]);

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleDrillDown = (row) => {
    if (!subcatStep) {
      // Level 0 → drill into sub-cat
      setDrillPath([{ type: 'subcat', id: row.id, name: row.name }]);
    } else if (canDrill && currentDim) {
      // Level 1+ → drill into next dimension
      setDrillPath(prev => [...prev, { type: 'dim', dimName: currentDim.name, dimValue: row.name }]);
    }
  };

  const handleBreadcrumbClick = (index) => {
    setDrillPath(prev => prev.slice(0, index));
  };

  const isLoading = loadingSales;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/AdminDashboard')} className="gap-2">
          <ArrowRight className="w-4 h-4" />
          חזור ללוח בקרה
        </Button>
        <h1 className="text-2xl font-bold text-gray-800">
          ניתוח קטגוריה: {category?.name || '...'}
        </h1>
      </div>

      {/* Breadcrumb */}
      {drillPath.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setDrillPath([])}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            כל הנתונים
          </button>
          {drillPath.map((step, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => handleBreadcrumbClick(idx + 1)}
                className={`text-sm font-medium ${idx === drillPath.length - 1 ? 'text-gray-800' : 'text-blue-600 hover:underline'}`}
              >
                {step.type === 'subcat' ? step.name : `${step.dimName}: ${step.dimValue}`}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : chartData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            {soldItems.length === 0 ? 'אין מכירות לקטגוריה זו' : 'אין עוד נתונים ברמה זו'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                פילוח לפי: <span className="text-amber-600">{currentLabel}</span>
                {drillPath.length > 0 && (
                  <span className="text-sm text-gray-400 font-normal mr-2">
                    ({drillPath.map(s => s.type === 'subcat' ? s.name : `${s.dimName}=${s.dimValue}`).join(' › ')})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="revenue"
                    labelLine={false}
                    label={({ name, percent }) =>
                      percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''
                    }
                    onClick={(entry) => handleDrillDown(entry)}
                    style={{ cursor: canDrill ? 'pointer' : 'default' }}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₪${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Breakdown List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">פירוט — {currentLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {chartData.map((row, idx) => (
                  <button
                    key={row.id}
                    onClick={() => canDrill && handleDrillDown(row)}
                    className={`w-full text-right p-3 rounded-xl border transition-all ${
                      canDrill
                        ? 'hover:border-amber-400 hover:bg-amber-50 cursor-pointer'
                        : 'cursor-default'
                    } bg-white border-gray-100`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length] }}
                        />
                        <span className="font-semibold text-sm">{row.name}</span>
                        {canDrill && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-amber-600">₪{row.revenue.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">
                          {row.quantity} יח׳ • {totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary stats */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-500">סה"כ הכנסות</p>
                <p className="text-xl font-bold text-amber-600">₪{totalRevenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">סה"כ יחידות</p>
                <p className="text-xl font-bold text-gray-700">
                  {chartData.reduce((s, d) => s + d.quantity, 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">ערכים שונים</p>
                <p className="text-xl font-bold text-blue-600">{chartData.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}