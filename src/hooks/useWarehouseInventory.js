import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNetworkCatalogRows, fetchWarehouseStock, fetchLocalProducts, stockKey } from '@/lib/warehouseStock';

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
    return [...out.values()];
  }, [catalog.data, stock.data, locals.data]);

  return {
    items,
    catalogRows: catalog.data || [],
    localProducts: locals.data || [],
    isLoading: catalog.isLoading || stock.isLoading || locals.isLoading,
  };
}