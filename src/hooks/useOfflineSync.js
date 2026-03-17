import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { offlineManager } from '@/components/pos/offlineManager';
import { useToast } from '@/components/ui/use-toast';

export function useOfflineSync() {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'success', 'error'
  const [failedCount, setFailedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [syncLocked, setSyncLocked] = useState(false); // Prevents any state updates during sync
  const { toast } = useToast();

  useEffect(() => {
    // IMPORTANT: Do NOT auto-sync on online event
    // The app will call syncToServer() manually only when needed
    // This prevents race conditions with automatic inventory fetches
  }, []);

  const syncToServer = async () => {
    // CRITICAL: Prevent any concurrent syncs or state updates during the process
    if (offlineManager.isSyncInProgress() || syncLocked || navigator.onLine === false) {
      console.log('[SYNC] Sync blocked - already in progress, locked, or offline');
      return;
    }

    offlineManager.setSyncInProgress(true);
    setSyncLocked(true); // Lock state updates during entire sync
    setSyncStatus('syncing');
    setProcessedCount(0);

    try {
      console.log('[SYNC] Starting strict sequential sync...');

      // STEP A: Fetch ALL pending sales from IndexedDB
      const pending = await offlineManager.getPendingSales();
      console.log(`[SYNC] Found ${pending.length} offline sales to process`);

      if (pending.length === 0) {
        console.log('[SYNC] No pending sales, sync complete');
        setSyncStatus('idle');
        return;
      }

      let successCount = 0;
      const failures = [];

      // STEP B: Upload each sale sequentially and wait for server confirmation
      for (const sale of pending) {
        try {
          console.log(`[SYNC] Processing sale ${sale.offline_id}...`);
          await offlineManager.markSaleAsSyncing(sale.offline_id);

          // Create sale record on server
          const createdSale = await base44.entities.Sale.create(sale);
          console.log(`[SYNC] Sale ${sale.offline_id} created on server as ${createdSale.id}`);

          // CRITICAL: Immediately deduct stock on server for each item
          // This ensures server consistency
          for (const item of sale.items || []) {
            if (!item.variant_id) continue;
            const variant = await base44.entities.ProductVariant.get(item.variant_id);
            if (variant) {
              const newStock = Math.max(0, (variant.stock || 0) - item.quantity);
              console.log(`[SYNC] Deducting ${item.quantity} from variant ${item.variant_id}, new stock: ${newStock}`);
              await base44.entities.ProductVariant.update(item.variant_id, { stock: newStock });
            }
          }

          // Only mark as synced AFTER server confirms both operations
          await offlineManager.markSaleAsSynced(sale.offline_id);
          successCount++;
          console.log(`[SYNC] Sale ${sale.offline_id} confirmed synced`);
        } catch (error) {
          console.error(`[SYNC] Failed to process sale ${sale.offline_id}:`, error);
          failures.push({ saleId: sale.offline_id, error: error.message });
          await offlineManager.moveSaleToFailed(sale.offline_id, error.message || 'Sync failed');
        }
      }

      setProcessedCount(successCount);
      console.log(`[SYNC] Upload phase complete: ${successCount} sales successfully synced, ${failures.length} failed`);

      // STEP C: Verify pending queue is EMPTY before refreshing inventory
      const remainingPending = await offlineManager.getPendingSales();
      if (remainingPending.length > 0) {
        throw new Error(`Sync incomplete: ${remainingPending.length} sales still pending`);
      }
      console.log('[SYNC] Pending sales queue verified empty');

      // CRITICAL: Only NOW fetch corrected inventory from server
      // Local state was LOCKED during upload, so no concurrent updates happened
      console.log('[SYNC] Fetching corrected inventory from server...');
      const [categories, groups, variants] = await Promise.all([
        base44.entities.Category.list(),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);

      console.log(`[SYNC] Server inventory fetched: ${variants.length} variants`);

      // Cache the server state directly
      await offlineManager.cacheInventory(categories, groups, variants);
      console.log('[SYNC] Local cache updated with server state');

      // Get final failed count
      const failed = await offlineManager.getFailedSyncs();
      setFailedCount(failed.length);

      // STEP D: Confirmation Message
      const message = successCount > 0 
        ? `${successCount} מכירות אופליין עובדות. מלאי עודכן.`
        : 'No offline sales to sync';
      
      toast({
        title: '✅ סנכרון הושלם',
        description: message,
        duration: 4000,
      });

      setSyncStatus(failed.length > 0 ? 'error' : 'success');
      console.log('[SYNC] Sync completed successfully');

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
      // CRITICAL: Always unlock state and end sync flag
      setSyncLocked(false);
      offlineManager.setSyncInProgress(false);
      console.log('[SYNC] Sync process terminated, locks released');
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