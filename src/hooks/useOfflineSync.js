import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { offlineManager } from '@/components/pos/offlineManager';
import { useToast } from '@/components/ui/use-toast';

export function useOfflineSync() {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'success', 'error'
  const [failedCount, setFailedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    // Check for online/offline changes
    const handleOnline = async () => {
      await syncToServer();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const syncToServer = async () => {
    if (offlineManager.isSyncInProgress() || navigator.onLine === false) {
      return;
    }

    offlineManager.setSyncInProgress(true);
    setSyncStatus('syncing');
    setProcessedCount(0);

    try {
      // STEP 1: Upload-First Priority - Process ALL pending sales BEFORE touching server inventory
      const pending = await offlineManager.getPendingSales();
      let successCount = 0;

      if (pending.length > 0) {
        console.log(`[SYNC] Starting upload of ${pending.length} offline sales...`);
        
        for (const sale of pending) {
          try {
            await offlineManager.markSaleAsSyncing(sale.offline_id);
            
            // Create sale record
            await base44.entities.Sale.create(sale);
            
            // CRITICAL: Immediately deduct stock for each item (server-side atomicity)
            for (const item of sale.items || []) {
              if (!item.variant_id) continue;
              const variant = await base44.entities.ProductVariant.get(item.variant_id);
              if (variant) {
                const newStock = Math.max(0, (variant.stock || 0) - item.quantity);
                await base44.entities.ProductVariant.update(item.variant_id, { stock: newStock });
              }
            }
            
            // Mark as synced (remove from pending queue)
            await offlineManager.markSaleAsSynced(sale.offline_id);
            successCount++;
          } catch (error) {
            console.error(`[SYNC] Failed to process sale ${sale.offline_id}:`, error);
            // Move to failed syncs
            await offlineManager.moveSaleToFailed(
              sale.offline_id,
              error.message || 'Sync failed'
            );
          }
        }

        console.log(`[SYNC] Upload complete: ${successCount}/${pending.length} sales processed`);
        setProcessedCount(successCount);
      }

      // STEP 2: Verify pending queue is empty before refreshing inventory
      const remainingPending = await offlineManager.getPendingSales();
      if (remainingPending.length > 0) {
        throw new Error(`Sync incomplete: ${remainingPending.length} sales still pending`);
      }

      // STEP 3: Post-Sync Refresh - Only NOW fetch corrected inventory from server
      // This ensures server stock reflects the offline sales we just processed
      console.log('[SYNC] Fetching corrected inventory from server...');
      const [categories, groups, variants] = await Promise.all([
        base44.entities.Category.list(),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);

      // Cache the server state directly (no merging - it already includes our deductions)
      await offlineManager.cacheInventory(categories, groups, variants);

      // Get final failed count
      const failed = await offlineManager.getFailedSyncs();
      setFailedCount(failed.length);

      // STEP 4: Confirmation Message
      if (successCount > 0) {
        toast({
          title: '✅ סנכרון הושלם',
          description: `${successCount} מכירות אופליין עובדות. מלאי עודכן.`,
          duration: 4000,
        });
      }

      setSyncStatus(failed.length > 0 ? 'error' : 'success');
      
      // Reset status after 2 seconds
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (error) {
      console.error('[SYNC] Critical sync error:', error);
      toast({
        title: '❌ שגיאה בסנכרון',
        description: error.message,
        variant: 'destructive',
        duration: 4000,
      });
      setSyncStatus('error');
    } finally {
      offlineManager.setSyncInProgress(false);
    }
  };

  const retryFailedSync = async (offlineId) => {
    const failed = await offlineManager.getFailedSyncs();
    const sale = failed.find(s => s.offline_id === offlineId);
    
    if (!sale) return;

    try {
      // Try to sync again
      await base44.entities.Sale.create(sale);
      
      // Clear from failed
      await offlineManager.clearFailedSync(offlineId);
      
      // Refresh failed count
      const updatedFailed = await offlineManager.getFailedSyncs();
      setFailedCount(updatedFailed.length);
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  return {
    syncStatus,
    failedCount,
    processedCount,
    syncToServer,
    retryFailedSync,
  };
}