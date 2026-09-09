import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { offlineManager } from '@/components/pos/offlineManager';

// Batch window: a burst of sales (each one updating stock) collapses into a single
// refetch instead of one refetch per event across every connected client.
const DEBOUNCE_MS = 4000;

/**
 * Subscribes to real-time ProductGroup and ProductVariant changes
 * and invalidates all relevant queries (debounced).
 * CRITICAL: Skips invalidation if global sync lock is active to prevent
 * stock reversion during offline→online sync.
 */
export function useInventorySync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer = null;

    const runInvalidation = () => {
      // GUARD: Never invalidate during an active sync — this would trigger a
      // server fetch that overwrites locally-deducted stock before upload finishes.
      if (offlineManager.isGlobalSyncLocked() || offlineManager.isSyncInProgress()) {
        console.log('[INVENTORY_SYNC] Invalidation blocked — sync in progress');
        return;
      }
      // Hidden tab / background window: mark stale without fetching. The data is
      // refetched when the screen becomes visible again, so background tabs stop
      // competing for bandwidth with the POS that is actively selling.
      const refetchType = document.visibilityState === 'visible' ? 'active' : 'none';
      queryClient.invalidateQueries({ queryKey: ['product-groups'], refetchType });
      queryClient.invalidateQueries({ queryKey: ['product-variants'], refetchType });
    };

    const invalidateAll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        runInvalidation();
      }, DEBOUNCE_MS);
    };

    const unsubGroups = base44.entities.ProductGroup.subscribe(invalidateAll);
    const unsubVariants = base44.entities.ProductVariant.subscribe(invalidateAll);

    return () => {
      if (timer) clearTimeout(timer);
      unsubGroups();
      unsubVariants();
    };
  }, [queryClient]);
}