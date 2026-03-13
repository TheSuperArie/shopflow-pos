import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, DollarSign, Package, Banknote, CreditCard, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';

export default function AdminDashboard() {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-created_date'),
  });

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list('-date'),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants'],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  const filteredSales = sales.filter(s => {
    const d = s.created_date?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  });

  const filteredExpenses = expenses.filter(e => {
    return e.date >= dateFrom && e.date <= dateTo;
  });

  const totalSales = filteredSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalCost = filteredSales.reduce((s, sale) => s + (sale.total_cost || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = totalSales - totalCost - totalExpenses;
  const cashSales = filteredSales.filter(s => s.payment_method === 'מזומן').reduce((s, sale) => s + (sale.total || 0), 0);
  const creditSales = filteredSales.filter(s => s.payment_method === 'אשראי').reduce((s, sale) => s + (sale.total || 0), 0);
  const lowStockVariants = variants.filter(v => (v.stock || 0) <= 3).map(v => {
    const group = groups.find(g => g.id === v.group_id);
    return {
      id: v.id,
      name: group ? `${group.name} - ${v.size} ${v.cut} ${v.collar}` : `מידה ${v.size}`,
      stock: v.stock || 0
    };
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