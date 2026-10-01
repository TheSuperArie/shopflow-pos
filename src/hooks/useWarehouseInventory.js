import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNetworkCatalogRows, fetchWarehouseStock, fetchLocalProducts, fetchWarehouseReservations, stockKey } from '@/lib/warehouseStock';

/** Network catalog + warehouse-local products + current stock, merged into one list. */
export function useWarehouseInventory(warehouse) {
  const id = warehouse?.id;
  const catalog = useQuery({
    queryKey: ['warehouse-network-catalog', warehouse?.tenant_email],
    queryFn: () => fetchNetworkCatalogRows(warehouse.tenant_email),
    enabled: !!warehouse?.tenant_email,
    staleTime: 300000,
  });
  const stock = useQuery({ queryKey: ['warehouse-stock', id], queryFn: () => fetchWarehouseStock(id), enabled: !!id });
  const locals = useQuery({ queryKey: ['warehouse-local-products', id], queryFn: () => fetchLocalProducts(id), enabled: !!id });

  const reservations = useQuery({
    queryKey: ['warehouse-reservations', id],
    queryFn: () => fetchWarehouseReservations(id),
    enabled: !!id,
    refetchInterval: 60000,
  });

  const items = useMemo(() => {
    const stockBy = new Map((stock.data || []).map(s => [stockKey(s), s]));
    const out = new Map();
    (catalog.data || []).forEach(r => {
      const key = `v:${r.variant_id}`;
      out.set(key, { ...r, key, local_product_id: null, qty: Number(stockBy.get(key)?.qty || 0) });
    });
    (locals.data || []).forEach(l => {
      if (l.status === 'APPROVED' && l.linked_variant_id) return;
      const key = `l:${l.id}`;
      out.set(key, {
        key, variant_id: null, local_product_id: l.id, product_name: l.name, variant_label: l.variant_label || '',
        category_name: l.category_name || '', sku: l.sku || '', barcode: l.barcode || '', group_barcode: '',
        isLocal: true, localStatus: l.status, qty: Number(stockBy.get(key)?.qty || 0),
      });
    });
    // Stock of variants that aren't in the network catalog list (kept so nothing disappears)
    (stock.data || []).forEach(s => {
      const key = stockKey(s);
      if (out.has(key)) return;
      out.set(key, {
        key, variant_id: s.variant_id || null, local_product_id: s.local_product_id || null,
        product_name: s.product_name, variant_label: s.variant_label, category_name: s.category_name,
        sku: s.sku || '', barcode: '', group_barcode: '', qty: Number(s.qty || 0),
      });
    });
    // Reserved = confirmed in an open picking, not deducted yet. Free = in stock − reserved
    const reservedBy = new Map();
    (reservations.data || []).forEach(r => {
      const key = `v:${r.item_key}`;
      reservedBy.set(key, (reservedBy.get(key) || 0) + Number(r.qty || 0));
    });
    return [...out.values()].map(i => {
      const reserved = reservedBy.get(i.key) || 0;
      return { ...i, reserved, free: i.qty - reserved };
    });
  }, [catalog.data, stock.data, locals.data, reservations.data]);

  return {
    items,
    catalogRows: catalog.data || [],
    localProducts: locals.data || [],
    isLoading: catalog.isLoading || stock.isLoading || locals.isLoading,
  };
}