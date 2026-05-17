import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatabaseZap, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

export default function LegacyDataMigration({ tenantEmail }) {
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [log, setLog] = useState([]);

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
    const allVariants = await base44.entities.FlexibleVariant.filter({ created_by: tenantEmail });
    const existingStock = await base44.entities.BranchVariantStock.filter({ branch_id: branchId });
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
    addLog(`✓ ${stockMigrated} ווריאנטים הועברו (${allVariants.length - stockMigrated} כבר היו)`);

    // Step 3: Migrate BranchProductVisibility for all product groups
    addLog('שלב 3: מגדיר נראות מוצרים לסניף ראשי...');
    const allGroups = await base44.entities.ProductGroup.filter({ created_by: tenantEmail });
    const existingVisibility = await base44.entities.BranchProductVisibility.filter({ branch_id: branchId });
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
    addLog(`✓ ${visibilityCreated} רשומות נראות נוצרו (${allGroups.length - visibilityCreated} כבר היו)`);

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

    addLog('✅ המיגרציה הושלמה בהצלחה!');
    setStatus('done');
    } catch (err) {
      addLog(`❌ שגיאה: ${err.message}`);
      setStatus('error');
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-amber-800">
          <DatabaseZap className="w-5 h-5" /> מיגרציה של נתונים היסטוריים
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-amber-700">
          פעולה זו תעביר את כל הנתונים הגלובליים הקיימים (מלאי, מוצרים, מכירות) לסניף הראשי.
          ניתן להריץ אותה מספר פעמים — היא בטוחה ולא תכפיל נתונים.
        </p>

        {log.length > 0 && (
          <div className="bg-white rounded-lg border border-amber-200 p-3 text-sm font-mono space-y-1 max-h-48 overflow-y-auto">
            {log.map((line, i) => (
              <div key={i} className="text-gray-700">{line}</div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={runMigration}
            disabled={status === 'running'}
            className="bg-amber-500 hover:bg-amber-600 gap-2"
          >
            {status === 'running'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> מריץ מיגרציה...</>
              : <><DatabaseZap className="w-4 h-4" /> הרץ מיגרציה</>
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