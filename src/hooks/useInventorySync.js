import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Subscribes to real-time ProductGroup and ProductVariant changes
 * and invalidates all relevant queries instantly.
 * Use this in any page that displays inventory data.
 */
export function useInventorySync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateAll = () => {
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