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

  // Find all unique FULL product names from items WITHOUT group_id
  // key = full product_name, also store the baseName for auto-matching
  const unassignedNames = useMemo(() => {
    const map = {}; // fullName -> { fullName, baseName, count, sell_price }
    for (const sale of allSales) {
      for (const item of (sale.items || [])) {
        if (item.group_id) continue;
        const fullName = item.product_name?.trim();
        if (!fullName) continue;
        const baseName = fullName.split(' - ')[0]?.trim();
        if (!map[fullName]) map[fullName] = { fullName, baseName, count: 0, sell_price: item.sell_price };
        map[fullName].count += item.quantity || 1;
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

  const getEffectiveGroupId = (fullName, baseName) => {
    if (assignments[fullName]) return assignments[fullName];
    const candidates = candidatesFor(baseName);
    if (candidates.length === 1) return candidates[0].id;
    return null;
  };

  const anyAssigned = unassignedNames.some(n => !!getEffectiveGroupId(n.fullName, n.baseName));

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
        const fullName = item.product_name?.trim();
        const baseName = fullName?.split(' - ')[0]?.trim();
        const assignedGroupId = getEffectiveGroupId(fullName, baseName);
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

        {unassignedNames.map(({ fullName, baseName, count, sell_price }) => {
          const candidates = candidatesFor(baseName);
          const assigned = assignments[fullName];
          const autoGroupId = candidates.length === 1 ? candidates[0].id : null;
          const isGreen = !!assigned || !!autoGroupId;
          return (
            <div key={fullName} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800 truncate" title={fullName}>📦 {fullName}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{Math.round(count)} יח׳</Badge>
                  {sell_price && <Badge variant="outline" className="text-xs">₪{sell_price}</Badge>}
                  {candidates.length > 1 && (
                    <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">⚠️ {candidates.length} התאמות</Badge>
                  )}
                  {candidates.length === 0 && !assigned && (
                    <Badge className="text-xs bg-red-100 text-red-700 border-red-200">לא נמצא אוטומטית</Badge>
                  )}
                  {autoGroupId && !assigned && (
                    <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">אוטומטי: {candidates[0].name.trim()}</Badge>
                  )}
                </div>
              </div>
              <Select
                value={assigned || autoGroupId || ''}
                onValueChange={val => setAssignments(prev => ({ ...prev, [fullName]: val }))}
              >
                <SelectTrigger className={`w-56 h-9 text-sm ${isGreen ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
                  <SelectValue placeholder="בחר group..." />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name.trim()}</SelectItem>
                  ))}
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
          disabled={running || !anyAssigned}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white"
        >
          {running ? <><Loader2 className="w-4 h-4 animate-spin ml-2" />מעדכן מכירות...</> : 'החל שיוך על כל המכירות'}
        </Button>
        {!anyAssigned && (
          <p className="text-xs text-center text-gray-400">יש לשייך לפחות מוצר אחד לפני ההפעלה</p>
        )}
      </CardContent>
    </Card>
  );
}