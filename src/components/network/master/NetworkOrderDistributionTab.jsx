import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, subDays } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { fetchNetworkSales } from '@/lib/networkScope';
import { fetchWarehouseStock } from '@/lib/warehouseStock';
import OrderDistributionView, { localDay } from '@/components/distribution/OrderDistributionView';

/**
 * Order distribution for the whole network: sales of all the network's branches together.
 * A branch's copy of a network product is counted as the network product itself (source_id),
 * so "white shirt size 8" from every branch adds up to one line. Products a branch created on
 * its own (not in the network catalog) appear as separate lines.
 */
export default function NetworkOrderDistributionTab({ tenantEmail }) {
  const [startDate, setStartDate] = useState(() => localDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState(() => localDay(new Date()));

  const { data: branches = [], isFetched: branchesLoaded } = useQuery({
    queryKey: ['order-dist-branches', tenantEmail],
    queryFn: () => base44.entities.Branch.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
    staleTime: 300000,
  });
  const branchIds = useMemo(
    () => branches.filter(b => (b.status ? b.status === 'ACTIVE' : !!b.is_active)).map(b => b.id).sort(),
    [branches]
  );

  // Server-side date bound with a day of margin; the view filters exact Israel days
  const fromIso = `${format(subDays(new Date(startDate), 1), 'yyyy-MM-dd')}T00:00:00`;
  const toIso = `${format(addDays(new Date(endDate), 1), 'yyyy-MM-dd')}T23:59:59`;
  const { data: rawSales = [], isLoading: salesLoading } = useQuery({
    queryKey: ['order-dist-network-sales', tenantEmail, branchIds.join(','), fromIso, toIso],
    queryFn: () => fetchNetworkSales({
      branchIds,
      tenantEmail,
      includeOwn: true,
      dateQuery: { created_date: { $gte: fromIso, $lte: toIso } },
    }),
    enabled: !!tenantEmail && branchesLoaded,
    staleTime: 60000,
  });

  // The whole network's catalog (the owner's own + every branch's copies)
  const { data: allGroups = [] } = useQuery({
    queryKey: ['order-dist-network-groups', tenantEmail],
    queryFn: () => fetchAllPages(base44.entities.ProductGroup, { tenant_email: tenantEmail }, '-created_date', { label: 'מוצרים' }),
    enabled: !!tenantEmail,
    staleTime: 300000,
  });
  const { data: allVariants = [] } = useQuery({
    queryKey: ['order-dist-network-variants', tenantEmail],
    queryFn: () => fetchAllPages(base44.entities.ProductVariant, { tenant_email: tenantEmail }, '-created_date', { label: 'וריאציות' }),
    enabled: !!tenantEmail,
    staleTime: 300000,
  });

  // Fold every branch copy into its network original
  const merged = useMemo(() => {
    const vById = new Map(allVariants.map(v => [v.id, v]));
    const gById = new Map(allGroups.map(g => [g.id, g]));
    // A copy whose original was deleted is matched to an owner's product with the same name / size.
    const ownerGroups = allGroups.filter(g => String(g.created_by || '').toLowerCase() === String(tenantEmail || '').toLowerCase() && !gById.has(g.source_id));
    const groupByName = new Map(ownerGroups.map(g => [String(g.name || '').trim(), g]));
    const dimKey = (v) => JSON.stringify(Object.entries(v.dimensions || {}).sort());
    const groupOf = (gid) => {
      const g = gById.get(gid);
      if (!g) return null;
      if (g.source_id && gById.get(g.source_id)) return gById.get(g.source_id);
      if (g.source_id) return groupByName.get(String(g.name || '').trim()) || g; // original deleted
      return g;
    };
    const variantOf = (vid) => {
      const v = vById.get(vid);
      if (!v) return null;
      if (v.source_id && vById.get(v.source_id)) return vById.get(v.source_id);
      if (v.source_id) {
        // Original deleted — same size in the matching network product, if there is one
        const g = groupOf(v.group_id);
        const twin = g && g.id !== v.group_id
          ? allVariants.find(x => x.group_id === g.id && dimKey(x) === dimKey(v))
          : null;
        return twin || v;
      }
      return v;
    };
    const groups = new Map();
    const variants = new Map();
    const sales = rawSales.map(s => ({
      ...s,
      items: (s.items || []).map(it => {
        if (it.variant_id) {
          const v = variantOf(it.variant_id);
          const g = v && groupOf(v.group_id);
          if (!v || !g) return null; // product no longer in the network catalog
          groups.set(g.id, g);
          variants.set(v.id, v.group_id === g.id ? v : { ...v, group_id: g.id });
          return { ...it, variant_id: v.id, group_id: g.id };
        }
        const g = groupOf(it.group_id);
        if (!g) return null;
        groups.set(g.id, g);
        return { ...it, group_id: g.id };
      }).filter(Boolean),
    }));
    return { sales, groups: [...groups.values()], variants: [...variants.values()] };
  }, [rawSales, allGroups, allVariants, tenantEmail]);

  // Current warehouse stock per network variant (all the network's warehouses together)
  const { data: warehouses = [], isFetched: warehousesLoaded } = useQuery({
    queryKey: ['order-dist-warehouses', tenantEmail],
    queryFn: () => base44.entities.Warehouse.filter({ tenant_email: tenantEmail }),
    enabled: !!tenantEmail,
    staleTime: 300000,
  });
  const activeWarehouseIds = useMemo(
    () => warehouses.filter(w => w.status === 'ACTIVE').map(w => w.id).sort(),
    [warehouses]
  );
  const { data: stockRows = [], isLoading: stockLoading } = useQuery({
    queryKey: ['order-dist-warehouse-stock', activeWarehouseIds.join(',')],
    queryFn: async () => (await Promise.all(activeWarehouseIds.map(fetchWarehouseStock))).flat(),
    enabled: activeWarehouseIds.length > 0,
    staleTime: 60000,
  });
  const stockByVariant = useMemo(() => {
    if (!warehousesLoaded || activeWarehouseIds.length === 0) return null; // no warehouse → no stock column
    const m = new Map();
    stockRows.forEach(r => { if (r.variant_id) m.set(r.variant_id, (m.get(r.variant_id) || 0) + Number(r.qty || 0)); });
    return m;
  }, [stockRows, warehousesLoaded, activeWarehouseIds.length]);

  return (
    <OrderDistributionView
      title="חלוקת הזמנה — כל הרשת"
      description={`לפי המכירות של כל ${branchIds.length || ''} הסניפים ביחד. בחר מוצרים וטווח תאריכים, הזן כמות כוללת להזמנה — והמערכת תחלק אותה לפי אחוזי המכירה.`}
      sales={merged.sales}
      salesLoading={salesLoading || !branchesLoaded}
      groups={merged.groups}
      variants={merged.variants}
      startDate={startDate}
      endDate={endDate}
      setStartDate={setStartDate}
      setEndDate={setEndDate}
      stockByVariant={stockByVariant}
      stockLoading={stockLoading}
    />
  );
}
