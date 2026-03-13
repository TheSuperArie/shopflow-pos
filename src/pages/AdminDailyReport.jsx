import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Calendar, TrendingUp, Clock, Package } from 'lucide-react';
import moment from 'moment';

export default function AdminDailyReport() {
  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-created_date'),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  // Filter sales for selected date
  const daySales = sales.filter(sale => 
    moment(sale.created_date).format('YYYY-MM-DD') === selectedDate
  );

  // Group sales by hour
  const hourlyData = Array.from({ length: 24 }, (_, hour) => {
    const hourSales = daySales.filter(sale => 
      moment(sale.created_date).hour() === hour
    );
    const revenue = hourSales.reduce((sum, sale) => sum + sale.total, 0);
    const count = hourSales.length;
    
    return {
      hour: `${hour}:00`,
      revenue,
      count,
      displayHour: hour
    };
  }).filter(h => h.count > 0 || h.revenue > 0);

  // Calculate top products
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

  // Daily summary
  const totalRevenue = daySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalTransactions = daySales.length;
  const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Peak hours
  const peakHour = hourlyData.sort((a, b) => b.revenue - a.revenue)[0];
  const busiestHour = hourlyData.sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">דו"ח יומי</h1>
        <div className="flex items-center gap-2">
          <Label>תאריך:</Label>
          <Input 
            type="date" 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> סה"כ הכנסות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₪{totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> עסקאות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalTransactions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Package className="w-4 h-4" /> ממוצע עסקה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₪{avgTransaction.toFixed(0)}</p>
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
    </div>
  );
}