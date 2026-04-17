import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  // ── Data fetching ────────────────────────────────────────────────
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => user ? base44.entities.Category.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['insights-sales', user?.email],
    queryFn: async () => {
      const result = await base44.entities.Sale.filter({ created_by: user.email }, '-created_date', 2000);
      console.log('[INSIGHTS] sales loaded:', result.length, 'for user:', user.email);
      return result;
    },
    enabled: !!user,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['insights-groups', user?.email],
    queryFn: async () => {
      const result = await base44.entities.ProductGroup.filter({ created_by: user.email });
      console.log('[INSIGHTS] groups loaded:', result.length);
      return result;
    },
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

  // group name → first matching group (for name-based lookup)
  const groupByBaseName = useMemo(() => {
    const m = {};
    for (const g of groups) {
      if (!m[g.name]) m[g.name] = g;
    }
    return m;
  }, [groups]);

  // ── Category tree ────────────────────────────────────────────────
  const category = categoryById[categoryId];
  const subCategories = useMemo(
    () => categories.filter(c => c.parent_id === categoryId),
    [categories, categoryId]
  );

  // subCategory id → subCategory object
  const subCatById = useMemo(() => {
    const m = {};
    for (const c of subCategories) m[c.id] = c;
    return m;
  }, [subCategories]);

  // ── Date-filtered sales ──────────────────────────────────────────
  const dateSales = useMemo(() => sales.filter(s => {
    const d = s.created_date?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  }), [sales, dateFrom, dateTo]);

  // ── Extract first suffix from product name ───────────────────────
  // "חולצות - 34/35 / אמריקאי / רגולר" → "34/35"
  const getFirstSuffix = (productName) => {
    if (!productName?.includes(' - ')) return null;
    const after = productName.split(' - ').slice(1).join(' - ').trim();
    return after.split(' / ')[0]?.trim() || null;
  };

  // ── Build sold items with bucket assignment ──────────────────────
  const soldItems = useMemo(() => {
    const items = [];
    for (const sale of dateSales) {
      for (const item of (sale.items || [])) {
        const baseName = item.product_name?.split(' - ')[0]?.trim();
        if (!baseName) continue;

        // Find the group by product_id or by base name
        let group = groupById[item.product_id] || groupByBaseName[baseName] || null;
        if (!group) continue;

        const catId = group.category_id;
        const cat = categoryById[catId];
        if (!cat) continue;

        // Must belong to our category tree
        const isDirectChild = catId === categoryId;
        const isSubCatChild = !!subCatById[catId];
        if (!isDirectChild && !isSubCatChild) continue;

        // Determine bucket (what slice of the pie this item belongs to)
        let bucketId, bucketName;

        if (isSubCatChild) {
          // Group belongs directly to a sub-category → use sub-cat name
          bucketId = catId;
          bucketName = cat.name;
        } else {
          // Group belongs to the parent category itself
          // Extract first suffix from product name as the bucket key
          const suffix = getFirstSuffix(item.product_name);
          if (suffix) {
            bucketId = `__suffix__${suffix}`;
            bucketName = suffix;
          } else {
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
        });
      }
    }
    return items;
  }, [dateSales, groupById, groupByBaseName, categoryById, categoryId, subCatById]);

  // ── Drill state ──────────────────────────────────────────────────
  const drillBucket = drillPath[0] || null; // { bucketId, bucketName }

  const filteredItems = useMemo(() => {
    if (!drillBucket) return soldItems;
    return soldItems.filter(i => i.bucketId === drillBucket.bucketId);
  }, [soldItems, drillBucket]);

  // ── Chart data ───────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const sourceItems = drillBucket ? filteredItems : soldItems;

    if (!drillBucket) {
      // Level 0: group by bucket (sub-category or first suffix)
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

    // Level 1 (drilled): group by second suffix part (e.g. "אמריקאי")
    const map = {};
    for (const item of sourceItems) {
      const after = item.product_name?.split(' - ').slice(1).join(' - ') || '';
      const parts = after.split(' / ').map(s => s.trim()).filter(Boolean);
      const secondPart = parts[1] || parts[0] || item.groupName;
      if (!map[secondPart]) map[secondPart] = { id: secondPart, name: secondPart, revenue: 0, quantity: 0 };
      map[secondPart].revenue += (item.sell_price || 0) * (item.quantity || 0);
      map[secondPart].quantity += item.quantity || 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [soldItems, filteredItems, drillBucket]);

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);

  const currentLabel = !drillBucket ? 'מידה' : 'סוג';
  const canDrill = !drillBucket;

  const handleDrillDown = (row) => {
    if (canDrill) {
      setDrillPath([{ bucketId: row.id, bucketName: row.name }]);
    }
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
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDrillPath([]); }} className="w-40" />
          <span className="text-gray-400">עד</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDrillPath([]); }} className="w-40" />
        </div>
      </div>

      {/* Breadcrumb */}
      {drillPath.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setDrillPath([])} className="text-sm text-blue-600 hover:underline font-medium">
            כל המידות
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