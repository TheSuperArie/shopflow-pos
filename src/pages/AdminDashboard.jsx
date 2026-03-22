import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, DollarSign, Banknote, CreditCard, Loader2, ChevronDown } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCategorySalesAnalytics } from '@/hooks/useCategorySalesAnalytics';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function AdminDashboard() {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expandedParent, setExpandedParent] = useState(null);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  // Real-time sync
  useEffect(() => {
    const unsub1 = base44.entities.Sale.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] });
    });
    const unsub2 = base44.entities.Expense.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
    });
    const unsub3 = base44.entities.ProductVariant.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [queryClient]);

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['dashboard-sales', user?.email],
    queryFn: () => user ? base44.entities.Sale.filter({ created_by: user.email }, '-created_date', 2000) : [],
    staleTime: 0,
    enabled: !!user,
  });

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['dashboard-expenses', user?.email],
    queryFn: () => user ? base44.entities.Expense.filter({ created_by: user.email }, '-date', 2000) : [],
    staleTime: 0,
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

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', user?.email],
    queryFn: () => user ? base44.entities.Category.filter({ created_by: user.email }) : [],
    enabled: !!user,
  });

  // Date filter
  const filteredSales = sales.filter(s => {
    const d = s.created_date?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  });

  const filteredExpenses = expenses.filter(e => e.date >= dateFrom && e.date <= dateTo);

  // Summary stats
  const totalSales = filteredSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalCost = filteredSales.reduce((s, sale) => s + (sale.total_cost || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = totalSales - totalCost - totalExpenses;
  const cashSales = filteredSales.filter(s => s.payment_method === 'מזומן').reduce((s, sale) => s + (sale.total || 0), 0);
  const creditSales = filteredSales.filter(s => s.payment_method === 'אשראי').reduce((s, sale) => s + (sale.total || 0), 0);

  const lowStockVariants = variants.filter(v => (v.stock || 0) <= 3).map(v => {
    const group = groups.find(g => g.id === v.group_id);
    const dimText = v.dimensions && Object.keys(v.dimensions).length > 0
      ? Object.entries(v.dimensions).map(([k, val]) => `${k}: ${val}`).join(', ')
      : 'רגיל';
    return { id: v.id, name: group ? `${group.name} - ${dimText}` : dimText, stock: v.stock || 0 };
  });

  // Shared analytics
  const { parentCategoryData, flatCategoryData } = useCategorySalesAnalytics({
    sales: filteredSales,
    categories,
    groups,
    variants,
  });

  const isLoading = loadingSales || loadingExpenses;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">לוח בקרה</h1>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          <span className="text-gray-400">עד</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="מכירות" value={`₪${totalSales.toFixed(0)}`} icon={DollarSign} color="text-green-600" bg="bg-green-50" />
            <StatCard title="עלות סחורה" value={`₪${totalCost.toFixed(0)}`} icon={TrendingDown} color="text-red-500" bg="bg-red-50" />
            <StatCard title="הוצאות" value={`₪${totalExpenses.toFixed(0)}`} icon={TrendingDown} color="text-orange-500" bg="bg-orange-50" />
            <StatCard
              title="רווח נקי"
              value={`₪${netProfit.toFixed(0)}`}
              icon={TrendingUp}
              color={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
              bg={netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-600">פילוח תשלומים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-green-600" />
                    <span className="font-medium">מזומן</span>
                  </div>
                  <span className="font-bold text-green-700">₪{cashSales.toFixed(0)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">אשראי</span>
                  </div>
                  <span className="font-bold text-blue-700">₪{creditSales.toFixed(0)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Low stock */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-600">מלאי נמוך</CardTitle>
              </CardHeader>
              <CardContent>
                {lowStockVariants.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">כל המוצרים במלאי תקין</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {lowStockVariants.map(v => (
                      <div key={v.id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                        <span className="text-sm font-medium">{v.name}</span>
                        <span className="text-sm font-bold text-red-600">מלאי: {v.stock}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category Sales Analytics */}
          {parentCategoryData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-600">מכירות לפי קטגוריה</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={flatCategoryData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="revenue"
                        labelLine={false}
                        label={({ name, percent }) => percent > 0.07 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                      >
                        {flatCategoryData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `₪${v.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Hierarchical breakdown list */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-600">פירוט לפי קטגוריה</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                  {parentCategoryData.map((cat, idx) => (
                    <div key={cat.id} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedParent(expandedParent === cat.id ? null : cat.id)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="font-semibold text-sm">{cat.name}</span>
                          {cat.subCategories.length > 0 && (
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedParent === cat.id ? 'rotate-180' : ''}`} />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-amber-600">₪{cat.revenue.toLocaleString()}</p>
                          <p className="text-xs text-gray-400">{cat.quantity} יח׳</p>
                        </div>
                      </button>
                      {expandedParent === cat.id && cat.subCategories.length > 0 && (
                        <div className="bg-white divide-y divide-gray-50">
                          {cat.subCategories.map(sub => (
                            <div key={sub.id} className="flex items-center justify-between px-4 py-2">
                              <span className="text-sm text-gray-600 pr-3">↳ {sub.name}</span>
                              <div className="text-left">
                                <p className="text-sm font-semibold text-amber-500">₪{sub.revenue.toLocaleString()}</p>
                                <p className="text-xs text-gray-400">{sub.quantity} יח׳</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500 font-medium">{title}</span>
          <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}