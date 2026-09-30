import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePosBranch, usePosCatalogQuery } from '@/hooks/usePosCatalog';
import { fetchBranchCatalogRecords } from '@/lib/branchCatalog';
import { filterBranchScoped } from '@/hooks/useCurrentBranch';
import { fetchBranchScoped } from '@/lib/branchScope';
import { DEFAULT_THRESHOLD } from '@/lib/inventory';

/**
 * Inventory data for one branch, from either side:
 *  - branch = undefined → the logged-in store / branch (same queries and cache as the POS pages)
 *  - branch = Branch    → the network master looking at that branch
 * Both read and write the same ProductVariant stock the branch POS sells from.
 */
export function useInventoryData(branch) {
  const queryClient = useQueryClient();
  const networkMode = !!branch;
  const { user, branchId: posBranchId, ready } = usePosBranch();

  // ── branch side (shares the POS cache keys) ──
  const posCats = usePosCatalogQuery('categories', 'Category', { sort: 'sort_order', enabled: !networkMode && ready });
  const posGroups = usePosCatalogQuery('product-groups', 'ProductGroup', { enabled: !networkMode && ready });
  const posVariants = usePosCatalogQuery('product-variants', 'ProductVariant', { enabled: !networkMode && ready });

  // ── network side ──
  const netCats = useQuery({
    queryKey: ['branch-catalog-categories', branch?.id],
    queryFn: () => fetchBranchCatalogRecords(base44.entities.Category, branch, 'sort_order'),
    enabled: networkMode,
  });
  const netGroups = useQuery({
    queryKey: ['branch-catalog-groups', branch?.id],
    queryFn: () => fetchBranchCatalogRecords(base44.entities.ProductGroup, branch),
    enabled: networkMode,
  });
  const netVariants = useQuery({
    queryKey: ['branch-stock-variants', branch?.id],
    queryFn: () => fetchBranchCatalogRecords(base44.entities.ProductVariant, branch),
    enabled: networkMode,
  });

  const settingsEmail = networkMode ? branch?.station_email : user?.email;
  const { data: threshold = DEFAULT_THRESHOLD } = useQuery({
    queryKey: ['inventory-threshold', settingsEmail],
    queryFn: async () => {
      const [s] = await base44.entities.AppSettings.filter({ created_by: settingsEmail }, undefined, 1);
      return s?.low_stock_threshold || DEFAULT_THRESHOLD;
    },
    enabled: !!settingsEmail,
    staleTime: 300000,
  });

  const branchId = networkMode ? branch.id : posBranchId;

  const historyQuery = useQuery({
    queryKey: ['inventory-history', networkMode ? branch?.id : user?.email, branchId],
    queryFn: () => (networkMode
      ? fetchBranchScoped(base44.entities.StockUpdate, branch, {}, '-created_date', 300)
      : filterBranchScoped(base44.entities.StockUpdate, branchId, user.email, {}, '-created_date', 300)),
    enabled: networkMode ? !!branch?.id : (ready && !!user?.email),
  });

  const pick = (a, b) => (networkMode ? b : a);
  const cats = pick(posCats, netCats);
  const groups = pick(posGroups, netGroups);
  const variants = pick(posVariants, netVariants);

  const invalidate = () => {
    if (networkMode) {
      queryClient.invalidateQueries({ queryKey: ['branch-stock-variants', branch.id] });
      queryClient.invalidateQueries({ queryKey: ['branch-catalog-groups', branch.id] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['product-variants'] });
      queryClient.invalidateQueries({ queryKey: ['product-groups'] });
    }
    queryClient.invalidateQueries({ queryKey: ['inventory-history'] });
  };

  return {
    networkMode,
    branchId,
    categories: cats.data || [],
    groups: groups.data || [],
    variants: variants.data || [],
    threshold,
    history: historyQuery.data || [],
    historyLoading: historyQuery.isLoading,
    isLoading: networkMode
      ? netGroups.isLoading || netVariants.isLoading
      : !ready || posGroups.isPending || posVariants.isPending,
    invalidate,
    refetch: () => { cats.refetch?.(); groups.refetch?.(); variants.refetch?.(); },
  };
}
