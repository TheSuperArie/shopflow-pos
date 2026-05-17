import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, TrendingUp, ShoppingBag, Wallet, Package, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import CatalogVisibility from '../CatalogVisibility';
import BranchInventory from '../BranchInventory';
import { format, startOfDay, subDays } from 'date-fns';

export default function BranchCommandCenter({ branch, tenantEmail, onBack }) {
  const [dateRange, setDateRange] = useState('week');

  const { data: sales = [] } = useQuery({
    queryKey: ['branch-sales', branch.id],
    queryFn: () => base44.entities.Sale.filter({ branch_id: branch.id }),
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['branch-expenses', branch.id],
    queryFn: () => base44.entities.Expense.filter({ created_by: branch.station_email }),
  });

  const { data: branchStocks = [] } = useQuery({
    queryKey: ['branchStocks', branch.id],
    queryFn: () => base44.entities.BranchVariantStock.filter({ branch_id: branch.id }),
  });

  const { data: allVariants = [] } = useQuery({
    queryKey: ['flexibleVariants', tenantEmail],
    queryFn: () => base44.entities.FlexibleVariant.filter({ created_by: tenantEmail }),
  });

  const { filteredSales, filteredExpenses, chartData } = useMemo(() => {
    const now = new Date();
    let cutoff;
    if (dateRange === 'today') cutoff = startOfDay(now);
    else if (dateRange === 'week') cutoff = subDays(now, 7);
    else if (dateRange === 'month') cutoff = subDays(now, 30);
    else cutoff = new Date(0);

    const fs = sales.filter(s => new Date(s.created_date) >= cutoff);
    const fe = expenses.filter(e => new Date(e.date) >= cutoff);

    // Build daily chart data for the last 7 days (or today)
    const days = dateRange === 'today' ? 1 : dateRange === 'week' ? 7 : 30;
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(now, i), 'dd/MM');
      buckets[d] = { date: d, מכירות: 0, הוצאות: 0 };
    }
    fs.forEach(s => {
      const d = format(new Date(s.created_date), 'dd/MM');
      if (buckets[d]) buckets[d].מכירות += s.total || 0;
    });
    fe.forEach(e => {
      const d = format(new Date(e.date), 'dd/MM');
      if (buckets[d]) buckets[d].הוצאות += e.amount || 0;
    });

    return { filteredSales: fs, filteredExpenses: fe, chartData: Object.values(buckets) };
  }, [sales, expenses, dateRange]);

  const totalRevenue = filteredSales.reduce((s, x) => s + (x.total || 0), 0);
  const totalCost = filteredSales.reduce((s, x) => s + (x.total_cost || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, x) => s + (x.amount || 0), 0);
  const netProfit = totalRevenue - totalCost - totalExpenses;

  const LOW_STOCK = 5;
  const lowStockCount = branchStocks.filter(s => s.stock <= LOW_STOCK && s.stock >= 0).length;

  const DATE_BTNS = [
    { key: 'today', label: 'היום' },
    { key: 'week', label: '7 ימים' },
    { key: 'month', label: '30 ימים' },
    { key: 'all', label: 'הכל' },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{branch.name}</h1>
          <p className="text-sm text-gray-500">{branch.station_email}</p>
        </div>
        <Badge variant={branch.is_active ? 'default' : 'secondary'}>
          {branch.is_active ? 'פעיל' : 'לא פעיל'}
        </Badge>
      </div>

      <Tabs defaultValue="dashboard" dir="rtl">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="dashboard">לוח בקרה</TabsTrigger>
          <TabsTrigger value="catalog">נראות קטלוג</TabsTrigger>
          <TabsTrigger value="inventory">מלאי</TabsTrigger>
        </TabsList>

        {/* ── DASHBOARD TAB ── */}
        <TabsContent value="dashboard" className="mt-4 space-y-5">
          {/* Date filter */}
          <div className="flex gap-2 flex-wrap">
            {DATE_BTNS.map(b => (
              <button
                key={b.key}
                onClick={() => setDateRange(b.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  dateRange === b.key
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingBag className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-gray-500">מכירות</span>
                </div>
                <p className="text-xl font-bold text-gray-900">₪{totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-gray-400">{filteredSales.length} עסקאות</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-gray-500">הוצאות</span>
                </div>
                <p className="text-xl font-bold text-gray-900">₪{totalExpenses.toLocaleString()}</p>
                <p className="text-xs text-gray-400">{filteredExpenses.length} פריטים</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-gray-500">רווח נקי</span>
                </div>
                <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₪{netProfit.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <span className="text-xs text-gray-500">מלאי נמוך</span>
                </div>
                <p className="text-xl font-bold text-orange-600">{lowStockCount}</p>
                <p className="text-xs text-gray-400">וריאנטים</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">מכירות vs הוצאות</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => `₪${v.toLocaleString()}`} />
                  <Bar dataKey="מכירות" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="הוצאות" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent sales */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">מכירות אחרונות</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredSales.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">אין מכירות בתקופה זו</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {[...filteredSales].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 15).map(sale => (
                    <div key={sale.id} className="flex justify-between items-center py-1.5 border-b last:border-0 text-sm">
                      <span className="text-gray-500">{format(new Date(sale.created_date), 'dd/MM HH:mm')}</span>
                      <span className="text-gray-700">{sale.seller_name || '—'}</span>
                      <span className="font-semibold text-gray-900">₪{(sale.total || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CATALOG TAB ── */}
        <TabsContent value="catalog" className="mt-4">
          <CatalogVisibility branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>

        {/* ── INVENTORY TAB ── */}
        <TabsContent value="inventory" className="mt-4">
          <BranchInventory branch={branch} tenantEmail={tenantEmail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}