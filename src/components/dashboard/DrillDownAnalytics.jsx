import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronRight, BarChart2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ANALYTICS_COLORS } from '@/hooks/useCategorySalesAnalytics';

/**
 * Hierarchical drill-down analytics component.
 * Levels:
 *   0 = P1 (top-level categories)
 *   1 = P2 (sub-categories under selected P1)
 *   2 = P3 (product groups under selected P2)
 *   3+ = P4, P5... (variant dimensions)
 */
export default function DrillDownAnalytics({ sales, categories, groups, variants, dimensions, defaultDimension }) {
  const navigate = useNavigate();
  const [drillPath, setDrillPath] = useState([]); // [{level, id, name}]
  const [selectedDimension, setSelectedDimension] = useState(defaultDimension || '__auto__');

  // ── Lookup maps ──────────────────────────────────────────────────
  const categoryById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const groupById = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);
  const variantById = useMemo(() => Object.fromEntries(variants.map(v => [String(v.id), v])), [variants]);

  // Top-level categories (no parent)
  const topLevelCats = useMemo(() => categories.filter(c => !c.parent_id), [categories]);

  // ── Current drill state ──────────────────────────────────────────
  const currentLevel = drillPath.length; // 0=P1, 1=P2, 2=P3, 3+=Pn
  const currentNode = drillPath[drillPath.length - 1] || null;

  // ── Available dimension names ────────────────────────────────────
  const availableDimensions = useMemo(() => {
    const names = new Set();
    for (const dim of dimensions) {
      if (dim.is_active !== false) names.add(dim.name);
    }
    for (const v of variants) {
      for (const k of Object.keys(v.dimensions || {})) names.add(k);
    }
    return [...names];
  }, [dimensions, variants]);

  const effectiveDimension = selectedDimension === '__auto__' ? (availableDimensions[0] || null) : selectedDimension;

  // ── Build chart data based on current level ──────────────────────
  const chartData = useMemo(() => {
    if (currentLevel === 0) {
      // P1: group by top-level category
      const map = {};
      for (const sale of sales) {
        for (const item of (sale.items || [])) {
          const resolved = resolveGroups(item, groupById, variantById, groups);
          const revenue = (item.sell_price || 0) * (item.quantity || 0);
          const qty = item.quantity || 0;
          for (const { group, weight } of resolved) {
            const cat = categoryById[group.category_id];
            if (!cat) continue;
            const rootCat = cat.parent_id ? categoryById[cat.parent_id] : cat;
            if (!rootCat) continue;
            if (!map[rootCat.id]) map[rootCat.id] = { id: rootCat.id, name: rootCat.name, revenue: 0, quantity: 0 };
            map[rootCat.id].revenue += revenue * weight;
            map[rootCat.id].quantity += qty * weight;
          }
        }
      }
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }

    if (currentLevel === 1) {
      // P2: sub-categories of selected P1
      const p1Id = drillPath[0].id;
      const subCats = categories.filter(c => c.parent_id === p1Id);
      const map = {};
      for (const sc of subCats) map[sc.id] = { id: sc.id, name: sc.name, revenue: 0, quantity: 0 };
      map['__direct__'] = { id: '__direct__', name: 'כללי', revenue: 0, quantity: 0 };

      for (const sale of sales) {
        for (const item of (sale.items || [])) {
          const resolved = resolveGroups(item, groupById, variantById, groups);
          const revenue = (item.sell_price || 0) * (item.quantity || 0);
          const qty = item.quantity || 0;
          for (const { group, weight } of resolved) {
            const cat = categoryById[group.category_id];
            if (!cat) continue;
            const rootId = cat.parent_id || cat.id;
            if (rootId !== p1Id) continue;
            const bucketId = cat.parent_id ? cat.id : '__direct__';
            if (!map[bucketId]) continue;
            map[bucketId].revenue += revenue * weight;
            map[bucketId].quantity += qty * weight;
          }
        }
      }
      return Object.values(map).filter(b => b.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    }

    if (currentLevel === 2) {
      // P3: product groups under selected P2 (or direct P1 bucket)
      const p2Node = drillPath[1];
      const map = {};
      for (const sale of sales) {
        for (const item of (sale.items || [])) {
          const group = resolveGroup(item, groupById, variantById, groups);
          if (!group) continue;
          const cat = categoryById[group.category_id];
          if (!cat) continue;
          // Match this item to the P2 bucket
          const matchesDirect = p2Node.id === '__direct__' && cat.id === drillPath[0].id;
          const matchesSub = cat.id === p2Node.id;
          if (!matchesDirect && !matchesSub) continue;
          if (!map[group.id]) map[group.id] = { id: group.id, name: group.name, revenue: 0, quantity: 0 };
          map[group.id].revenue += (item.sell_price || 0) * (item.quantity || 0);
          map[group.id].quantity += item.quantity || 0;
        }
      }
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }

    // P4+: dimension breakdown for selected group (P3 node)
    const p3GroupId = drillPath[2].id;
    // Known values for effective dimension
    const knownValues = {};
    for (const dim of dimensions) {
      if (dim.is_active !== false) knownValues[dim.name.trim()] = (dim.values || []).map(v => v.trim());
    }
    const targetValues = effectiveDimension ? (knownValues[effectiveDimension] || []) : Object.values(knownValues).flat();

    const map = {};
    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const group = resolveGroup(item, groupById, variantById, groups);
        if (!group || group.id !== p3GroupId) continue;

        const rawVarId = item.variant_id ?? item.variantId;
        const variant = rawVarId ? variantById[String(rawVarId)] : null;

        let dimVal = null;
        if (effectiveDimension && variant?.dimensions?.[effectiveDimension] != null) {
          dimVal = String(variant.dimensions[effectiveDimension]).trim();
        }
        if (!dimVal && item.product_name) {
          const segs = item.product_name.split(/[\s\-\/]+/).map(s => s.trim()).filter(Boolean);
          for (const seg of segs) {
            if (targetValues.some(v => v.toLowerCase() === seg.toLowerCase())) { dimVal = seg; break; }
          }
        }
        if (!dimVal) dimVal = 'אחר';

        if (!map[dimVal]) map[dimVal] = { id: dimVal, name: dimVal, revenue: 0, quantity: 0 };
        map[dimVal].revenue += (item.sell_price || 0) * (item.quantity || 0);
        map[dimVal].quantity += item.quantity || 0;
      }
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [sales, drillPath, currentLevel, categories, groups, variants, dimensions, effectiveDimension, categoryById, groupById, variantById]);

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);

  const handleDrillDown = (row) => {
    // Can always drill into P1, P2, P3. P4+ has no further drill.
    if (currentLevel < 3) {
      setDrillPath(prev => [...prev, { level: currentLevel, id: row.id, name: row.name }]);
    }
  };

  const handleBreadcrumb = (idx) => {
    setDrillPath(prev => prev.slice(0, idx));
  };

  const canDrill = currentLevel < 3;

  const levelLabel = ['קטגוריות', 'תת-קטגוריות', 'תיקיות מוצרים', effectiveDimension || 'ממד'][Math.min(currentLevel, 3)];

  return (
    <div className="space-y-4" dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap text-sm">
        <button onClick={() => setDrillPath([])} className={`font-medium ${currentLevel === 0 ? 'text-gray-800' : 'text-blue-600 hover:underline'}`}>
          כל הקטגוריות
        </button>
        {drillPath.map((step, idx) => (
          <React.Fragment key={idx}>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <button
              onClick={() => handleBreadcrumb(idx + 1)}
              className={`font-medium ${idx === drillPath.length - 1 ? 'text-gray-800' : 'text-blue-600 hover:underline'}`}
            >
              {step.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Dimension selector — shown at P3 level and above */}
      {currentLevel >= 2 && availableDimensions.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">קבץ לפי ממד:</span>
          <Select value={selectedDimension} onValueChange={setSelectedDimension}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">אוטומטי</SelectItem>
              {availableDimensions.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {chartData.length === 0 ? (
        <p className="text-center text-gray-400 py-8">אין נתונים לתצוגה</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{levelLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="revenue"
                    labelLine={false}
                    label={({ name, percent }) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''}
                    onClick={(entry) => canDrill && handleDrillDown(entry)}
                    style={{ cursor: canDrill ? 'pointer' : 'default' }}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `₪${v.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">פירוט — {levelLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {chartData.map((row, idx) => (
                  <div key={row.id} className="flex items-center justify-between">
                    <button
                      onClick={() => canDrill && handleDrillDown(row)}
                      className={`flex-1 flex items-center gap-2 p-2.5 rounded-xl border text-right transition-all ${
                        canDrill ? 'hover:border-amber-400 hover:bg-amber-50 cursor-pointer border-gray-100' : 'cursor-default border-transparent'
                      }`}
                    >
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ANALYTICS_COLORS[idx % ANALYTICS_COLORS.length] }} />
                      <span className="font-semibold text-sm flex-1">{row.name}</span>
                      {canDrill && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                      <div className="text-left shrink-0">
                        <p className="text-sm font-bold text-amber-600">₪{row.revenue.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{Math.round(row.quantity)} יח׳ • {totalRevenue > 0 ? ((row.revenue / totalRevenue) * 100).toFixed(1) : 0}%</p>
                      </div>
                    </button>
                    {/* Link to full insights page for P1 categories */}
                    {currentLevel === 0 && !row.id.startsWith('__') && (
                      <button
                        onClick={() => navigate(`/admin/reports/category/${row.id}`)}
                        className="mr-2 p-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                        title="ניתוח מפורט"
                      >
                        <BarChart2 className="w-4 h-4 text-amber-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Helper: resolve group(s) from sale item
// Returns array of {group, weight} — weight < 1 when ambiguous (split evenly)
export function resolveGroups(item, groupById, variantById, groups) {
  if (item.group_id && groupById[item.group_id]) return [{ group: groupById[item.group_id], weight: 1 }];
  const rawVarId = item.variant_id ?? item.variantId;
  if (rawVarId) {
    const v = variantById[String(rawVarId)];
    if (v && groupById[v.group_id]) return [{ group: groupById[v.group_id], weight: 1 }];
  }
  if (item.product_id && groupById[item.product_id]) return [{ group: groupById[item.product_id], weight: 1 }];
  const baseName = item.product_name?.split(' - ')[0]?.trim();
  if (baseName) {
    const matches = groups.filter(g => g.name === baseName);
    if (matches.length === 1) return [{ group: matches[0], weight: 1 }];
    if (matches.length > 1) return matches.map(g => ({ group: g, weight: 1 / matches.length }));
  }
  return [];
}

// Legacy single-resolve helper (returns first match only, for P3+ where we already drilled in)
function resolveGroup(item, groupById, variantById, groups) {
  const results = resolveGroups(item, groupById, variantById, groups);
  return results.length > 0 ? results[0].group : null;
}