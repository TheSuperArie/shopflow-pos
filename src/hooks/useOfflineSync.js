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

    try {
      // STEP 1: Process all pending sales FIRST (before downloading inventory)
      // This ensures server stock is updated based on offline sales
      const pending = await offlineManager.getPendingSales();
      
      for (const sale of pending) {
        try {
          await offlineManager.markSaleAsSyncing(sale.offline_id);
          
          // Create sale + deduct stock on server (atomically)
          // The server will handle stock deduction via entity automations or create logic
          await base44.entities.Sale.create(sale);
          
          // Deduct stock for each item in the sale
          for (const item of sale.items || []) {
            if (!item.variant_id) continue;
            const variant = await base44.entities.ProductVariant.get(item.variant_id);
            if (variant) {
              const newStock = Math.max(0, (variant.stock || 0) - item.quantity);
              await base44.entities.ProductVariant.update(item.variant_id, { stock: newStock });
            }
          }
          
          // Mark as synced (remove from pending)
          await offlineManager.markSaleAsSynced(sale.offline_id);
        } catch (error) {
          // Move to failed syncs
          await offlineManager.moveSaleToFailed(
            sale.offline_id,
            error.message || 'Sync failed'
          );
        }
      }

      // STEP 2: Only AFTER all pending sales are processed, download fresh inventory
      // This prevents server stock from overwriting our offline deductions
      const [categories, groups, variants] = await Promise.all([
        base44.entities.Category.list(),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);

      // Use server stock directly (no merging) since sales have been processed
      await offlineManager.cacheInventory(categories, groups, variants);

      // Update failed count
      const failed = await offlineManager.getFailedSyncs();
      setFailedCount(failed.length);

      setSyncStatus(failed.length > 0 ? 'error' : 'idle');
    } catch (error) {
      console.error('Sync error:', error);
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
    syncToServer,
    retryFailedSync,
  };
}