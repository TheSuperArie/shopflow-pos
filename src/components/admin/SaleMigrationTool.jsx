import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function SaleMigrationTool({ tenantEmail }) {
  const [assignments, setAssignments] = useState({}); // baseName -> group_id
  const [running, setRunning] = useState({}); // baseName -> bool
  const [results, setResults] = useState({});  // baseName -> { updated }

  const { data: allSales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['migration-sales', tenantEmail],
    queryFn: () => base44.entities.Sale.filter({ created_by: tenantEmail }, '-created_date', 2000),
    enabled: !!tenantEmail,
    staleTime: 0,
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['migration-groups', tenantEmail],
    queryFn: () => base44.entities.ProductGroup.filter({ created_by: tenantEmail }, 'name', 500),
    enabled: !!tenantEmail,
  });

  // Unique base names (before " - ") without group_id
  const unassignedNames = useMemo(() => {
    const map = {};
    for (const sale of allSales) {
      for (const item of (sale.items || [])) {
        if (item.group_id) continue;
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

  const getEffectiveGroupId = (baseName) => {
    if (assignments[baseName]) return assignments[baseName];
    const candidates = candidatesFor(baseName);
    if (candidates.length === 1) return candidates[0].id;
    return null;
  };

  const handleRunSingle = async (baseName) => {
    const groupId = getEffectiveGroupId(baseName);
    if (!groupId) return;
    setRunning(prev => ({ ...prev, [baseName]: true }));
    let updated = 0;

    for (const sale of allSales) {
      let changed = false;
      const newItems = (sale.items || []).map(item => {
        if (item.group_id) return item;
        const itemBase = item.product_name?.split(' - ')[0]?.trim();
        if (itemBase !== baseName) return item;
        changed = true;
        return { ...item, group_id: groupId };
      });
      if (changed) {
        await base44.entities.Sale.update(sale.id, { ...sale, items: newItems });
        updated++;
      }
    }

    setResults(prev => ({ ...prev, [baseName]: { updated } }));
    setRunning(prev => ({ ...prev, [baseName]: false }));
  };

  if (loadingSales || loadingGroups) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const remaining = unassignedNames.filter(n => !results[n.baseName]);

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
          נמצאו <strong>{remaining.length}</strong> שמות מוצר ייחודיים ללא קטגוריה. שייך כל אחד בנפרד.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {remaining.map(({ baseName, count, sell_price }) => {
          const candidates = candidatesFor(baseName);
          const assigned = assignments[baseName];
          const autoGroupId = candidates.length === 1 ? candidates[0].id : null;
          const selectedGroupId = assigned || autoGroupId || '';
          const isRunning = running[baseName];

          return (
            <div key={baseName} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800 truncate" title={baseName}>📦 {baseName}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{Math.round(count)} יח׳</Badge>
                  {sell_price && <Badge variant="outline" className="text-xs">₪{sell_price}</Badge>}
                  {autoGroupId && !assigned && (
                    <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">אוטומטי: {candidates[0].name.trim()}</Badge>
                  )}
                  {candidates.length === 0 && !assigned && (
                    <Badge className="text-xs bg-red-100 text-red-700 border-red-200">לא נמצא אוטומטית</Badge>
                  )}
                </div>
              </div>

              <Select
                value={selectedGroupId}
                onValueChange={val => setAssignments(prev => ({ ...prev, [baseName]: val }))}
              >
                <SelectTrigger className={`w-44 h-9 text-sm ${selectedGroupId ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                  <SelectValue placeholder="בחר group..." />
                </SelectTrigger>
                <SelectContent>
                  {(candidates.length > 0 ? candidates : groups).map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name.trim()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                size="sm"
                disabled={!selectedGroupId || isRunning}
                onClick={() => handleRunSingle(baseName)}
                className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
              >
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'החל שיוך'}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}