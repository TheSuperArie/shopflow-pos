import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { offlineManager } from '@/components/pos/offlineManager';

/**
 * Subscribes to real-time ProductGroup and ProductVariant changes
 * and invalidates all relevant queries instantly.
 * CRITICAL: Skips invalidation if global sync lock is active to prevent
 * stock reversion during offline→online sync.
 */
export function useInventorySync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateAll = () => {
      // GUARD: Never invalidate during an active sync — this would trigger a
      // server fetch that overwrites locally-deducted stock before upload finishes.
      if (offlineManager.isGlobalSyncLocked() || offlineManager.isSyncInProgress()) {
        console.log('[INVENTORY_SYNC] Invalidation blocked — sync in progress');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
    };

    const unsubGroups = base44.entities.ProductGroup.subscribe(invalidateAll);
    const unsubVariants = base44.entities.ProductVariant.subscribe(invalidateAll);

    return () => {
      unsubGroups();
      unsubVariants();
    };
  }, [queryClient]);
}