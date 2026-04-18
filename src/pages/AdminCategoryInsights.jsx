import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ANALYTICS_COLORS } from '@/hooks/useCategorySalesAnalytics';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { format, startOfMonth } from 'date-fns';

export default function AdminCategoryInsights() {
  const { id: categoryId } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [drillPath, setDrillPath] = useState([]);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDimension, setSelectedDimension] = useState('__auto__');

  // ── Data fetching ────────────────────────────────────────────────
  const { data: categories = [], isLoading: loadingCategories, isFetching: fetchingCategories } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => base44.entities.Category.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  // Use a ref to track the "settled" categories — only update when NOT fetching
  // This prevents the brief moment where categories is stale/empty while isFetching=true
  const settledCategoriesRef = useRef([]);
  const [settledCategories, setSettledCategories] = useState([]);

  useEffect(() => {
    if (!loadingCategories && !fetchingCategories && categories.length >= 0) {
      settledCategoriesRef.current = categories;
      setSettledCategories(categories);
    }
  }, [categories, loadingCategories, fetchingCategories]);

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['insights-sales', user?.email],
    queryFn: () => base44.entities.Sale.filter({ created_by: user.email }, '-created_date', 2000),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['insights-groups', user?.email],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['insights-variants', user?.email],
    queryFn: () => base44.entities.ProductVariant.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  const { data: dimensions = [] } = useQuery({
    queryKey: ['insights-dimensions', user?.email],
    queryFn: () => base44.entities.VariantDimension.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

  // ── Lookup maps ──────────────────────────────────────────────────
  const categoryById = useMemo(() => {
    const m = {};
    for (const c of settledCategories) m[c.id] = c;
    return m;
  }, [settledCategories]);

  const groupById = useMemo(() => {
    const m = {};
    for (const g of groups) m[g.id] = g;
    return m;
  }, [groups]);

  const variantById = useMemo(() => {
    const m = {};
    for (const v of variants) m[String(v.id)] = v;
    return m;
  }, [variants]);

  // ── Category tree ────────────────────────────────────────────────
  const category = categoryById[categoryId];

  const subCategories = useMemo(
    () => settledCategories.filter(c => c.parent_id === categoryId),
    [settledCategories, categoryId]
  );

  const subCatById = useMemo(() => {
    const m = {};
    for (const c of subCategories) m[c.id] = c;
    return m;
  }, [subCategories]);

  // ── Dimensions available for this category tree ──────────────────
  // Collect all category IDs in our tree (parent + sub-cats)
  const treeCategoryIds = useMemo(() => {
    const ids = new Set([categoryId]);
    for (const sc of subCategories) ids.add(sc.id);
    return ids;
  }, [categoryId, subCategories]);

  // All dimension names used by groups in our tree
  const availableDimensionNames = useMemo(() => {
    const namesSet = new Set();
    // From VariantDimension records belonging to our tree categories
    for (const dim of dimensions) {
      if (treeCategoryIds.has(dim.category_id) && dim.is_active !== false) {
        namesSet.add(dim.name);
      }
    }
    // Also discover from actual variant data
    for (const v of variants) {
      const g = groupById[v.group_id];
      if (g && treeCategoryIds.has(g.category_id)) {
        for (const key of Object.keys(v.dimensions || {})) {
          namesSet.add(key);
        }
      }
    }
    return [...namesSet];
  }, [dimensions, variants, groupById, treeCategoryIds]);



  // ── Date-filtered sales ──────────────────────────────────────────
  const dateSales = useMemo(() => sales.filter(s => {
    const d = s.created_date?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  }), [sales, dateFrom, dateTo]);

  // ── Resolve all items belonging to this category tree ───────────
  // Each item gets: resolvedGroup, resolvedVariant, subCatId (if applicable)
  const resolvedItems = useMemo(() => {
    // Wait for categories to load before resolving — otherwise subCatById is empty
    if (loadingCategories || fetchingCategories || settledCategories.length === 0) return [];
    const items = [];
    for (const sale of dateSales) {
      for (const item of (sale.items || [])) {
        const baseName = item.product_name?.split(' - ')[0]?.trim();
        if (!baseName) continue;

        // Resolve group: try product_id first, then name match
        let group = groupById[item.product_id] && treeCategoryIds.has(groupById[item.product_id]?.category_id)
          ? groupById[item.product_id]
          : null;
        if (!group) {
          const candidates = groups.filter(g => g.name === baseName && treeCategoryIds.has(g.category_id));
          group = candidates[0] || null;
        }
        if (!group) continue;

        const catId = group.category_id;
        if (!categoryById[catId]) continue;

        const rawVarId = item.variant_id ?? item.variantId;
        const variant = rawVarId ? (variantById[String(rawVarId)] || null) : null;

        items.push({
          ...item,
          resolvedGroup: group,
          resolvedVariant: variant,
          subCatId: subCatById[catId] ? catId : null,
          subCatName: subCatById[catId] ? categoryById[catId].name : null,
        });
      }
    }
    return items;
  }, [dateSales, groups, groupById, categoryById, treeCategoryIds, subCatById, variantById, loadingCategories, settledCategories]);

  // ── Drill state ──────────────────────────────────────────────────
  // drillBucket stores { bucketId (subCatId or '__direct__'), bucketName }
  // This is STATIC — it only changes when user clicks a slice or hits back
  const drillBucket = drillPath[0] || null;

  // ── Step 1: Filter items by drill bucket (static — no selectedDimension dep) ──
  // At Level 1 this gives us ONLY items inside the drilled sub-category (or dim-value bucket)
  const filteredItems = useMemo(() => {
    if (!drillBucket) return resolvedItems; // Level 0: use all items

    const { bucketId } = drillBucket;

    // Sub-category drill (has real sub-cats)
    if (bucketId === '__direct__') return resolvedItems.filter(item => !item.subCatId);
    if (!bucketId.startsWith('__dim__')) return resolvedItems.filter(item => item.subCatId === bucketId);

    // Dimension-value drill (no sub-cats at Level 0 — bucketId = "__dim__<value>")
    const dimValue = bucketId.slice('__dim__'.length);
    const dimKey = selectedDimension === '__auto__' ? (availableDimensionNames[0] || null) : selectedDimension;

    return resolvedItems.filter(item => {
      // Direct variant match
      if (dimKey && item.resolvedVariant?.dimensions?.[dimKey] != null) {
        return String(item.resolvedVariant.dimensions[dimKey]).trim() === dimValue;
      }
      // Smart text scan fallback
      if (dimKey && item.product_name) {
        return item.product_name.toLowerCase().includes(dimValue.toLowerCase());
      }
      // Fallback: group name match
      return (item.resolvedGroup?.name || '') === dimValue;
    });
  }, [resolvedItems, drillBucket, selectedDimension, availableDimensionNames]);

  // ── Step 2: Build chart data from filteredItems (dynamic — selectedDimension dep) ──
  const chartData = useMemo(() => {
    // Don't bucket until categories are fully settled — prevents wrong "no sub-cats" branch
    if (loadingCategories || fetchingCategories || settledCategories.length === 0) return [];
    const hasSubCatsLocal = subCategories.length > 0;
    const dimKey = selectedDimension === '__auto__' ? (availableDimensionNames[0] || null) : selectedDimension;

    if (!drillBucket) {
      // ── LEVEL 0 ──────────────────────────────────────────────────
      if (hasSubCatsLocal) {
        // Group strictly by sub-category ID
        const map = {};
        for (const item of filteredItems) {
          const key = item.subCatId || '__direct__';
          const label = item.subCatName || 'כללי';
          if (!map[key]) map[key] = { id: key, name: label, revenue: 0, quantity: 0 };
          map[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
          map[key].quantity += item.quantity || 0;
        }
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
      } else {
        // No sub-cats: group by selected dimension
        const map = {};
        for (const item of filteredItems) {
          const dimVal = dimKey && item.resolvedVariant?.dimensions?.[dimKey] != null
            ? String(item.resolvedVariant.dimensions[dimKey]).trim()
            : (item.resolvedGroup?.name || 'אחר');
          const key = `__dim__${dimVal}`;
          if (!map[key]) map[key] = { id: key, name: dimVal, revenue: 0, quantity: 0 };
          map[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
          map[key].quantity += item.quantity || 0;
        }
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
      }
    }

    // ── LEVEL 1: filteredItems already contains ONLY the drilled bucket's items ──
    // Now slice them by selectedDimension — this is purely a display bucketing step

    // Build a set of all known valid values for the selected dimension
    const knownValuesForDim = new Set();
    if (dimKey) {
      for (const v of variants) {
        if (v.dimensions?.[dimKey] != null) {
          knownValuesForDim.add(String(v.dimensions[dimKey]).trim());
        }
      }
    }

    const map = {};
    for (const item of filteredItems) {
      let dimVal = 'ללא וריאציה';

      // Priority 1: Direct variant dimension lookup
      if (dimKey && item.resolvedVariant?.dimensions?.[dimKey] != null) {
        dimVal = String(item.resolvedVariant.dimensions[dimKey]).trim();
      }
      // Priority 2: Smart Text Scanner — search product name for known dimension values (whole-word / segment match only)
      else if (dimKey && item.product_name && knownValuesForDim.size > 0) {
        const segments = item.product_name.split(/[\s\-\/]+/).map(s => s.trim().toLowerCase());
        for (const knownVal of knownValuesForDim) {
          if (segments.includes(knownVal.toLowerCase())) {
            dimVal = knownVal;
            break;
          }
        }
      }

      if (!map[dimVal]) map[dimVal] = { id: dimVal, name: dimVal, revenue: 0, quantity: 0 };
      map[dimVal].revenue += (item.sell_price || 0) * (item.quantity || 0);
      map[dimVal].quantity += item.quantity || 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems, drillBucket, subCategories, selectedDimension, availableDimensionNames, loadingCategories, fetchingCategories, variants, settledCategories]);

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const hasSubCats = !loadingCategories && !fetchingCategories && settledCategories.length > 0 && subCategories.length > 0;
  const dimLabel = selectedDimension === '__auto__' ? (availableDimensionNames[0] || 'ממד') : selectedDimension;
  // Level 0 + sub-cats → "תת-קטגוריה" (never show dimension name here)
  // Level 0 + no sub-cats → dimension name
  // Level 1 → dimension name
  const currentLabel = (!drillBucket && hasSubCats) ? 'תת-קטגוריה' : dimLabel;
  const topLevelLabel = hasSubCats ? 'תת-קטגוריה' : dimLabel;
  const canDrill = !drillBucket;

  const handleDrillDown = (row) => {
    if (canDrill) {
      setSelectedDimension('__auto__');
      setDrillPath([{ bucketId: row.id, bucketName: row.name }]);
    }
  };

  const handleBack = () => {
    setDrillPath([]);
    setSelectedDimension('__auto__');
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/AdminDashboard')} className="gap-2">
            <ArrowRight className="w-4 h-4" />
            חזור ללוח בקרה
          </Button>
          <h1 className="text-2xl font-bold text-gray-800">
            ניתוח קטגוריה: {category?.name || '...'}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Dimension selector — shown only when drilling into a sub-cat, or when no sub-cats at level 0 */}
          {availableDimensionNames.length > 0 && (!!drillBucket || (!loadingCategories && !fetchingCategories && !hasSubCats)) && (
            <Select
              value={selectedDimension}
              onValueChange={(v) => { setSelectedDimension(v); }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="קבץ לפי..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">אוטומטי</SelectItem>
                {availableDimensionNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); handleBack(); }} className="w-40" />
          <span className="text-gray-400">עד</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); handleBack(); }} className="w-40" />
        </div>
      </div>

      {/* Breadcrumb */}
      {drillPath.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline font-medium">
            {topLevelLabel}
          </button>
          {drillPath.map((step, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-800">{step.bucketName}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {loadingSales || loadingCategories || fetchingCategories ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : chartData.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            אין מכירות לקטגוריה זו בטווח התאריכים
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                פילוח לפי: <span className="text-amber-600">{!drillBucket && hasSubCats ? 'תת-קטגוריות' : currentLabel}</span>
                {drillBucket && (
                  <span className="text-sm text-gray-400 font-normal mr-2">({drillBucket.bucketName})</span>
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
                    label={({ name, percent }) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}
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
              <CardTitle className="text-base">פירוט — {!drillBucket && hasSubCats ? 'תת-קטגוריות' : currentLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {chartData.map((row, idx) => (
                  <button
                    key={row.id}
                    onClick={() => canDrill && handleDrillDown(row)}
                    className={`w-full text-right p-3 rounded-xl border transition-all ${
                      canDrill ? 'hover:border-amber-400 hover:bg-amber-50 cursor-pointer' : 'cursor-default'
                    } bg-white border-gray-100`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length] }} />
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
                <p className="text-xl font-bold text-gray-700">{chartData.reduce((s, d) => s + d.quantity, 0)}</p>
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