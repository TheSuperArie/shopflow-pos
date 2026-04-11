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

export default function AdminCategoryInsights() {
  const { id: categoryId } = useParams();
  const navigate = useNavigate();
  const user = useCurrentUser();

  // Drill-down state: array of { dimName, dimValue } — breadcrumb trail
  const [drillPath, setDrillPath] = useState([]);

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

  const { data: dimensions = [] } = useQuery({
    queryKey: ['variant-dimensions', categoryId],
    queryFn: () => base44.entities.VariantDimension.filter({ category_id: categoryId }),
    enabled: !!categoryId,
  });

  // Resolve category + its sub-categories
  const category = categories.find(c => c.id === categoryId);
  const subCatIds = categories.filter(c => c.parent_id === categoryId).map(c => c.id);
  const allCatIds = [categoryId, ...subCatIds];

  // All group IDs belonging to this category tree
  const catGroupIds = useMemo(
    () => new Set(groups.filter(g => allCatIds.includes(g.category_id)).map(g => g.id)),
    [groups, allCatIds]
  );

  // Variant → dimensions map
  const variantById = useMemo(() => {
    const map = {};
    for (const v of variants) map[v.id] = v;
    return map;
  }, [variants]);

  // Collect all sold items for this category tree
  const soldItems = useMemo(() => {
    const items = [];
    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const variant = item.variant_id ? variantById[item.variant_id] : null;
        const groupId = variant?.group_id || item.product_id;
        if (!catGroupIds.has(groupId)) continue;
        items.push({
          ...item,
          variantDimensions: variant?.dimensions || {},
        });
      }
    }
    return items;
  }, [sales, catGroupIds, variantById]);

  // Sorted active dimensions for this category
  const activeDimensions = useMemo(
    () => [...dimensions].filter(d => d.is_active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [dimensions]
  );

  // Apply drill-down filters to items
  const filteredItems = useMemo(() => {
    let items = soldItems;
    for (const step of drillPath) {
      items = items.filter(item => item.variantDimensions[step.dimName] === step.dimValue);
    }
    return items;
  }, [soldItems, drillPath]);

  // Current dimension to display (next after drill path)
  const currentDimIndex = drillPath.length;
  const currentDim = activeDimensions[currentDimIndex];

  // Group filtered items by current dimension value
  const chartData = useMemo(() => {
    if (!currentDim) return [];
    const map = {};
    for (const item of filteredItems) {
      const val = item.variantDimensions[currentDim.name] || 'לא ידוע';
      if (!map[val]) map[val] = { name: val, revenue: 0, quantity: 0 };
      map[val].revenue += (item.sell_price || 0) * (item.quantity || 0);
      map[val].quantity += item.quantity || 0;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems, currentDim]);

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const isLoading = loadingSales;

  const handleDrillDown = (dimValue) => {
    if (currentDimIndex + 1 >= activeDimensions.length) return; // no next dimension
    setDrillPath(prev => [...prev, { dimName: currentDim.name, dimValue }]);
  };

  const handleBreadcrumb = (index) => {
    setDrillPath(prev => prev.slice(0, index));
  };

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
                onClick={() => handleBreadcrumb(idx + 1)}
                className={`text-sm font-medium ${idx === drillPath.length - 1 ? 'text-gray-800' : 'text-blue-600 hover:underline'}`}
              >
                {step.dimName}: {step.dimValue}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : !currentDim ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            {activeDimensions.length === 0
              ? 'אין ממדי וריאציות מוגדרים לקטגוריה זו'
              : 'אין עוד ממדים לפרט — הגעת לרמה האחרונה'
            }
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                פילוח לפי: <span className="text-amber-600">{currentDim.name}</span>
                {drillPath.length > 0 && (
                  <span className="text-sm text-gray-400 font-normal mr-2">
                    (מסונן: {drillPath.map(s => `${s.dimName}=${s.dimValue}`).join(', ')})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-center text-gray-400 py-8">אין מכירות להצגה</p>
              ) : (
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
                      onClick={(entry) => handleDrillDown(entry.name)}
                      style={{ cursor: currentDimIndex + 1 < activeDimensions.length ? 'pointer' : 'default' }}
                    >
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₪${value.toLocaleString()}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Breakdown List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">פירוט — {currentDim.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-center text-gray-400 py-8">אין נתונים</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {chartData.map((row, idx) => {
                    const canDrill = currentDimIndex + 1 < activeDimensions.length;
                    return (
                      <button
                        key={row.name}
                        onClick={() => canDrill && handleDrillDown(row.name)}
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
                            {canDrill && (
                              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-amber-600">₪{row.revenue.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">
                              {row.quantity} יח׳ • {totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
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