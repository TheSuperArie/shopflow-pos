import React, { useState, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, GitFork } from 'lucide-react';

// Mode: 'single' or 'split'
function AssignmentRow({ baseName, count, sell_price, candidates, groups, onDone }) {
  const [mode, setMode] = useState('single');
  const [group1, setGroup1] = useState(candidates.length === 1 ? candidates[0].id : '');
  const [group2, setGroup2] = useState('');
  const [pct, setPct] = useState(50); // % for group1
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(null);

  const allSalesRef = React.useRef(null);

  const canRun = mode === 'single' ? !!group1 : (!!group1 && !!group2 && group1 !== group2);

  const handleRun = async (allSales) => {
    setRunning(true);
    let updated = 0;

    for (const sale of allSales) {
      let changed = false;
      let newItems = [];

      for (const item of (sale.items || [])) {
        if (item.group_id) { newItems.push(item); continue; }
        const itemBase = item.product_name?.split(' - ')[0]?.trim();
        if (itemBase !== baseName) { newItems.push(item); continue; }

        changed = true;

        if (mode === 'single') {
          newItems.push({ ...item, group_id: group1 });
        } else {
          // Split: replace 1 item with 2 items, each with proportional qty/price
          const qty = item.quantity || 1;
          const price = item.sell_price || 0;
          const cost = item.cost_price || 0;
          const ratio1 = pct / 100;
          const ratio2 = 1 - ratio1;

          newItems.push({
            ...item,
            group_id: group1,
            quantity: Math.round(qty * ratio1 * 100) / 100,
            sell_price: price,
            cost_price: cost,
          });
          newItems.push({
            ...item,
            group_id: group2,
            quantity: Math.round(qty * ratio2 * 100) / 100,
            sell_price: price,
            cost_price: cost,
          });
        }
      }

      if (changed) {
        await base44.entities.Sale.update(sale.id, { ...sale, items: newItems });
        updated++;
      }
    }

    setDone({ updated });
    setRunning(false);
    onDone(baseName);
  };

  return { group1, group2, pct, mode, setMode, setGroup1, setGroup2, setPct, running, done, canRun, handleRun };
}

export default function SaleMigrationTool({ tenantEmail }) {
  const [rowStates, setRowStates] = useState({});
  const [doneNames, setDoneNames] = useState(new Set());
  const [progress, setProgress] = useState({});
  const queryClient = useQueryClient();

  const { data: allSales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['migration-sales', tenantEmail],
    queryFn: () => base44.entities.Sale.filter({ created_by: tenantEmail }, '-created_date', 10000),
    enabled: !!tenantEmail,
    staleTime: 0,
    gcTime: 0,
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['migration-groups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }, 'name', 500),
    enabled: !!tenantEmail,
  });

  const unassignedNames = useMemo(() => {
    const map = {};
    for (const sale of allSales) {
      for (const item of (sale.items || [])) {
        // treat empty string or null/undefined as unassigned
        if (item.group_id && item.group_id !== '') continue;
        const baseName = item.product_name?.split(' - ')[0]?.trim();
        if (!baseName) continue;
        if (!map[baseName]) map[baseName] = { baseName, count: 0, sell_price: item.sell_price };
        map[baseName].count += item.quantity || 1;
      }
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [allSales]);

  const candidatesFor = (baseName) => {
    const lower = baseName.toLowerCase().trim();
    const exact = groups.filter(g => g.name.trim().toLowerCase() === lower);
    if (exact.length > 0) return exact;
    return groups.filter(g => {
      const gName = g.name.trim().toLowerCase();
      return lower.startsWith(gName) || lower.includes(gName);
    });
  };

  const getState = (baseName, candidates) => {
    if (!rowStates[baseName]) {
      return {
        mode: 'single',
        group1: candidates.length === 1 ? candidates[0].id : '',
        group2: '',
        pct: 50,
        running: false,
      };
    }
    return rowStates[baseName];
  };

  const updateState = (baseName, patch) => {
    setRowStates(prev => ({ ...prev, [baseName]: { ...getState(baseName, []), ...patch } }));
  };

  const handleRun = async (baseName) => {
    const candidates = candidatesFor(baseName);
    const st = getState(baseName, candidates);
    updateState(baseName, { running: true });

    // Only process sales that actually contain this product name (unassigned)
    const relevantSales = allSales.filter(sale =>
      (sale.items || []).some(item => (!item.group_id || item.group_id === '') && item.product_name?.split(' - ')[0]?.trim() === baseName)
    );

    setProgress(prev => ({ ...prev, [baseName]: { current: 0, total: relevantSales.length } }));

    let i = 0;
    for (const sale of relevantSales) {
      const newItems = (sale.items || []).map(item => {
        if (item.group_id && item.group_id !== '') return item;
        const itemBase = item.product_name?.split(' - ')[0]?.trim();
        if (itemBase !== baseName) return item;

        if (st.mode === 'single') {
          return { ...item, group_id: st.group1 };
        } else {
          // Return array marker — we'll flatten below
          return { __split: true, item, group1: st.group1, group2: st.group2, pct: st.pct };
        }
      });

      // Flatten split items
      const flatItems = [];
      for (const x of newItems) {
        if (x.__split) {
          const qty = x.item.quantity || 1;
          const r1 = x.pct / 100;
          flatItems.push({ ...x.item, group_id: x.group1, quantity: Math.round(qty * r1 * 100) / 100 });
          flatItems.push({ ...x.item, group_id: x.group2, quantity: Math.round(qty * (1 - r1) * 100) / 100 });
        } else {
          flatItems.push(x);
        }
      }

      await base44.entities.Sale.update(sale.id, { ...sale, items: flatItems });
      i++;
      setProgress(prev => ({ ...prev, [baseName]: { current: i, total: relevantSales.length } }));
    }

    updateState(baseName, { running: false });
    setProgress(prev => { const n = { ...prev }; delete n[baseName]; return n; });
    setDoneNames(prev => new Set([...prev, baseName]));
    // Refetch sales so the list reflects actual DB state
    await queryClient.invalidateQueries({ queryKey: ['migration-sales', tenantEmail] });
  };

  if (loadingSales || loadingGroups) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const [showDebug, setShowDebug] = useState(false);
  const debugItems = useMemo(() => {
    const map = {};
    for (const sale of allSales) {
      for (const item of (sale.items || [])) {
        const gid = item.group_id;
        if (gid && gid !== '') continue;
        const key = JSON.stringify({ name: item.product_name, gid });
        if (!map[key]) map[key] = { name: item.product_name, gid: String(gid), count: 0 };
        map[key].count++;
      }
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [allSales]);

  const remaining = unassignedNames.filter(n => !doneNames.has(n.baseName));

  if (unassignedNames.length === 0 || remaining.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-green-600 flex flex-col items-center gap-2">
          <CheckCircle2 className="w-8 h-8" />
          <p className="font-semibold">כל המכירות כבר מסווגות!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="text-base font-semibold">תיקון מכירות היסטוריות</CardTitle>
        <p className="text-sm text-gray-500">
          נמצאו <strong>{remaining.length}</strong> שמות מוצר ייחודיים ללא קטגוריה.
        </p>
        <button onClick={() => setShowDebug(v => !v)} className="text-xs text-blue-500 underline mt-1">
          {showDebug ? 'הסתר אבחון' : `🔍 אבחון — ${debugItems.length} סוגי פריטים ללא group_id`}
        </button>
        {showDebug && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded border bg-gray-100 p-2 text-xs space-y-1">
            {debugItems.map((d, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-400 w-6">{d.count}×</span>
                <span className="font-mono">{d.name || '(ריק)'}</span>
                <span className="text-red-400">group_id={d.gid || 'null/undefined'}</span>
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {remaining.map(({ baseName, count, sell_price }) => {
          const candidates = candidatesFor(baseName);
          const st = getState(baseName, candidates);
          const isSplit = st.mode === 'split';
          const canRun = isSplit ? (!!st.group1 && !!st.group2 && st.group1 !== st.group2) : !!st.group1;

          const prog = progress[baseName];

          return (
            <div key={baseName} className="p-3 rounded-xl border bg-gray-50 space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm text-gray-800 truncate flex-1" title={baseName}>📦 {baseName}</p>
                <div className="flex gap-1 flex-wrap justify-end items-center">
                  <Badge variant="outline" className="text-xs">{Math.round(count)} יח׳</Badge>
                  {sell_price && <Badge variant="outline" className="text-xs">₪{sell_price}</Badge>}
                  {/* Toggle split mode */}
                  <button
                    onClick={() => updateState(baseName, { mode: isSplit ? 'single' : 'split' })}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${isSplit ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-purple-50 hover:text-purple-600'}`}
                    title="פיצול בין שתי קטגוריות"
                  >
                    <GitFork className="w-3 h-3" />
                    פיצול
                  </button>
                </div>
              </div>

              {/* Single mode */}
              {!isSplit && (
                <div className="flex items-center gap-2">
                  <Select value={st.group1} onValueChange={val => updateState(baseName, { group1: val })}>
                    <SelectTrigger className={`flex-1 h-9 text-sm ${st.group1 ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                      <SelectValue placeholder="בחר group..." />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name.trim()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!canRun || st.running} onClick={() => handleRun(baseName)} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0 min-w-[90px]">
                    {st.running ? (prog ? `${prog.current}/${prog.total}` : <Loader2 className="w-4 h-4 animate-spin" />) : 'החל שיוך'}
                  </Button>
                </div>
              )}

              {/* Split mode */}
              {isSplit && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={st.group1} onValueChange={val => updateState(baseName, { group1: val })}>
                      <SelectTrigger className={`flex-1 h-9 text-sm ${st.group1 ? 'border-purple-400 bg-purple-50' : 'border-gray-300'}`}>
                        <SelectValue placeholder="Group 1..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name.trim()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-sm font-bold text-purple-700 shrink-0 w-10 text-center">{st.pct}%</span>
                  </div>

                  {/* Slider */}
                  <input
                    type="range" min={10} max={90} step={10}
                    value={st.pct}
                    onChange={e => updateState(baseName, { pct: Number(e.target.value) })}
                    className="w-full accent-purple-500"
                  />

                  <div className="flex items-center gap-2">
                    <Select value={st.group2} onValueChange={val => updateState(baseName, { group2: val })}>
                      <SelectTrigger className={`flex-1 h-9 text-sm ${st.group2 ? 'border-purple-400 bg-purple-50' : 'border-gray-300'}`}>
                        <SelectValue placeholder="Group 2..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name.trim()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-sm font-bold text-purple-700 shrink-0 w-10 text-center">{100 - st.pct}%</span>
                  </div>

                  <Button size="sm" disabled={!canRun || st.running} onClick={() => handleRun(baseName)} className="w-full bg-purple-500 hover:bg-purple-600 text-white">
                    {st.running ? (prog ? `מעדכן ${prog.current}/${prog.total}...` : <Loader2 className="w-4 h-4 animate-spin" />) : `החל פיצול ${st.pct}/${100 - st.pct}`}
                  </Button>
                </div>
              )}

              {candidates.length === 1 && !st.group1 && (
                <p className="text-xs text-blue-600">התאמה אוטומטית: {candidates[0].name.trim()}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}