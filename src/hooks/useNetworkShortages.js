import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { DEFAULT_THRESHOLD, stockStatus, thresholdFor } from '@/lib/inventory';

/**
 * For the network bell: per active branch, how many sizes are out of stock or under the
 * branch's shortage threshold (its own setting, or the product's own threshold).
 * Computed live from the branches' catalogs — nothing is written anywhere.
 */
export function useNetworkShortages(tenantEmail) {
  return useQuery({
    queryKey: ['network-shortages', tenantEmail],
    enabled: !!tenantEmail,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async () => {
      const branches = (await base44.entities.Branch.filter({ tenant_email: tenantEmail }))
        .filter(b => b.is_active !== false && (!b.status || b.status === 'ACTIVE') && b.station_email);
      if (branches.length === 0) return [];

      const [groups, variants, settings] = await Promise.all([
        fetchAllPages(base44.entities.ProductGroup, { tenant_email: tenantEmail }),
        fetchAllPages(base44.entities.ProductVariant, { tenant_email: tenantEmail }),
        base44.entities.AppSettings.filter({ tenant_email: tenantEmail }),
      ]);

      const groupById = new Map(groups.filter(g => g.is_active !== false).map(g => [g.id, g]));
      const thresholdOf = new Map(settings.map(s => [s.station_email || s.created_by, Number(s.low_stock_threshold) || DEFAULT_THRESHOLD]));

      return branches
        .map(b => {
          const global = thresholdOf.get(b.station_email) || DEFAULT_THRESHOLD;
          let low = 0;
          let out = 0;
          variants.forEach(v => {
            if (v.station_email !== b.station_email) return;
            const g = groupById.get(v.group_id);
            if (!g) return;
            const st = stockStatus(v.stock, thresholdFor(g, global));
            if (st === 'out') out += 1;
            else if (st === 'low') low += 1;
          });
          return { branchId: b.id, branchName: b.name, low, out, total: low + out };
        })
        .filter(x => x.total > 0)
        .sort((a, b) => b.total - a.total);
    },
  });
}
