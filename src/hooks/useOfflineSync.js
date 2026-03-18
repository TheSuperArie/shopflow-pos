import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { offlineManager } from '@/components/pos/offlineManager';
import { useToast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [syncStatus, setSyncStatus] = useState('idle');
  const [failedCount, setFailedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const { toast } = useToast();

  const syncToServer = async () => {
    if (offlineManager.isSyncInProgress() || navigator.onLine === false) return;

    offlineManager.setSyncInProgress(true);
    setSyncStatus('syncing');

    try {
      const pending = await offlineManager.getPendingSales();
      if (pending.length === 0) {
        setSyncStatus('idle');
        return;
      }

      let successCount = 0;

      for (const sale of pending) {
        try {
          await offlineManager.markSaleAsSyncing(sale.offline_id);
          
          // 1. יצירת המכירה בשרת
          await base44.entities.Sale.create(sale);

          // 2. עדכון מלאי - כאן התיקון הקריטי!
          // אנחנו לוקחים את המלאי המקומי המעודכן מה-Cache שלנו
          const categories = await offlineManager.getCachedCategories?.() || [];
          const groups = await offlineManager.getCachedProductGroups?.() || [];
          const variants = await offlineManager.getCachedProductVariants?.() || [];

          for (const item of sale.items || []) {
            if (!item.variant_id) continue;
            
            // מוצאים את המוצר במלאי המקומי (שכבר מראה 12)
            const localVariant = variants.find(v => v.id === item.variant_id);
            
            if (localVariant) {
              // מכריחים את השרת להתעדכן למספר המקומי שלנו
              await base44.entities.ProductVariant.update(item.variant_id, { 
                stock: localVariant.stock 
              });
            }
          }

          await offlineManager.markSaleAsSynced(sale.offline_id);
          successCount++;
        } catch (err) {
          console.error("Failed sale sync:", err);
        }
      }

      // 3. רק בסוף הכל - מרעננים נתונים מהשרת כדי לוודא סנכרון סופי
      const [fCats, fGrps, fVars] = await Promise.all([
        base44.entities.Category.list(),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);

      await offlineManager.cacheInventory(fCats, fGrps, fVars);
      
      const userEmail = fCats[0]?.created_by || null;
      queryClient.setQueryData(['product-variants', false, userEmail], fVars);
      queryClient.setQueryData(['categories', false, userEmail], fCats);

      toast({ title: "סנכרון הושלם", description: `${successCount} מכירות עודכנו בהצלחה` });
      setSyncStatus('success');
    } catch (error) {
      setSyncStatus('error');
    } finally {
      offlineManager.setSyncInProgress(false);
      setTimeout(() => setSyncStatus('idle'), 2000);
    }
  };

  return { syncStatus, syncToServer };
}