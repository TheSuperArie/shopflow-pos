import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { TrendingUp, Store, Package, ShoppingBag } from 'lucide-react';

const COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#f97316', '#06b6d4', '#84cc16', '#e879f9', '#fb7185',
  '#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#4ade80'
];

export default function NetworkAdminDashboard({ tenantEmail }) {
  // Fetch branches
  const { data: branches = [] } = useQuery({
    queryKey: ['branches-dashboard', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
  });

  // Fetch all sales (with branch context)
  const { data: allSales = [], isLoading: salesLoading } = useQuery({
    queryKey: ['all-sales-dashboard', tenantEmail],
    queryFn: () => base44.entities.Sale.list('-created_date', 1000),
  });

  // Fetch all tickets (orders)
  const { data: allTickets = [] } = useQuery({
    queryKey: ['all-tickets-dashboard', tenantEmail],
    queryFn: () => base44.entities.OrderTicket.filter({ tenant_email: tenantEmail }),
  });

  // Fetch product groups for category names
  const { data: productGroups = [] } = useQuery({
    queryKey: ['product-groups-dashboard'],
    queryFn: () => base44.entities.ProductGroup.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-dashboard'],
    queryFn: () => base44.entities.Category.list(),
  });

  // ── 1. Orders by month (last 12 months)
  const ordersByMonth = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const count = allTickets.filter(t => {
        const created = new Date(t.created_date);
        return created >= start && created <= end;
      }).length;
      months.push({ month: format(d, 'MM/yy'), count });
    }
    return months;
  }, [allTickets]);

  // ── 2. Most active branches (by number of sales)
  const branchActivity = useMemo(() => {
    const branchMap = {};
    allSales.forEach(sale => {
      if (!sale.branch_id) return;
      if (!branchMap[sale.branch_id]) branchMap[sale.branch_id] = { sales: 0, revenue: 0 };
      branchMap[sale.branch_id].sales += 1;
      branchMap[sale.branch_id].revenue += (sale.total || 0);
    });
    return branches
      .map(b => ({
        name: b.name,
        sales: branchMap[b.id]?.sales || 0,
        revenue: branchMap[b.id]?.revenue || 0,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 8);
  }, [allSales, branches]);

  // ── 3. Sales by product group + category
  const productPieData = useMemo(() => {
    const groupMap = {};
    allSales.forEach(sale => {
      (sale.items || []).forEach(item => {
        const gid = item.group_id || item.product_id;
        if (!gid) return;
        if (!groupMap[gid]) groupMap[gid] = { qty: 0, revenue: 0 };
        groupMap[gid].qty += (item.quantity || 1);
        groupMap[gid].revenue += (item.sell_price || 0) * (item.quantity || 1);
      });
    });

    return Object.entries(groupMap)
      .map(([gid, data]) => {
        const group = productGroups.find(g => g.id === gid);
        return { name: group?.name || 'אחר', value: data.revenue, qty: data.qty };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [allSales, productGroups]);

  const categoryPieData = useMemo(() => {
    const catMap = {};
    allSales.forEach(sale => {
      (sale.items || []).forEach(item => {
        const group = productGroups.find(g => g.id === item.group_id || g.id === item.product_id);
        const catId = group?.category_id || 'unknown';
        const cat = categories.find(c => c.id === catId);
        const catName = cat?.name || 'אחר';
        if (!catMap[catName]) catMap[catName] = 0;
        catMap[catName] += (item.sell_price || 0) * (item.quantity || 1);
      });
    });
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allSales, productGroups, categories]);

  // ── KPI totals
  const totalRevenue = allSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalOrders = allTickets.length;
  const activeBranches = branches.filter(b => b.is_active).length;
  const totalItems = allSales.reduce((s, sale) => s + (sale.items?.length || 0), 0);

  const fmt = (n) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

  const CustomTooltipRevenue = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow text-sm" dir="rtl">
        <p className="font-semibold">{payload[0].payload.name || payload[0].payload.month}</p>
        <p className="text-amber-600">{fmt(payload[0].value)}</p>
      </div>
    );
  };

  const renderLabel = ({ name, percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : '';

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">דאשבורד מנהל</h1>
        <p className="text-sm text-gray-500 mt-1">סקירה כללית של פעילות הרשת</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'סה"כ הכנסות', value: fmt(totalRevenue), icon: TrendingUp, color: 'text-amber-500' },
          { label: 'הזמנות מסניפים', value: totalOrders, icon: ShoppingBag, color: 'text-blue-500' },
          { label: 'סניפים פעילים', value: activeBranches, icon: Store, color: 'text-green-500' },
          { label: 'פריטים שנמכרו', value: totalItems.toLocaleString(), icon: Package, color: 'text-purple-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold text-gray-800">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Orders by Month */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-gray-700">היקפי הזמנות לפי חודשים (12 חודשים אחרונים)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ordersByMonth} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [v, 'הזמנות']} />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="הזמנות" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Most Active Branches */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-gray-700">סניפים פעילים ביותר</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {branchActivity.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">אין נתוני מכירות לפי סניפים</p>
          ) : (
            <div className="divide-y">
              {branchActivity.map((b, i) => {
                const maxSales = branchActivity[0]?.sales || 1;
                return (
                  <div key={b.name} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm font-bold text-gray-400 w-5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{b.name}</p>
                      <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${(b.sales / maxSales) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-700">{b.sales} מכירות</p>
                      <p className="text-xs text-gray-400">{fmt(b.revenue)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-700">הכנסות לפי קטגוריה</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryPieData.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">אין נתונים</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderLabel}
                    labelLine={false}
                  >
                    {categoryPieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend iconType="circle" iconSize={10} formatter={(v) => <span className="text-xs text-gray-700">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* By Product Group */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-700">הכנסות לפי מוצר (Top 12)</CardTitle>
          </CardHeader>
          <CardContent>
            {productPieData.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">אין נתונים</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={productPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderLabel}
                    labelLine={false}
                  >
                    {productPieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n, p) => [fmt(v), p.payload.name]} />
                  <Legend iconType="circle" iconSize={10} formatter={(v) => <span className="text-xs text-gray-700">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}