import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Free warehouse stock for a branch's order screen — information only (never blocks ordering).
 * The warehouse keeps stock per NETWORK variant: a branch copy points to it with source_id,
 * the owner's own branch sells the network variants themselves (key = its own id).
 * Read on the server (the branch can't read the warehouse). Refreshes every 30 s.
 *
 * Returns { freeOf(variant) → number | null (null = unknown / not a network product), hasWarehouse }.
 */
export function useWarehouseFree(branchId, variants = []) {
  const keys = useMemo(
    () => [...new Set(variants.map(v => v.source_id || v.id).filter(Boolean))].sort(),
    [variants]
  );
  const { data } = useQuery({
    queryKey: ['warehouse-free', branchId, keys.length, keys[0], keys[keys.length - 1]],
    queryFn: async () => (await base44.functions.invoke('catalogAccess', { action: 'warehouseFree', branch_id: branchId, keys })).data,
    enabled: !!branchId && keys.length > 0,
    refetchInterval: 30000,
    staleTime: 20000,
    retry: false,
  });
  const free = data?.free || {};
  return {
    hasWarehouse: !!data?.has_warehouse,
    freeOf: (v) => {
      if (!data?.has_warehouse || !v) return null;
      const k = v.source_id || v.id;
      return k in free ? free[k] : null;
    },
  };
}
