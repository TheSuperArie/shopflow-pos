import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { offlineManager } from '@/components/pos/offlineManager';
import { useToast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'success', 'error'
  const [failedCount, setFailedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    // IMPORTANT: Do NOT auto-sync on online event
    // The app will call syncToServer() manually only when needed
    // This prevents race conditions with automatic inventory fetches
  }, []);

  const syncToServer = async () => {
    // CRITICAL: Prevent concurrent syncs or if offline
    if (offlineManager.isSyncInProgress() || offlineManager.isGlobalSyncLocked() || navigator.onLine === false) {
      console.log('[SYNC] Sync blocked - already in progress, globally locked, or offline');
      return;
    }

    // === PHASE 1: LOCK GLOBAL STATE ===
    offlineManager.setGlobalSyncLock(true);
    offlineManager.setSyncInProgress(true);
    setSyncStatus('syncing');
    setProcessedCount(0);

    try {
      console.log('[SYNC] ⏹️  STARTING SYNC - Global Lock Engaged');

      // STEP A: Fetch ALL pending sales from IndexedDB (source of truth)
      const pending = await offlineManager.getPendingSales();
      console.log(`[SYNC] 📦 Found ${pending.length} offline sales to upload`);

      if (pending.length === 0) {
        console.log('[SYNC] ✅ No pending sales, sync complete');
        setSyncStatus('idle');
        return;
      }

      let successCount = 0;
      const failures = [];

      // === PHASE 2: SEQUENTIAL UPLOAD (One at a time, wait for 200 OK) ===
      console.log('[SYNC] 🔄 PHASE 2: Uploading Sales Sequentially');
      for (const sale of pending) {
        try {
          console.log(`[SYNC] 📤 Processing sale ${sale.offline_id}...`);
          await offlineManager.markSaleAsSyncing(sale.offline_id);

          // Create sale record on server
          const createdSale = await base44.entities.Sale.create(sale);
          console.log(`[SYNC] ✅ Sale ${sale.offline_id} UPLOADED to server as ${createdSale.id}`);

          // CRITICAL: Update stock on server immediately (before moving to next sale)
          for (const item of sale.items || []) {
            if (!item.variant_id) continue;
            const variant = await base44.entities.ProductVariant.get(item.variant_id);
            if (variant) {
              const newStock = Math.max(0, (variant.stock || 0) - item.quantity);
              console.log(`[SYNC] 📊 Stock Updated: variant ${item.variant_id} | Quantity: ${item.quantity} | New Stock: ${newStock}`);
              await base44.entities.ProductVariant.update(item.variant_id, { stock: newStock });
            }
          }

          // Mark as synced ONLY after server confirms ALL operations
          await offlineManager.markSaleAsSynced(sale.offline_id);
          successCount++;
          console.log(`[SYNC] ✅ Sale ${sale.offline_id} CONFIRMED SYNCED`);
        } catch (error) {
          console.error(`[SYNC] ❌ FAILED to sync sale ${sale.offline_id}:`, error.message);
          failures.push({ saleId: sale.offline_id, error: error.message });
          await offlineManager.moveSaleToFailed(sale.offline_id, error.message || 'Sync failed');
        }
      }

      setProcessedCount(successCount);
      console.log(`[SYNC] 📋 Upload Phase Complete: ${successCount} synced, ${failures.length} failed`);

      // === PHASE 3: VERIFY QUEUE IS EMPTY ===
      console.log('[SYNC] 🔍 PHASE 3: Verifying Pending Queue');
      const remainingPending = await offlineManager.getPendingSales();
      if (remainingPending.length > 0) {
        throw new Error(`SYNC INCOMPLETE: ${remainingPending.length} sales still pending`);
      }
      console.log('[SYNC] ✅ Pending queue is EMPTY - Safe to refresh');

      // === PHASE 4: SINGLE FINAL REFRESH (with global lock still active) ===
      console.log('[SYNC] 🔄 PHASE 4: Final Inventory Refresh from Server');
      const [categories, groups, variants] = await Promise.all([
        base44.entities.Category.list(),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);
      console.log(`[SYNC] 📥 Server Inventory Fetched: ${variants.length} variants`);

      // Cache the server state while lock is still active
      await offlineManager.cacheInventory(categories, groups, variants);
      console.log('[SYNC] 💾 Local Cache Updated with Server State');

      // Push server data directly into React Query cache so UI updates immediately
      // We use setQueryData (not invalidate) to avoid triggering a new fetch while lock is still active
      // The queryKey format must match what POS.jsx uses
      const userEmail = categories[0]?.created_by || groups[0]?.created_by || null;
      const isOffline = offlineManager.isOfflineMode();
      queryClient.setQueryData(['product-variants', isOffline, userEmail], variants);
      queryClient.setQueryData(['product-groups', isOffline, userEmail], groups);
      queryClient.setQueryData(['categories', isOffline, userEmail], categories);
      console.log('[SYNC] 🖥️  React Query Cache Injected with Server Data');

      // Get final failed count
      const failed = await offlineManager.getFailedSyncs();
      setFailedCount(failed.length);

      const message = successCount > 0 
        ? `${successCount} מכירות אופליין עובדות. מלאי עודכן.`
        : 'אין מכירות לסנכרן';
      
      toast({
        title: '✅ סנכרון הושלם',
        description: message,
        duration: 4000,
      });

      setSyncStatus(failed.length > 0 ? 'error' : 'success');
      console.log('[SYNC] 🎉 SYNC COMPLETED SUCCESSFULLY');

      // Reset status after 2 seconds
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (error) {
      console.error('[SYNC] ❌ CRITICAL SYNC ERROR:', error.message);
      toast({
        title: '❌ שגיאה בסנכרון',
        description: error.message,
        variant: 'destructive',
        duration: 4000,
      });
      setSyncStatus('error');
    } finally {
      // === RELEASE ALL LOCKS ===
      console.log('[SYNC] 🔓 Releasing Global Sync Lock');
      offlineManager.setGlobalSyncLock(false);
      offlineManager.setSyncInProgress(false);
      console.log('[SYNC] 🏁 Sync Process Complete - All Locks Released');

      // Now that the lock is released, allow React Query to resume normal operation.
      // This does NOT trigger an immediate fetch because staleTime is 30s and cache was just populated.
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      console.log('[SYNC] ♻️  Query invalidation scheduled (post-lock)');
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