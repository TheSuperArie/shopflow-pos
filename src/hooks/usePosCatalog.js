import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { fetchPosCatalogRecords, fetchPosBranches, pickActiveBranch } from '@/lib/branchCatalog';

/**
 * The branch this device operates as — resolved exactly like the POS
 * (shares the POS query cache). branchId = null for a single store.
 */
export function usePosBranch() {
  const user = useCurrentUser();
  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['pos-branches', user?.email],
    queryFn: () => fetchPosBranches(base44.entities, user.email),
    enabled: !!user?.email,
    staleTime: 120000,
  });
  const activeBranch = pickActiveBranch(branches, user?.email);
  return { user, activeBranch, branchId: activeBranch?.id || null, ready: !!user?.email && !isLoading };
}

/**
 * Catalog query for branch-manager pages: this account's own records
 * + records the network master added for the active branch (same as the POS).
 */
export function usePosCatalogQuery(keyPrefix, entityName, { sort, limit, ...options } = {}) {
  const { user, branchId, ready } = usePosBranch();
  return useQuery({
    queryKey: [keyPrefix, user?.email, branchId],
    queryFn: () => fetchPosCatalogRecords(base44.entities[entityName], user.email, branchId, sort, limit),
    enabled: ready,
    ...options,
  });
}