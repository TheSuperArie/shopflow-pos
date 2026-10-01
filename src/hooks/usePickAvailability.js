import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchWarehouseStock, fetchWarehouseReservations } from '@/lib/warehouseStock';

/**
 * Free warehouse stock for a line in picking = stock − what OTHER orders reserved.
 * Branch variant → network variant via source_id (the warehouse keeps stock per network variant).
 */
export function usePickAvailability(warehouse, order) {
  const id = warehouse?.id;
  const stock = useQuery({ queryKey: ['warehouse-stock', id], queryFn: () => fetchWarehouseStock(id), enabled: !!id, refetchInterval: 30000 });
  const reservations = useQuery({ queryKey: ['warehouse-reservations', id], queryFn: () => fetchWarehouseReservations(id), enabled: !!id, refetchInterval: 30000 });

  return async (variantId) => {
    if (!variantId || !stock.data) return Infinity; // unknown → no warning
    const [v] = await base44.entities.ProductVariant.filter({ id: variantId });
    const nid = v?.source_id || variantId;
    const qty = (stock.data || []).filter(s => s.variant_id === nid).reduce((s, r) => s + Number(r.qty || 0), 0);
    const reserved = (reservations.data || [])
      .filter(r => r.item_key === nid && r.order_id !== order.id)
      .reduce((s, r) => s + Number(r.qty || 0), 0);
    return qty - reserved;
  };
}