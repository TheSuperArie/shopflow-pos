import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, DollarSign, Banknote, CreditCard, Loader2 } from 'lucide-react';
import { format, startOfMonth, subDays } from 'date-fns';
import DrillDownAnalytics from '@/components/dashboard/DrillDownAnalytics';

/**
 * BranchDashboard – reusable dashboard scoped to a specific branch + tenant.
 *
 * Props:
 *   branchId     – ID of the branch to scope sales/stock to
 *   tenantEmail  – owner email used to scope products, categories, dimensions, settings
 */
const SESSION_KEY_FROM = 'dashboard_date_from';
const SESSION_KEY_TO = 'dashboard_date_to';

function readSession(key, fallback) {
  try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; }
}

export default function BranchDashboard({ branchId, tenantEmail }) {
  const [dateFrom, setDateFrom] = useState(() => readSession(SESSION_KEY_FROM, format(startOfMonth(new Date()), 'yyyy-MM-dd')));
  const [dateTo, setDateTo] = useState(() => readSession(SESSION_KEY_TO, format(new Date(), 'yyyy-MM-dd')));
  const [includeExpenses, setIncludeExpenses] = useState(true);

  const handleDateFrom = (val) => { setDateFrom(val); try { sessionStorage.setItem(SESSION_KEY_FROM, val); } catch {} };
  const handleDateTo = (val) => { setDateTo(val); try { sessionStorage.setItem(SESSION_KEY_TO, val); } catch {} };

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['branch-dashboard-sales', branchId],
    queryFn: () => base44.entities.Sale.filter({ branch_id: branchId }, '-created_date', 2000),
    enabled: !!branchId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['branch-dashboard-expenses', tenantEmail],
    queryFn: () => base44.entities.Expense.filter({ created_by: tenantEmail }, '-date'),
    enabled: !!tenantEmail,
    staleTime: 0,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }, 'name', 2000),
    enabled: !!tenantEmail,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants', tenantEmail],
    queryFn: () => base44.entities.ProductVariant.filter({ created_by: tenantEmail }, 'id', 5000),
    enabled: !!tenantEmail,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', tenantEmail],
    queryFn: () => base44.entities.Category.filter({ created_by: tenantEmail }, 'sort_order', 500),
    enabled: !!tenantEmail,
  });

  const { data: dimensions = [] } = useQuery({
    queryKey: ['insights-dimensions', tenantEmail],
    queryFn: () => base44.entities.VariantDimension.filter({ created_by: tenantEmail }, 'name', 500),
    enabled: !!tenantEmail,
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['app-settings', tenantEmail],
    queryFn: () => base44.entities.AppSettings.filter({ created_by: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const defaultDimension = appSettings[0]?.dashboard_default_dimension || '__auto__';
  const lowStockThreshold = appSettings[0]?.low_stock_threshold ?? 5;

  // Convert a UTC ISO timestamp to local Israel date string (YYYY-MM-DD)
  const toLocalDate = (isoString) => {
    if (!isoString) return null;
    const safe = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(safe).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // en-CA gives YYYY-MM-DD
  };

  // Date filter — compare in Israel local time to avoid UTC midnight cutoff issues
  const filteredSales = sales.filter(s => {
    const d = toLocalDate(s.created_date);
    return d && d >= dateFrom && d <= dateTo;
  });

  const filteredExpenses = expenses.filter(e => e.date >= dateFrom && e.date <= dateTo);

  // Summary stats — null-safe
  const totalSales = filteredSales.reduce((s, sale) => s + (Number(sale.total) || 0), 0);
  const totalCost = filteredSales.reduce((s, sale) => s + (Number(sale.total_cost) || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const grossProfit = totalSales - totalCost;
  const netProfit = includeExpenses ? grossProfit - totalExpenses : grossProfit;
  const cashSales = filteredSales.filter(s => s.payment_method === 'מזומן').reduce((s, sale) => s + (Number(sale.total) || 0), 0);
  const creditSales = filteredSales.filter(s => s.payment_method === 'אשראי').reduce((s, sale) => s + (Number(sale.total) || 0), 0);

  const lowStockVariants = variants.filter(v => (v.stock || 0) < lowStockThreshold).map(v => {
    const group = groups.find(g => g.id === v.group_id);
    const dimText = v.dimensions && Object.keys(v.dimensions).length > 0
      ? Object.entries(v.dimensions).map(([k, val]) => `${k}: ${val}`).join(', ')
      : 'רגיל';
    return { id: v.id, name: group ? `${group.name} - ${dimText}` : dimText, stock: v.stock || 0 };
  });

  const isLoading = loadingSales || loadingExpenses;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Date range filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-gray-800">לוח בקרה</h2>
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => handleDateFrom(e.target.value)} className="w-40" />
          <span className="text-gray-400">עד</span>
          <Input type="date" value={dateTo} onChange={e => handleDateTo(e.target.value)} className="w-40" />
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
              title={includeExpenses ? 'רווח נקי (כולל הוצאות)' : 'רווח גולמי'}
              value={`₪${netProfit.toFixed(0)}`}
              icon={TrendingUp}
              color={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
              bg={netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}
            />
          </div>

          {/* Expense toggle */}
          <div className="flex items-center gap-2 justify-end">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 select-none">
              <input
                type="checkbox"
                checked={includeExpenses}
                onChange={e => setIncludeExpenses(e.target.checked)}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
              כלול הוצאות ברווח
            </label>
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

          {/* Drill-Down Analytics */}
          <DrillDownAnalytics
            sales={filteredSales}
            categories={categories}
            groups={groups}
            variants={variants}
            dimensions={dimensions}
            defaultDimension={defaultDimension}
          />
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