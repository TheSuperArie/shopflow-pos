import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePosBranch, usePosCatalogQuery } from '@/hooks/usePosCatalog';
import { DEFAULT_THRESHOLD, stockStatus, thresholdFor } from '@/lib/inventory';

/** How many sizes of this store / branch are out of stock or under their threshold. */
export function useShortageCount() {
  const { user } = usePosBranch();
  const { data: groups = [] } = usePosCatalogQuery('product-groups', 'ProductGroup');
  const { data: variants = [] } = usePosCatalogQuery('product-variants', 'ProductVariant');
  const { data: threshold = DEFAULT_THRESHOLD } = useQuery({
    queryKey: ['inventory-threshold', user?.email],
    queryFn: async () => {
      const [s] = await base44.entities.AppSettings.filter({ created_by: user.email }, undefined, 1);
      return s?.low_stock_threshold || DEFAULT_THRESHOLD;
    },
    enabled: !!user?.email,
    staleTime: 300000,
  });

  return useMemo(() => {
    const byId = new Map(groups.filter(g => g.is_active !== false).map(g => [g.id, g]));
    return variants.reduce((n, v) => {
      const g = byId.get(v.group_id);
      if (!g) return n;
      return stockStatus(v.stock, thresholdFor(g, threshold)) === 'ok' ? n : n + 1;
    }, 0);
  }, [groups, variants, threshold]);
}
