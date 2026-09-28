import React, { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchAllPages, createdDateBetween } from '@/lib/fetchAllPages';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { parseServerDate } from '@/lib/serverDate';
import { fetchNetworkSales, fetchNetworkExpenses } from '@/lib/networkScope';
import { TrendingUp, TrendingDown, Store, Package, ShoppingBag } from 'lucide-react';
import NetworkDateRangeFilter, { DATE_PRESETS } from './NetworkDateRangeFilter';
import { isNetworkLevelOf } from '@/lib/branchScope';
import { splitByBusinessModel, isOwnStock } from '@/lib/businessModelSplit';
import NetworkSalaryBanner from '@/components/withdrawals/NetworkSalaryBanner';
import ProfitSplitBanners from './ProfitSplitBanners';
import NetworkSideExpensesView from './NetworkSideExpensesView';

const COLORS = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#f97316', '#06b6d4', '#84cc16', '#e879f9', '#fb7185',
  '#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#4ade80'
];

const toLocalHour = (iso) => {
  if (!iso) return null;
  const safe = typeof iso === 'string' && iso.length > 10 && !iso.endsWith('Z') ? `${iso}Z` : iso;
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date(safe)));
    return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
  } catch { return null; }
};

const pad2 = (n) => String(n).padStart(2, '0');

const toLocalDate = (iso) => {
  if (!iso) return null;
  const safe = typeof iso === 'string' && iso.length > 10 && !iso.endsWith('Z') ? `${iso}Z` : iso;
  try { return new Date(safe).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); } catch { return null; }
};

export default function NetworkAdminDashboard({ tenantEmail }) {
  // Date range — defaults to the current month
  const [range, setRange] = useState(() => ({ ...DATE_PRESETS[2].range(), preset: 'month' }));
  const [expenseSide, setExpenseSide] = useState(null); // 'importer' | 'private' | null
  const [withdrawn, setWithdrawn] = useState(0); // owner withdrawals in range, reported by the salary banner
  const inRange = (iso) => {
    const d = toLocalDate(iso);
    return !!d && d >= range.from && d <= range.to;
  };

  // Fetch branches
  const { data: branches = [], isSuccess: branchesLoaded } = useQuery({
    queryKey: ['branches-dashboard', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
  });

  const branchIdList = useMemo(() => branches.map(b => b.id).sort(), [branches]);
  const stationEmailList = useMemo(() => branches.map(b => b.station_email).filter(Boolean).sort(), [branches]);

  // This network's sales only, filtered on the server: sales stamped with one of the
  // network's branch ids + the master's own sales. Exact range filtering stays below.
  const { data: rawSales = [] } = useQuery({
    queryKey: ['all-sales-dashboard', tenantEmail, branchIdList.join(','), range.from, range.to],
    queryFn: () => fetchNetworkSales({
      branchIds: branchIdList,
      tenantEmail,
      dateQuery: { created_date: createdDateBetween(range.from, range.to) },
    }),
    enabled: !!tenantEmail && branchesLoaded,
    staleTime: 120000,
    placeholderData: keepPreviousData,
  });

  const branchIds = useMemo(() => new Set(branches.map(b => b.id)), [branches]);
  const stationEmails = useMemo(() => new Set(branches.map(b => b.station_email).filter(Boolean)), [branches]);
  const allSales = useMemo(
    () => rawSales.filter(s => (branchIds.has(s.branch_id) || s.seller_email === tenantEmail) && inRange(s.created_date)),
    [rawSales, branchIds, tenantEmail, range.from, range.to]
  );

  // Network expenses in range — branch expenses (incl. legacy ones created by a station
  // account) + the master's own, and network-only expenses the master added for a branch.
  const { data: rawExpenses = [] } = useQuery({
    queryKey: ['all-expenses-dashboard', tenantEmail, branchIdList.join(','), stationEmailList.join(','), range.from, range.to],
    queryFn: () => fetchNetworkExpenses({
      branchIds: branchIdList,
      stationEmails: stationEmailList,
      tenantEmail,
      dateQuery: { date: { $gte: range.from, $lte: range.to } },
    }),
    enabled: !!tenantEmail && branchesLoaded,
    staleTime: 120000,
    placeholderData: keepPreviousData,
  });

  // Branch expenses vs. the network's own expenses (no branch) — each counted exactly once
  const { branchExpenses, networkExpenses } = useMemo(() => {
    const dated = rawExpenses.filter(e => {
      const d = e.date || toLocalDate(e.created_date);
      return !!d && d >= range.from && d <= range.to;
    });
    const sum = (list) => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return {
      branchExpenses: sum(dated.filter(e => e.network_level !== true &&
        (branchIds.has(e.branch_id) || stationEmails.has(e.created_by) || e.created_by === tenantEmail))),
      networkExpenses: sum(dated.filter(isNetworkLevelOf(tenantEmail))),
    };
  }, [rawExpenses, branchIds, stationEmails, tenantEmail, range.from, range.to]);
  const totalExpenses = branchExpenses + networkExpenses;

  // Business-model split: importer vs. private profit (sale-line level)
  const split = useMemo(() => splitByBusinessModel({
    sales: allSales,
    expenses: rawExpenses.filter(e => {
      const d = e.date || toLocalDate(e.created_date);
      return !!d && d >= range.from && d <= range.to;
    }),
    branches,
    tenantEmail,
  }), [allSales, rawExpenses, branches, tenantEmail, range.from, range.to]);

  // Fetch all tickets (orders)
  const { data: allTickets = [] } = useQuery({
    queryKey: ['all-tickets-dashboard', tenantEmail],
    queryFn: () => base44.entities.OrderTicket.filter({ tenant_email: tenantEmail }),
  });

  // Fetch product groups for category names (network scope only)
  const catalogOwners = useMemo(
    () => [tenantEmail, ...branches.map(b => b.station_email).filter(Boolean)].filter(Boolean),
    [tenantEmail, branches]
  );

  const { data: productGroups = [] } = useQuery({
    queryKey: ['product-groups-dashboard', tenantEmail, catalogOwners.length],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: { $in: catalogOwners } }, '-created_date', 5000),
    enabled: catalogOwners.length > 0,
    staleTime: 120000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-dashboard', tenantEmail, catalogOwners.length],
    queryFn: () => base44.entities.Category.filter({ created_by: { $in: catalogOwners } }, 'sort_order', 2000),
    enabled: catalogOwners.length > 0,
    staleTime: 120000,
  });

  // ── 1. Orders by month (last 12 months)
  const ordersByMonth = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const start = startOfMonth(d);
      const end = endOfMonth(d);
      const count = allTickets.filter(t => {
        const created = parseServerDate(t.created_date);
        return !!created && created >= start && created <= end;
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

  // ── 3. Sales by product + category
  // Every branch keeps its own copy of the catalog, so the same product exists under
  // several group ids. Aggregate by product name + category name to merge branches.
  const groupById = useMemo(() => new Map(productGroups.map(g => [g.id, g])), [productGroups]);
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // ── Top 7 selling hours (share of revenue, Israel time)
  const topHours = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, count: 0 }));
    allSales.forEach(sale => {
      const h = toLocalHour(sale.created_date);
      if (h === null) return;
      hours[h].revenue += sale.total || 0;
      hours[h].count += 1;
    });
    const total = hours.reduce((s, h) => s + h.revenue, 0);
    if (total <= 0) return { rows: [], best: null, topShare: 0 };
    // copy before sorting — never sort the source array in place
    const ranked = [...hours]
      .filter(h => h.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 7)
      .map(h => ({ ...h, pct: (h.revenue / total) * 100 }));
    return {
      rows: [...ranked].sort((a, b) => a.hour - b.hour),
      best: ranked[0],
      topShare: ranked.reduce((s, h) => s + h.pct, 0),
    };
  }, [allSales]);

  const categoryPieData = useMemo(() => {
    const catMap = {};
    allSales.forEach(sale => {
      (sale.items || []).forEach(item => {
        const group = groupById.get(item.group_id) || groupById.get(item.product_id);
        const catName = (catById.get(group?.category_id)?.name || 'אחר').trim();
        if (!catMap[catName]) catMap[catName] = 0;
        catMap[catName] += (item.sell_price || 0) * (item.quantity || 1);
      });
    });
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [allSales, groupById, catById]);

  const categoryTotal = categoryPieData.reduce((s, c) => s + c.value, 0);

  // ── KPI totals
  const totalRevenue = allSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalOrders = allTickets.filter(t => inRange(t.created_date)).length;
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

  if (expenseSide) {
    return (
      <NetworkSideExpensesView side={expenseSide} tenantEmail={tenantEmail} branches={branches}
        initialRange={range} onBack={() => setExpenseSide(null)} />
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">דאשבורד מנהל</h1>
        <p className="text-sm text-gray-500 mt-1">סקירה כללית של פעילות הרשת</p>
      </div>

      <NetworkDateRangeFilter from={range.from} to={range.to} preset={range.preset} onChange={setRange} />

      <ProfitSplitBanners split={split} onShowExpenses={setExpenseSide} withdrawn={withdrawn}
        extra={branches.some(isOwnStock) ? <NetworkSalaryBanner branches={branches} from={range.from} to={range.to}
          privateProfit={split.priv} onTotal={setWithdrawn} /> : null} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'סה"כ הוצאות', value: fmt(totalExpenses), icon: TrendingDown, color: 'text-red-500',
            sub: `סניפים ${fmt(branchExpenses)} · רשת ${fmt(networkExpenses)}` },
          { label: 'הזמנות מסניפים', value: totalOrders, icon: ShoppingBag, color: 'text-blue-500' },
          { label: 'סניפים פעילים', value: activeBranches, icon: Store, color: 'text-green-500' },
          { label: 'פריטים שנמכרו', value: totalItems.toLocaleString(), icon: Package, color: 'text-purple-500' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold text-gray-800">{value}</p>
                {sub && <p className="text-[11px] text-gray-400 mt-0.5" data-testid="expense-split">{sub}</p>}
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
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={categoryPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={95}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryPieData.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n, p) => [fmt(v), p.payload.name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[11px] text-gray-400">סה"כ</span>
                    <span className="text-base font-bold text-gray-800">{fmt(categoryTotal)}</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {categoryPieData.map((c, idx) => (
                    <div key={c.name} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="flex-1 min-w-0 truncate text-gray-700">{c.name}</span>
                      <span className="text-xs text-gray-400 shrink-0 w-10 text-left">
                        {categoryTotal > 0 ? ((c.value / categoryTotal) * 100).toFixed(0) : 0}%
                      </span>
                      <span className="font-semibold text-gray-800 shrink-0">{fmt(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Top 7 selling hours */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-700">שעות השיא של הרשת</CardTitle>
            <p className="text-xs text-gray-400">7 השעות עם הכי הרבה הכנסות · אחוז מסך ההכנסות בטווח הנבחר</p>
          </CardHeader>
          <CardContent>
            {topHours.rows.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">אין נתונים</p>
            ) : (() => {
              const maxPct = topHours.best.pct || 1;
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-orange-50 to-amber-50 border border-orange-100 px-4 py-3">
                    <span className="text-2xl">🔥</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800">
                        השעה הכי חזקה: {pad2(topHours.best.hour)}:00–{pad2((topHours.best.hour + 1) % 24)}:00
                      </p>
                      <p className="text-xs text-gray-500">
                        {topHours.best.pct.toFixed(0)}% מההכנסות · {topHours.best.count} עסקאות · 7 השעות המובילות = {topHours.topShare.toFixed(0)}% מהמכירות
                      </p>
                    </div>
                  </div>

                  <div dir="ltr">
                    <div className="flex items-stretch justify-between gap-2 h-48">
                      {topHours.rows.map(h => {
                        const isBest = h.hour === topHours.best.hour;
                        return (
                          <div key={h.hour} className="flex-1 flex flex-col items-center h-full"
                            title={`${pad2(h.hour)}:00 · ${fmt(h.revenue)} · ${h.count} עסקאות`}>
                            <span className={`text-xs font-bold mb-1 ${isBest ? 'text-orange-600' : 'text-gray-600'}`}>
                              {h.pct.toFixed(0)}%
                            </span>
                            <div className="w-full flex-1 flex items-end justify-center">
                              <div
                                className="w-full max-w-[44px] rounded-t-lg transition-all duration-700 hover:opacity-80"
                                style={{
                                  height: `${Math.max(6, (h.pct / maxPct) * 100)}%`,
                                  background: isBest
                                    ? 'linear-gradient(to top, #ea580c, #fbbf24)'
                                    : 'linear-gradient(to top, #f59e0b, #fde68a)',
                                  boxShadow: isBest ? '0 4px 14px rgba(234, 88, 12, 0.35)' : 'none',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between gap-2 mt-2 border-t pt-2">
                      {topHours.rows.map(h => (
                        <span key={h.hour} className={`flex-1 text-center text-xs ${h.hour === topHours.best.hour ? 'font-bold text-orange-600' : 'text-gray-500'}`}>
                          {pad2(h.hour)}:00
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}