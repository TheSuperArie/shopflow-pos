import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Banknote, CreditCard, Clock, TrendingUp, TrendingDown, DollarSign, Package, Trash2, Calendar, FileText, AlertTriangle, Receipt } from 'lucide-react';
import ReceiptModal from '@/components/pos/ReceiptModal';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import moment from 'moment';

export default function AdminSales() {
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-created_date'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list(),
  });

  const filteredSales = sales.filter(s => {
    const d = s.created_date?.split('T')[0];
    return d >= dateFrom && d <= dateTo;
  });

  const filteredExpenses = expenses.filter(e => {
    const d = e.date;
    return d >= dateFrom && d <= dateTo;
  });

  // Calculate totals
  const totalRevenue = filteredSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalCost = filteredSales.reduce((s, sale) => s + (sale.total_cost || 0), 0);
  const totalExpenses = filteredExpenses.reduce((s, exp) => s + (exp.amount || 0), 0);
  const totalProfit = totalRevenue - totalCost - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

  // Payment method breakdown
  const cashSales = filteredSales.filter(s => s.payment_method === 'מזומן');
  const creditSales = filteredSales.filter(s => s.payment_method === 'אשראי');
  const cashTotal = cashSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const creditTotal = creditSales.reduce((s, sale) => s + (sale.total || 0), 0);

  const paymentData = [
    { name: 'מזומן', value: cashTotal, count: cashSales.length },
    { name: 'אשראי', value: creditTotal, count: creditSales.length },
  ].filter(d => d.value > 0);

  // Category breakdown
  const categoryStats = {};
  filteredSales.forEach(sale => {
    sale.items?.forEach(item => {
      const group = groups.find(g => g.id === item.product_id || g.name === item.product_name);
      const categoryId = group?.category_id;
      const category = categories.find(c => c.id === categoryId);
      const categoryName = category?.name || 'אחר';
      
      if (!categoryStats[categoryName]) {
        categoryStats[categoryName] = { revenue: 0, cost: 0, quantity: 0 };
      }
      categoryStats[categoryName].revenue += item.sell_price * item.quantity;
      categoryStats[categoryName].cost += (item.cost_price || 0) * item.quantity;
      categoryStats[categoryName].quantity += item.quantity;
    });
  });

  const categoryData = Object.entries(categoryStats).map(([name, stats]) => ({
    name,
    revenue: stats.revenue,
    cost: stats.cost,
    profit: stats.revenue - stats.cost,
    quantity: stats.quantity,
  })).sort((a, b) => b.revenue - a.revenue);

  const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const deleteSaleMutation = useMutation({
    mutationFn: (saleId) => base44.entities.Sale.delete(saleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({
        title: 'המכירה נמחקה בהצלחה',
        duration: 3000,
      });
    },
  });

  const handleDeleteSale = (saleId) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק מכירה זו?')) {
      deleteSaleMutation.mutate(saleId);
    }
  };

  // Daily Report Data
  const daySales = sales.filter(sale =>
    sale.created_date?.split('T')[0] === selectedDate
  );

  const hourlyData = Array.from({ length: 24 }, (_, hour) => {
    const hourSales = daySales.filter(sale => {
      const d = new Date(sale.created_date);
      return d.getHours() === hour;
    });
    const revenue = hourSales.reduce((sum, sale) => sum + sale.total, 0);
    const count = hourSales.length;
    
    return {
      hour: `${hour}:00`,
      revenue,
      count,
      displayHour: hour
    };
  }).filter(h => h.count > 0 || h.revenue > 0);

  const productSales = {};
  daySales.forEach(sale => {
    sale.items?.forEach(item => {
      const key = item.product_id || item.product_name;
      if (!productSales[key]) {
        productSales[key] = {
          name: item.product_name,
          quantity: 0,
          revenue: 0
        };
      }
      productSales[key].quantity += item.quantity;
      productSales[key].revenue += item.sell_price * item.quantity;
    });
  });

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const dailyTotalRevenue = daySales.reduce((sum, sale) => sum + sale.total, 0);
  const dailyTotalTransactions = daySales.length;
  const dailyAvgTransaction = dailyTotalTransactions > 0 ? dailyTotalRevenue / dailyTotalTransactions : 0;

  const peakHour = [...hourlyData].sort((a, b) => b.revenue - a.revenue)[0];
  const busiestHour = [...hourlyData].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">היסטוריית מכירות</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/AdminLowStock">
            <Button variant="outline" className="gap-2 border-orange-300 text-orange-600 hover:bg-orange-50">
              <AlertTriangle className="w-4 h-4" />
              מלאי חסר
            </Button>
          </Link>
          <Button
            variant={showDailyReport ? "default" : "outline"}
            onClick={() => setShowDailyReport(!showDailyReport)}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {showDailyReport ? 'חזור להיסטוריה' : 'דו"ח יומי'}
          </Button>
          {!showDailyReport && (
            <>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
              <span className="text-gray-400">עד</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
            </>
          )}
          {showDailyReport && (
            <>
              <span className="text-gray-600">תאריך:</span>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-40" />
            </>
          )}
        </div>
      </div>

      {showDailyReport ? (
        /* Daily Report View */
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> סה"כ הכנסות
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">₪{dailyTotalRevenue.toLocaleString()}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> עסקאות
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{dailyTotalTransactions}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Package className="w-4 h-4" /> ממוצע עסקה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">₪{dailyAvgTransaction.toFixed(0)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> שעת שיא
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{peakHour?.hour || '-'}</p>
                <p className="text-xs text-gray-500">₪{peakHour?.revenue || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Hourly Sales Chart */}
          <Card>
            <CardHeader>
              <CardTitle>מכירות לפי שעה</CardTitle>
            </CardHeader>
            <CardContent>
              {hourlyData.length === 0 ? (
                <p className="text-center text-gray-400 py-8">אין נתונים ליום זה</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'revenue' ? `₪${value}` : value,
                        name === 'revenue' ? 'הכנסות' : 'עסקאות'
                      ]}
                    />
                    <Bar dataKey="revenue" fill="#f59e0b" name="הכנסות" />
                    <Bar dataKey="count" fill="#3b82f6" name="עסקאות" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Peak Hours Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>ניתוח שעות עומס</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {peakHour && (
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="font-semibold text-amber-800">שעת שיא בהכנסות: {peakHour.hour}</p>
                    <p className="text-sm text-amber-600">
                      ₪{peakHour.revenue.toLocaleString()} | {peakHour.count} עסקאות
                    </p>
                  </div>
                )}
                {busiestHour && busiestHour.hour !== peakHour?.hour && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-semibold text-blue-800">שעה עמוסה ביותר: {busiestHour.hour}</p>
                    <p className="text-sm text-blue-600">
                      {busiestHour.count} עסקאות | ₪{busiestHour.revenue.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle>מוצרים נמכרים ביותר</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <p className="text-center text-gray-400 py-8">אין נתונים</p>
              ) : (
                <div className="space-y-2">
                  {topProducts.map((product, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="font-semibold">{product.name}</p>
                          <p className="text-sm text-gray-500">{product.quantity} יחידות</p>
                        </div>
                      </div>
                      <p className="font-bold text-amber-600">₪{product.revenue.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        /* History View */
        <>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> סה"כ הכנסות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">₪{totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{filteredSales.length} עסקאות</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Package className="w-4 h-4" /> עלויות והוצאות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-600">₪{(totalCost + totalExpenses).toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">עלויות: ₪{totalCost.toLocaleString()} | הוצאות: ₪{totalExpenses.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              {totalProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              רווח נקי
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₪{totalProfit.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">שולי רווח: {profitMargin.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Banknote className="w-4 h-4" /> ממוצע עסקה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              ₪{filteredSales.length > 0 ? (totalRevenue / filteredSales.length).toFixed(0) : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>חלוקה לפי אמצעי תשלום</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentData.length === 0 ? (
              <p className="text-center text-gray-400 py-8">אין נתונים</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ₪${value.toLocaleString()} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.name === 'מזומן' ? '#10b981' : '#3b82f6'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₪${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-700 font-medium">מזומן</p>
                <p className="text-xl font-bold text-green-800">₪{cashTotal.toLocaleString()}</p>
                <p className="text-xs text-green-600">{cashSales.length} עסקאות</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-700 font-medium">אשראי</p>
                <p className="text-xl font-bold text-blue-800">₪{creditTotal.toLocaleString()}</p>
                <p className="text-xs text-blue-600">{creditSales.length} עסקאות</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>חלוקה לפי קטגוריות</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-center text-gray-400 py-8">אין נתונים</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="revenue"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `₪${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Revenue & Profit Table */}
      <Card>
        <CardHeader>
          <CardTitle>ניתוח רווחיות לפי קטגוריה</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <p className="text-center text-gray-400 py-8">אין נתונים</p>
          ) : (
            <div className="space-y-3">
              {categoryData.map((cat, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                      <span className="font-semibold">{cat.name}</span>
                    </div>
                    <span className="text-sm text-gray-500">{cat.quantity} יחידות</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">הכנסות</p>
                      <p className="font-bold text-amber-600">₪{cat.revenue.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">עלויות</p>
                      <p className="font-bold text-gray-600">₪{cat.cost.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">רווח</p>
                      <p className={`font-bold ${cat.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ₪{cat.profit.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-green-500 h-full"
                      style={{ width: `${cat.revenue > 0 ? (cat.profit / cat.revenue) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    שולי רווח: {cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Combined Sales and Expenses History */}
      <Card>
        <CardHeader>
          <CardTitle>רשימת עסקאות והוצאות</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {/* Sales */}
              {filteredSales.map(sale => (
                <Card key={`sale-${sale.id}`} className="border-l-4 border-l-green-400">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">מכירה</div>
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500">
                          {sale.created_date ? format(new Date(sale.created_date), 'dd/MM/yyyy HH:mm') : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={sale.payment_method === 'מזומן' ? 'text-green-600 border-green-200 bg-green-50' : 'text-blue-600 border-blue-200 bg-blue-50'}>
                          {sale.payment_method === 'מזומן' ? <Banknote className="w-3 h-3 ml-1" /> : <CreditCard className="w-3 h-3 ml-1" />}
                          {sale.payment_method}
                        </Badge>
                        <span className="font-bold text-lg text-green-600">+₪{sale.total?.toFixed(0)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedSaleForReceipt(sale)}
                          className="h-8 w-8 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                          title="הצג קבלה"
                        >
                          <Receipt className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSale(sale.id)}
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {sale.items?.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm text-gray-600 py-1 border-b border-gray-50 last:border-0">
                          <div>
                            <span className="font-medium">{item.product_name}</span>
                            {item.shirt_size && (
                              <span className="text-xs text-gray-400 mr-2">
                                ({item.shirt_size}, {item.shirt_collar}, {item.shirt_cut})
                              </span>
                            )}
                          </div>
                          <span>x{item.quantity} — ₪{(item.sell_price * item.quantity).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                    {sale.total_cost > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">עלות:</span>
                          <span className="font-semibold text-gray-700">₪{sale.total_cost.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">רווח גולמי:</span>
                          <span className={`font-semibold ${(sale.total - sale.total_cost) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₪{(sale.total - sale.total_cost).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Expenses */}
              {filteredExpenses.map(expense => (
                <Card key={`expense-${expense.id}`} className="border-l-4 border-l-red-400">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">הוצאה</div>
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-500">
                          {expense.date ? format(new Date(expense.date), 'dd/MM/yyyy') : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-gray-600 border-gray-300">
                          {expense.category === 'אחר' && expense.custom_category ? expense.custom_category : expense.category}
                        </Badge>
                        <span className="font-bold text-lg text-red-600">-₪{expense.amount?.toFixed(0)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 mt-2">{expense.description}</p>
                  </CardContent>
                </Card>
              ))}

              {filteredSales.length === 0 && filteredExpenses.length === 0 && (
                <p className="text-center text-gray-400 py-12">אין נתונים בטווח התאריכים</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}

      <ReceiptModal
        open={!!selectedSaleForReceipt}
        sale={selectedSaleForReceipt}
        onClose={() => setSelectedSaleForReceipt(null)}
      />
    </div>
  );
}