import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function LegacyDataMigration({ tenantEmail }) {
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [log, setLog] = useState([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const runMigration = async () => {
    setStatus('running');
    setLog([]);
    try {
      // Step 1: Ensure "סניף ראשי" exists
      addLog('שלב 1: בודק קיום סניף ראשי...');
      const existingBranches = await base44.entities.Branch.filter({ tenant_email: tenantEmail });
      let mainBranch = existingBranches.find(b => b.name === 'סניף ראשי');

      if (!mainBranch) {
        addLog('יוצר סניף ראשי...');
        mainBranch = await base44.entities.Branch.create({
          tenant_email: tenantEmail,
          name: 'סניף ראשי',
          station_email: tenantEmail,
          is_active: true,
        });
        addLog(`✓ סניף ראשי נוצר (ID: ${mainBranch.id})`);
      } else {
        addLog(`✓ סניף ראשי קיים (ID: ${mainBranch.id})`);
      }

      const branchId = mainBranch.id;

      // Step 2: Migrate FlexibleVariant stock → BranchVariantStock
      addLog('שלב 2: מעביר מלאי ווריאנטים לסניף ראשי...');
      const [allVariants, existingStock] = await Promise.all([
        base44.entities.FlexibleVariant.filter({ created_by: tenantEmail }),
        base44.entities.BranchVariantStock.filter({ branch_id: branchId }),
      ]);
      const existingStockByVariant = new Set(existingStock.map(s => s.variant_id));

      let stockMigrated = 0;
      for (const variant of allVariants) {
        if (!existingStockByVariant.has(variant.id)) {
          await base44.entities.BranchVariantStock.create({
            branch_id: branchId,
            variant_id: variant.id,
            stock: variant.stock || 0,
            tenant_email: tenantEmail,
          });
          stockMigrated++;
        }
      }
      addLog(`✓ ${stockMigrated} ווריאנטים הועברו (${allVariants.length - stockMigrated} כבר קיימים)`);

      // Step 3: Migrate BranchProductVisibility for all product groups
      addLog('שלב 3: מגדיר נראות מוצרים לסניף ראשי...');
      const [allGroups, existingVisibility] = await Promise.all([
        base44.entities.ProductGroup.filter({ created_by: tenantEmail }),
        base44.entities.BranchProductVisibility.filter({ branch_id: branchId }),
      ]);
      const existingVisibilityByGroup = new Set(existingVisibility.map(v => v.product_group_id));

      let visibilityCreated = 0;
      for (const group of allGroups) {
        if (!existingVisibilityByGroup.has(group.id)) {
          await base44.entities.BranchProductVisibility.create({
            branch_id: branchId,
            product_group_id: group.id,
            is_visible: true,
          });
          visibilityCreated++;
        }
      }
      addLog(`✓ ${visibilityCreated} רשומות נראות נוצרו (${allGroups.length - visibilityCreated} כבר קיימות)`);

      // Step 4: Migrate Sales with branch_id === null
      addLog('שלב 4: מעביר היסטוריית מכירות לסניף ראשי...');
      const allSales = await base44.entities.Sale.filter({ created_by: tenantEmail });
      const unassignedSales = allSales.filter(s => !s.branch_id);

      let salesMigrated = 0;
      for (const sale of unassignedSales) {
        await base44.entities.Sale.update(sale.id, { branch_id: branchId });
        salesMigrated++;
      }
      addLog(`✓ ${salesMigrated} מכירות הועברו לסניף ראשי`);

      addLog('✅ הסנכרון הושלם בהצלחה!');
      setStatus('done');

      // Invalidate all relevant queries so the UI refreshes immediately
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      queryClient.invalidateQueries({ queryKey: ['branch-variant-stock'] });
      queryClient.invalidateQueries({ queryKey: ['branch-product-visibility'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });

      toast({ title: 'הסנכרון הושלם בהצלחה!', description: `סניף ראשי מוכן עם כל הנתונים ההיסטוריים.`, duration: 5000 });

    } catch (err) {
      addLog(`❌ שגיאה: ${err.message}`);
      setStatus('error');
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-blue-800">
          <RefreshCw className="w-5 h-5" /> סנכרון נתוני חנות קיימת לרשת
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-blue-700">
          פעולה זו תיצור את הסניף הראשי ותעביר אליו את כל הנתונים הגלובליים הקיימים — מלאי, מוצרים, ומכירות היסטוריות.
          בטוח להריץ מספר פעמים — לא ייווצרו כפילויות.
        </p>

        {log.length > 0 && (
          <div className="bg-white rounded-lg border border-blue-200 p-3 text-sm font-mono space-y-1 max-h-52 overflow-y-auto">
            {log.map((line, i) => (
              <div key={i} className="text-gray-700 leading-relaxed">{line}</div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={runMigration}
            disabled={status === 'running'}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {status === 'running'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> מסנכרן...</>
              : <><RefreshCw className="w-4 h-4" /> סנכרן נתוני חנות קיימת לרשת</>
            }
          </Button>

          {status === 'done' && (
            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> הושלם!
            </span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
              <AlertCircle className="w-4 h-4" /> שגיאה — בדוק לוג
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}