import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

/**
 * One-time migration tool:
 * Finds all sale items without group_id, extracts unique base names,
 * lets admin assign the correct group, then patches all matching sales.
 */
export default function SaleMigrationTool({ tenantEmail }) {
  const [assignments, setAssignments] = useState({}); // baseName -> group_id
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // { updated, skipped }

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

  // Find all unique base names from items WITHOUT group_id
  const unassignedNames = useMemo(() => {
    const map = {}; // baseName -> { count, saleIds: Set, sell_price }
    for (const sale of allSales) {
      for (const item of (sale.items || [])) {
        if (item.group_id) continue; // already has group — skip
        const baseName = item.product_name?.split(' - ')[0]?.trim();
        if (!baseName) continue;
        if (!map[baseName]) map[baseName] = { baseName, count: 0, saleIds: new Set(), sell_price: item.sell_price };
        map[baseName].count += item.quantity || 1;
        map[baseName].saleIds.add(sale.id);
      }
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [allSales]);

  // For each base name, find candidate groups:
  // 1. Exact match (priority)
  // 2. Partial match — group name is contained within the base name (e.g. "גופיות" inside "גופיות Twins")
  const candidatesFor = (baseName) => {
    const lower = baseName.toLowerCase().trim();
    const exact = groups.filter(g => g.name.trim().toLowerCase() === lower);
    if (exact.length > 0) return exact;
    // Partial: group name appears as a word/prefix inside baseName
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

  const allAssigned = unassignedNames.length > 0 && unassignedNames.every(n => !!getEffectiveGroupId(n.baseName));

  const handleRun = async () => {
    setRunning(true);
    let updated = 0;
    let skipped = 0;

    // Build baseName -> group lookup
    const groupById = Object.fromEntries(groups.map(g => [g.id, g]));

    for (const sale of allSales) {
      let changed = false;
      const newItems = (sale.items || []).map(item => {
        if (item.group_id) return item; // already set
        const baseName = item.product_name?.split(' - ')[0]?.trim();
        const assignedGroupId = getEffectiveGroupId(baseName);
        if (!assignedGroupId) { skipped++; return item; }
        changed = true;
        return { ...item, group_id: assignedGroupId };
      });

      if (changed) {
        await base44.entities.Sale.update(sale.id, { ...sale, items: newItems });
        updated++;
      }
    }

    setResults({ updated, skipped });
    setRunning(false);
  };

  if (loadingSales || loadingGroups) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      </div>
    );
  }

  if (unassignedNames.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-green-600 flex flex-col items-center gap-2">
          <CheckCircle2 className="w-8 h-8" />
          <p className="font-semibold">כל המכירות כבר מסווגות! אין פריטים ללא group_id.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="text-base font-semibold">תיקון מכירות היסטוריות</CardTitle>
        <p className="text-sm text-gray-500">
          נמצאו <strong>{unassignedNames.length}</strong> שמות מוצר ייחודיים ללא קטגוריה.
          שייך כל שם ל-group הנכון — הכלי יעדכן את כל המכירות עם אותו שם בבת אחת.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3 px-3 text-xs font-semibold text-gray-400 uppercase">
          <span className="flex-1">שם המוצר במכירה</span>
          <span className="w-56 text-center">שייך ל-Group</span>
        </div>

        {unassignedNames.map(({ baseName, count, sell_price }) => {
          const candidates = candidatesFor(baseName);
          const assigned = assignments[baseName];
          // Auto-select if exactly one candidate
          const autoSelected = candidates.length === 1 && !assignments[baseName];
          if (autoSelected && !assignments[baseName]) {
            // trigger auto-assign (side-effect in render — use effect instead via initial state trick)
          }
          return (
            <div key={baseName} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800 truncate" title={baseName}>📦 {baseName}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{Math.round(count)} יח׳</Badge>
                  {sell_price && <Badge variant="outline" className="text-xs">₪{sell_price}</Badge>}
                  {candidates.length > 1 && (
                    <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">⚠️ {candidates.length} groups עם אותו שם</Badge>
                  )}
                  {candidates.length === 0 && (
                    <Badge className="text-xs bg-red-100 text-red-700 border-red-200">לא נמצא התאמה אוטומטית</Badge>
                  )}
                  {candidates.length === 1 && !assigned && (
                    <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">התאמה אוטומטית: {candidates[0].name.trim()}</Badge>
                  )}
                </div>
              </div>
              <Select
                value={assigned || (candidates.length === 1 ? candidates[0].id : '')}
                onValueChange={val => setAssignments(prev => ({ ...prev, [baseName]: val }))}
              >
                <SelectTrigger className={`w-56 h-9 text-sm ${(assigned || candidates.length === 1) ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                  <SelectValue placeholder="בחר group..." />
                </SelectTrigger>
                <SelectContent>
                  {candidates.length > 0 ? (
                    candidates.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name.trim()}</SelectItem>
                    ))
                  ) : (
                    groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name.trim()}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          );
        })}

        {results && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${results.skipped === 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
            <CheckCircle2 className="w-4 h-4" />
            עודכנו {results.updated} מכירות. {results.skipped > 0 && `${results.skipped} פריטים דולגו (לא שויכו).`}
          </div>
        )}

        <Button
          onClick={handleRun}
          disabled={running || !allAssigned}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white"
        >
          {running ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />מעדכן מכירות...</> : 'החל שיוך על כל המכירות'}
        </Button>
        {!allAssigned && (
          <p className="text-xs text-center text-gray-400">יש לשייך את כל השמות לפני ההפעלה</p>
        )}
      </CardContent>
    </Card>
  );
}