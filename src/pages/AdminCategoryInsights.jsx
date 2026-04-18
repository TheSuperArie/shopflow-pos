import React, { useState, useMemo } from 'react';
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
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => base44.entities.Category.filter({ created_by: user.email }),
    enabled: !!user,
    staleTime: 0,
  });

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
    for (const v of variants) m[String(v.id)] = v;
    return m;
  }, [variants]);

  // ── Category tree ────────────────────────────────────────────────
  const category = categoryById[categoryId];

  const subCategories = useMemo(
    () => categories.filter(c => c.parent_id === categoryId),
    [categories, categoryId]
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

  // All known dimension values across the tree (for legacy string matching)
  const allDimValuesSet = useMemo(() => {
    const s = new Set();
    for (const dim of dimensions) {
      if (treeCategoryIds.has(dim.category_id)) {
        for (const val of (dim.values || [])) s.add(String(val).trim());
      }
    }
    for (const v of variants) {
      const g = groupById[v.group_id];
      if (g && treeCategoryIds.has(g.category_id)) {
        for (const val of Object.values(v.dimensions || {})) s.add(String(val).trim());
      }
    }
    return s;
  }, [dimensions, variants, groupById, treeCategoryIds]);

  // Sub-category names set (for legacy matching)
  const subCatNameSet = useMemo(() => {
    const s = new Set();
    for (const sc of subCategories) s.add(sc.name.trim());
    return s;
  }, [subCategories]);

  // ── Date-filtered sales ──────────────────────────────────────────
  const dateSales = useMemo(() => sales.filter(s => {
    const d = s.created_date?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  }), [sales, dateFrom, dateTo]);

  // ── Core bucket assignment — 4-level Fallback Chain ──────────────
  const soldItems = useMemo(() => {
    const items = [];

    for (const sale of dateSales) {
      for (const item of (sale.items || [])) {
        // ── Resolve group ────────────────────────────────────────
        const baseName = item.product_name?.split(' - ')[0]?.trim();
        if (!baseName) continue;

        let group = groupById[item.product_id] || null;
        if (group) {
          const inTree = treeCategoryIds.has(group.category_id);
          if (!inTree) group = null;
        }
        if (!group) {
          const candidates = groups.filter(g => g.name === baseName);
          group = candidates.find(g => treeCategoryIds.has(g.category_id)) || null;
        }
        if (!group) continue;

        const catId = group.category_id;
        const cat = categoryById[catId];
        if (!cat) continue;
        if (!treeCategoryIds.has(catId)) continue;

        const isSubCatChild = !!subCatById[catId];

        let bucketId, bucketName;

        // ── PRIORITY 1: Sub-category match ───────────────────────
        if (isSubCatChild) {
          bucketId = catId;
          bucketName = cat.name;
        } else {
          // ── PRIORITY 2: Variant dimension lookup ─────────────────
          const rawVarId = item.variant_id ?? item.variantId;
          const variant = rawVarId ? variantById[String(rawVarId)] : null;

          if (variant && variant.dimensions && Object.keys(variant.dimensions).length > 0) {
            // Use the user-selected dimension, or pick the first available
            const dimKey = (selectedDimension !== '__auto__' && variant.dimensions[selectedDimension] !== undefined)
              ? selectedDimension
              : Object.keys(variant.dimensions)[0];
            const dimVal = String(variant.dimensions[dimKey] ?? '').trim();
            if (dimVal) {
              bucketId = `__dim__${dimKey}__${dimVal}`;
              bucketName = dimVal;
            }
          }

          // ── PRIORITY 3: Smart legacy string matching ─────────────
          if (!bucketId) {
            const parts = (item.product_name || '')
              .split(/[\s\-\/]+/)
              .map(p => p.trim())
              .filter(Boolean);

            // Check each token against known sub-cat names or dim values
            let matched = null;
            for (const part of parts) {
              if (subCatNameSet.has(part)) { matched = part; break; }
            }
            if (!matched) {
              for (const part of parts) {
                if (allDimValuesSet.has(part)) { matched = part; break; }
              }
            }
            if (matched) {
              bucketId = `__legacy__${matched}`;
              bucketName = matched;
            }
          }

          // ── PRIORITY 4: Ultimate fallback ─────────────────────────
          if (!bucketId) {
            bucketId = group.id;
            bucketName = group.name;
          }
        }

        items.push({
          ...item,
          resolvedGroupId: group.id,
          groupName: group.name,
          bucketId,
          bucketName,
          resolvedVariant: variant ?? null,
        });
      }
    }
    return items;
  }, [dateSales, groups, groupById, categoryById, treeCategoryIds, subCatById,
      variantById, selectedDimension, subCatNameSet, allDimValuesSet]);

  // ── Drill state ──────────────────────────────────────────────────
  const drillBucket = drillPath[0] || null;

  const filteredItems = useMemo(() => {
    if (!drillBucket) return soldItems;
    return soldItems.filter(i => i.bucketId === drillBucket.bucketId);
  }, [soldItems, drillBucket]);

  // ── Chart data ───────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const sourceItems = drillBucket ? filteredItems : soldItems;

    if (!drillBucket) {
      // Level 0: group by bucket
      const map = {};
      for (const item of sourceItems) {
        const key = item.bucketId;
        const label = item.bucketName;
        if (!map[key]) map[key] = { id: key, name: label, revenue: 0, quantity: 0 };
        map[key].revenue += (item.sell_price || 0) * (item.quantity || 0);
        map[key].quantity += item.quantity || 0;
      }
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }

    // Level 1 (drilled into a bucket): break down by a secondary dimension
    // Try to find a second dimension key that differs from the bucket's dim key
    const map = {};
    for (const item of sourceItems) {
      let secondLabel = null;

      const variant = item.resolvedVariant;
      if (variant && variant.dimensions) {
        const dims = variant.dimensions;
        const dimKeys = Object.keys(dims);
        // Pick the first key that was NOT used for the top-level bucket
        const bucketDimVal = item.bucketName;
        const secondKey = dimKeys.find(k => String(dims[k]).trim() !== bucketDimVal) || dimKeys[1];
        if (secondKey) secondLabel = String(dims[secondKey]).trim();
      }

      // Legacy fallback: use group name
      if (!secondLabel) secondLabel = item.groupName;

      if (!map[secondLabel]) map[secondLabel] = { id: secondLabel, name: secondLabel, revenue: 0, quantity: 0 };
      map[secondLabel].revenue += (item.sell_price || 0) * (item.quantity || 0);
      map[secondLabel].quantity += item.quantity || 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [soldItems, filteredItems, drillBucket]);

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const hasSubCats = subCategories.length > 0;
  const topLevelLabel = hasSubCats ? 'תת-קטגוריה' : (availableDimensionNames[0] || 'קבוצה');
  const currentLabel = !drillBucket ? topLevelLabel : 'פירוט';
  const canDrill = !drillBucket;

  const handleDrillDown = (row) => {
    if (canDrill) setDrillPath([{ bucketId: row.id, bucketName: row.name }]);
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
          {/* Dimension selector (only when no sub-cats) */}
          {!hasSubCats && availableDimensionNames.length > 1 && (
            <Select
              value={selectedDimension}
              onValueChange={(v) => { setSelectedDimension(v); setDrillPath([]); }}
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
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDrillPath([]); }} className="w-40" />
          <span className="text-gray-400">עד</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDrillPath([]); }} className="w-40" />
        </div>
      </div>

      {/* Breadcrumb */}
      {drillPath.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setDrillPath([])} className="text-sm text-blue-600 hover:underline font-medium">
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

      {loadingSales ? (
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
                פילוח לפי: <span className="text-amber-600">{currentLabel}</span>
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
              <CardTitle className="text-base">פירוט — {currentLabel}</CardTitle>
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