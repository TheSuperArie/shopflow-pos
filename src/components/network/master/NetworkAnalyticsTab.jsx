import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, DollarSign, BarChart2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line,
} from 'recharts';
import { format, subDays, startOfDay, parseISO, isWithinInterval } from 'date-fns';

const DATE_PRESETS = [
  { key: 'today', label: 'היום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: 'custom', label: 'מותאם' },
];

const BRANCH_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#ec4899'];

export default function NetworkAnalyticsTab({ tenantEmail }) {
  const [preset, setPreset] = useState('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const { data: allSales = [] } = useQuery({
    queryKey: ['all-sales', tenantEmail],
    queryFn: () => base44.entities.Sale.filter({ created_by: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const { data: allExpenses = [] } = useQuery({
    queryKey: ['all-expenses', tenantEmail],
    queryFn: () => base44.entities.Expense.filter({ created_by: tenantEmail }),
    enabled: !!tenantEmail,
  });

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === 'today') return { from: startOfDay(now), to: now };
    if (preset === 'week') return { from: subDays(now, 7), to: now };
    if (preset === 'month') return { from: subDays(now, 30), to: now };
    if (preset === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') };
    }
    return { from: subDays(now, 7), to: now };
  }, [preset, customFrom, customTo]);

  const isInRange = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return isWithinInterval(d, { start: from, end: to });
    } catch { return false; }
  };

  const branchMap = useMemo(() => {
    const m = {};
    branches.forEach(b => { m[b.id] = b; });
    return m;
  }, [branches]);

  // Per-branch P&L
  const branchStats = useMemo(() => {
    const stats = {};

    // Initialize all branches
    branches.forEach(b => {
      stats[b.id] = { id: b.id, name: b.name, revenue: 0, cost: 0, expenses: 0, txCount: 0 };
    });

    // Sales
    allSales.filter(s => s.branch_id && isInRange(s.created_date)).forEach(s => {
      if (!stats[s.branch_id]) return;
      stats[s.branch_id].revenue += s.total || 0;
      stats[s.branch_id].cost += s.total_cost || 0;
      stats[s.branch_id].txCount += 1;
    });

    // Expenses (matched by station_email → branch)
    const emailToBranch = {};
    branches.forEach(b => { emailToBranch[b.station_email] = b.id; });

    allExpenses.filter(e => isInRange(e.date || e.created_date)).forEach(e => {
      const bid = emailToBranch[e.created_by];
      if (bid && stats[bid]) {
        stats[bid].expenses += e.amount || 0;
      }
    });

    return Object.values(stats).map(s => ({
      ...s,
      grossProfit: s.revenue - s.cost,
      netProfit: s.revenue - s.cost - s.expenses,
    }));
  }, [branches, allSales, allExpenses, from, to]);

  // Cross-branch daily trend
  const trendData = useMemo(() => {
    const days = preset === 'today' ? 1 : preset === 'week' ? 7 : 30;
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'dd/MM');
      const entry = { date: d };
      branches.forEach(b => { entry[b.name] = 0; });
      buckets[d] = entry;
    }
    allSales.filter(s => s.branch_id && isInRange(s.created_date)).forEach(s => {
      const d = format(new Date(s.created_date), 'dd/MM');
      const bname = branchMap[s.branch_id]?.name;
      if (buckets[d] && bname) buckets[d][bname] = (buckets[d][bname] || 0) + (s.total || 0);
    });
    return Object.values(buckets);
  }, [branches, allSales, from, to, preset]);

  const totals = branchStats.reduce(
    (acc, b) => ({
      revenue: acc.revenue + b.revenue,
      expenses: acc.expenses + b.expenses,
      netProfit: acc.netProfit + b.netProfit,
    }),
    { revenue: 0, expenses: 0, netProfit: 0 }
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 className="w-6 h-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">דוחות וגרפים</h1>
          <p className="text-sm text-gray-500">ניתוח רשת מקיף על פני כל הסניפים</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {DATE_PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              preset === p.key
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 mr-2">
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 w-36 text-sm" />
            <span className="text-gray-400 text-sm">עד</span>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 w-36 text-sm" />
          </div>
        )}
      </div>

      {/* Network KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-600 font-medium">סה"כ הכנסות רשת</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">₪{totals.revenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-red-100 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-xs text-red-600 font-medium">סה"כ הוצאות רשת</span>
            </div>
            <p className="text-2xl font-bold text-red-700">₪{totals.expenses.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={`${totals.netProfit >= 0 ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className={`w-4 h-4 ${totals.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              <span className={`text-xs font-medium ${totals.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                רווח נקי רשת
              </span>
            </div>
            <p className={`text-2xl font-bold ${totals.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              ₪{totals.netProfit.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Branch comparison bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">השוואת מכירות לפי סניף</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={branchStats} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `₪${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="revenue" name="הכנסות" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="הוצאות" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="netProfit" name="רווח נקי" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Trend over time */}
      {preset !== 'today' && branches.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-700">מגמת מכירות לאורך זמן</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `₪${Number(v).toLocaleString()}`} />
                <Legend />
                {branches.map((b, i) => (
                  <Line
                    key={b.id}
                    type="monotone"
                    dataKey={b.name}
                    stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* P&L Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">דוח רווח והפסד לפי סניף</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-xs">
                  <th className="text-right py-2 pr-2 font-medium">סניף</th>
                  <th className="text-left py-2 font-medium">הכנסות</th>
                  <th className="text-left py-2 font-medium">עלות מכר</th>
                  <th className="text-left py-2 font-medium">הוצאות</th>
                  <th className="text-left py-2 font-medium">רווח גולמי</th>
                  <th className="text-left py-2 font-medium">רווח נקי</th>
                  <th className="text-left py-2 font-medium">עסקאות</th>
                </tr>
              </thead>
              <tbody>
                {branchStats.map((b, i) => (
                  <tr key={b.id} className={`border-b last:border-0 ${i % 2 === 0 ? 'bg-gray-50/50' : ''}`}>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
                        />
                        <span className="font-medium text-gray-800">{b.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-blue-600 font-medium">₪{b.revenue.toLocaleString()}</td>
                    <td className="py-2.5 text-gray-500">₪{b.cost.toLocaleString()}</td>
                    <td className="py-2.5 text-red-500">₪{b.expenses.toLocaleString()}</td>
                    <td className="py-2.5 text-amber-600 font-medium">₪{b.grossProfit.toLocaleString()}</td>
                    <td className={`py-2.5 font-bold ${b.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₪{b.netProfit.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-gray-500">{b.txCount}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-100 font-bold text-sm">
                  <td className="py-2.5 pr-2 text-gray-700">סה"כ רשת</td>
                  <td className="py-2.5 text-blue-700">₪{totals.revenue.toLocaleString()}</td>
                  <td className="py-2.5 text-gray-600">—</td>
                  <td className="py-2.5 text-red-600">₪{totals.expenses.toLocaleString()}</td>
                  <td className="py-2.5 text-amber-700">—</td>
                  <td className={`py-2.5 ${totals.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ₪{totals.netProfit.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-gray-600">{branchStats.reduce((s, b) => s + b.txCount, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}