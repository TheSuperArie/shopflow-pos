import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { offlineManager } from '@/components/pos/offlineManager';

export function useOfflineSync() {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'error'
  const [failedCount, setFailedCount] = useState(0);

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
      // 1. Upload pending sales (FIFO order)
      const pending = await offlineManager.getPendingSales();
      
      for (const sale of pending) {
        try {
          await offlineManager.markSaleAsSyncing(sale.offline_id);
          
          // Create sale in database
          await base44.entities.Sale.create(sale);
          
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

      // 2. Download latest inventory (bi-directional)
      const [categories, groups, variants] = await Promise.all([
        base44.entities.Category.list(),
        base44.entities.ProductGroup.list(),
        base44.entities.ProductVariant.list(),
      ]);

      // Merge local stock with server stock (local takes priority if offline was on)
      const cachedInventory = await offlineManager.getCachedInventory();
      const mergedVariants = variants.map(serverVar => {
        const localVar = cachedInventory.variants.find(v => v.id === serverVar.id);
        // If we had local changes during offline, keep them
        // Otherwise use server version
        return localVar ? { ...serverVar, stock: localVar.stock } : serverVar;
      });

      await offlineManager.cacheInventory(categories, groups, mergedVariants);

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