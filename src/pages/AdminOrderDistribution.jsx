import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Package, TrendingUp, Calculator, CheckCheck, Eraser } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const PRESETS = [
  { label: '7 ימים', days: 7 },
  { label: '30 ימים', days: 30 },
  { label: '90 ימים', days: 90 },
  { label: 'שנה', days: 365 },
];

function toISODate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Largest remainder method — distributes `total` across items by their weights
 * so the sum of rounded results equals `total` exactly.
 */
function distributeByWeight(total, items) {
  // items: [{ key, weight }]  (weight >= 0)
  const weightSum = items.reduce((s, i) => s + i.weight, 0);
  if (weightSum <= 0 || total <= 0) return items.map(i => ({ ...i, qty: 0 }));

  const raw = items.map(i => ({ ...i, raw: (i.weight / weightSum) * total }));
  const allocated = raw.map(r => ({ ...r, floor: Math.floor(r.raw), remainder: r.raw - Math.floor(r.raw) }));
  let sumFloor = allocated.reduce((s, a) => s + a.floor, 0);
  let leftover = total - sumFloor;

  // sort by remainder desc, give +1 to the top ones until leftover is exhausted
  const sorted = [...allocated].sort((a, b) => b.remainder - a.remainder);
  const byKey = {};
  allocated.forEach(a => { byKey[a.key] = a.floor; });
  for (let i = 0; i < sorted.length && leftover > 0; i++) {
    byKey[sorted[i].key] += 1;
    leftover -= 1;
  }
  return allocated.map(a => ({ ...a, qty: byKey[a.key] }));
}

export default function AdminOrderDistribution() {
  const user = useCurrentUser();

  // Default range: last 30 days
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [totalToOrder, setTotalToOrder] = useState(1000);
  // null = all groups selected; otherwise a Set of selected group ids
  const [selectedGroupIds, setSelectedGroupIds] = useState(null);

  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ['order-dist-sales', user?.email],
    queryFn: () => base44.entities.Sale.filter({ seller_email: user.email }, '-created_date', 5000),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['product-groups-all', user?.email],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: user.email }, '-created_date', 5000),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants-all', user?.email],
    queryFn: () => base44.entities.ProductVariant.filter({ created_by: user.email }, '-created_date', 5000),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Aggregate sales within the date range, per variant
  const stats = useMemo(() => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const inRange = sales.filter(s => {
      const d = new Date(s.created_date);
      return d >= start && d <= end;
    });

    const groupById = {};
    for (const g of groups) groupById[g.id] = g;

    // variant_id -> qty sold
    const variantQty = {};
    // group_id -> total qty (sum of its variants)
    const groupQty = {};
    let totalUnits = 0;

    for (const sale of inRange) {
      for (const item of sale.items || []) {
        const qty = item.quantity || 0;
        if (!item.variant_id) {
          // group-level (no variant) — bucket by group
          const gid = item.group_id;
          if (gid) {
            groupQty[gid] = (groupQty[gid] || 0) + qty;
            totalUnits += qty;
          }
          continue;
        }
        variantQty[item.variant_id] = (variantQty[item.variant_id] || 0) + qty;
        totalUnits += qty;
      }
    }

    // group variants together
    const groupsMap = {};
    for (const v of variants) {
      const g = groupById[v.group_id];
      if (!g) continue;
      const gid = g.id;
      if (!groupsMap[gid]) {
        groupsMap[gid] = {
          group: g,
          variants: [],
          groupTotalSold: groupQty[gid] || 0,
        };
      }
      const sold = variantQty[v.id] || 0;
      const dimText = v.dimensions && Object.keys(v.dimensions).length > 0
        ? Object.entries(v.dimensions).map(([k, val]) => `${k}: ${val}`).join(' • ')
        : (v.sku || 'מוצר בודד');
      groupsMap[gid].variants.push({ variant: v, sold, label: dimText });
      groupsMap[gid].groupTotalSold += sold;
    }

    // Only keep groups that had any sales in the range
    const groupsArr = Object.values(groupsMap)
      .filter(g => g.groupTotalSold > 0)
      .map(g => ({
        ...g,
        variants: g.variants.filter(v => v.sold > 0).sort((a, b) => b.sold - a.sold),
      }))
      .sort((a, b) => b.groupTotalSold - a.groupTotalSold);

    return { groups: groupsArr, totalUnits, salesInRange: inRange.length };
  }, [sales, groups, variants, startDate, endDate]);

  // Apply the user's product selection (null = all)
  const visibleGroups = useMemo(() => {
    if (!selectedGroupIds || selectedGroupIds.size === 0) return stats.groups;
    return stats.groups.filter(g => selectedGroupIds.has(g.group.id));
  }, [stats.groups, selectedGroupIds]);

  const visibleTotalUnits = useMemo(
    () => visibleGroups.reduce((s, g) => s + g.groupTotalSold, 0),
    [visibleGroups]
  );

  // Compute suggested distribution across the selected variants only
  const distribution = useMemo(() => {
    const allVariants = [];
    for (const g of visibleGroups) {
      for (const v of g.variants) {
        allVariants.push({
          key: v.variant.id,
          groupId: g.group.id,
          groupName: g.group.name,
          label: v.label,
          weight: v.sold,
        });
      }
    }
    const dist = distributeByWeight(Number(totalToOrder) || 0, allVariants);
    // regroup by group
    const byGroup = {};
    for (const d of dist) {
      if (!byGroup[d.groupId]) byGroup[d.groupId] = { groupName: d.groupName, items: [], groupQty: 0 };
      byGroup[d.groupId].items.push(d);
      byGroup[d.groupId].groupQty += d.qty;
    }
    return Object.values(byGroup)
      .sort((a, b) => b.groupQty - a.groupQty)
      .map(g => ({ ...g, items: g.items.sort((a, b) => b.qty - a.qty) }));
  }, [visibleGroups, totalToOrder]);

  const toggleGroup = (gid) => {
    setSelectedGroupIds(prev => {
      if (!prev) return new Set([gid]);
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };
  const selectAllGroups = () => setSelectedGroupIds(null);
  const clearGroups = () => setSelectedGroupIds(new Set());

  const setPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const suggestedTotal = distribution.reduce((s, g) => s + g.groupQty, 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">חלוקת הזמנה לפי סטטיסטיקה</h1>
        <p className="text-sm text-gray-500 mt-1">
          בחר מוצרים וטווח תאריכים, הזן כמות כוללת להזמנה — והמערכת תחלק אותה לפי אחוזי המכירה בטווח שנבחר.
        </p>
      </div>

      {/* Product picker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><Package className="w-4 h-4" /> בחירת מוצרים לניתוח</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllGroups}>
                <CheckCheck className="w-3.5 h-3.5 ml-1" /> הכל
              </Button>
              <Button variant="outline" size="sm" onClick={clearGroups}>
                <Eraser className="w-3.5 h-3.5 ml-1" /> נקה
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.groups.length === 0 ? (
            <p className="text-sm text-gray-500">אין מוצרים שנמכרו בטווח שנבחר.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.groups.map(g => {
                const selected = !selectedGroupIds || selectedGroupIds.has(g.group.id);
                return (
                  <button
                    key={g.group.id}
                    onClick={() => toggleGroup(g.group.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      selected
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    {g.group.name}
                    <span className={`text-xs mr-1.5 ${selected ? 'text-amber-100' : 'text-gray-400'}`}>
                      ({g.groupTotalSold})
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">
            מוצרים שלא נמכרו בכלל בטווח אינם מופיעים כאן (אין להם נתוני מכירה לחלק לפיהם).
          </p>
        </CardContent>
      </Card>

      {/* Date range + presets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4" /> טווח תאריכים לניתוח
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">מתאריך</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-44" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">עד תאריך</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-44" />
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <Button key={p.days} variant="outline" size="sm" onClick={() => setPreset(p.days)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          {salesLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> טוען נתוני מכירות...
            </div>
          )}

          {/* Summary cards */}
          {!salesLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">יחידות נמכרו בטווח</p>
                <p className="text-2xl font-bold text-amber-800">{stats.totalUnits}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">מספר עסקאות בטווח</p>
                <p className="text-2xl font-bold text-blue-800">{stats.salesInRange}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-700">מוצרים שנמכרו</p>
                <p className="text-2xl font-bold text-green-800">{stats.groups.length}</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-xs text-purple-700">מוצרים נבחרו לחלוקה</p>
                <p className="text-2xl font-bold text-purple-800">{visibleGroups.length}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Total to order */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="w-4 h-4" /> כמות כוללת להזמנה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              value={totalToOrder}
              onChange={e => setTotalToOrder(e.target.value)}
              className="w-48 text-lg font-bold"
              placeholder="לדוגמה: 10000"
            />
            <span className="text-sm text-gray-500">יחידות לחלוקה בין הוריאציות</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            החלוקה מתבצעת לפי אחוז המכירות של כל וריאציה מתוך סך המכירות בטווח שנבחר, עם עיגול שמבטיח שהסכום הכולל יהיה מדויק.
          </p>
        </CardContent>
      </Card>

      {/* Distribution results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4" /> הצעת חלוקה להזמנה
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.totalUnits === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              אין מכירות בטווח התאריכים שנבחר — בחר טווח אחר כדי לקבל הצעת חלוקה.
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              לא נבחרו מוצרים — סמן לפחות מוצר אחד למעלה כדי לקבל הצעת חלוקה.
            </div>
          ) : distribution.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              הזן כמות להזמנה כדי לקבל הצעת חלוקה.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
                <span className="text-sm text-emerald-800">סה"כ מוצע להזמנה:</span>
                <Badge className="bg-emerald-600 text-white text-sm px-3 py-1">
                  {suggestedTotal.toLocaleString()} / {Number(totalToOrder).toLocaleString()}
                </Badge>
              </div>

              {distribution.map(g => {
                const groupSold = visibleGroups.find(sg => sg.group.id === g.items[0]?.groupId)?.groupTotalSold || 0;
                const groupPercent = visibleTotalUnits > 0
                  ? (groupSold / visibleTotalUnits * 100).toFixed(1)
                  : '0';
                return (
                  <div key={g.groupName} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-gray-800">{g.groupName}</span>
                        <span className="text-xs text-gray-500 mr-2">({g.items.length} וריאציות)</span>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-200">
                        {groupPercent}% מהמכירות • {g.groupQty.toLocaleString()} יח'
                      </Badge>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {g.items.map(item => {
                        const percent = visibleTotalUnits > 0
                          ? (item.weight / visibleTotalUnits * 100).toFixed(1)
                          : '0';
                        return (
                          <div key={item.key} className="flex items-center justify-between px-4 py-2 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="text-gray-700">{item.label}</span>
                              <span className="text-xs text-gray-400">נמכרו {item.weight}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="text-xs">{percent}%</Badge>
                              <span className="font-bold text-emerald-700 w-16 text-left">
                                {item.qty.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}