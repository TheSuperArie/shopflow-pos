import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchWarehouseStock, fetchWarehouseReservations } from '@/lib/warehouseStock';

/**
 * Free warehouse stock for a line in picking = stock − what OTHER orders reserved.
 * Branch variant → network variant via source_id (the warehouse keeps stock per network variant).
 * The branch variant belongs to another account, so its source_id is looked up on the server.
 */
export function usePickAvailability(warehouse, order) {
  const id = warehouse?.id;
  const stock = useQuery({ queryKey: ['warehouse-stock', id], queryFn: () => fetchWarehouseStock(id), enabled: !!id, refetchInterval: 30000 });
  const reservations = useQuery({ queryKey: ['warehouse-reservations', id], queryFn: () => fetchWarehouseReservations(id), enabled: !!id, refetchInterval: 30000 });
  const sources = useRef(new Map()); // branch variant id → network variant id

  const networkIdOf = async (variantId) => {
    if (sources.current.has(variantId)) return sources.current.get(variantId);
    // The order line usually carries it already
    const line = (order?.items || []).find(i => i.variant_id === variantId && i.network_variant_id);
    if (line) { sources.current.set(variantId, line.network_variant_id); return line.network_variant_id; }
    // Otherwise ask the server — whole order at once, one request instead of one per scanned line
    const ids = [...new Set([variantId, ...(order?.items || []).map(i => i.variant_id)].filter(v => v && !sources.current.has(v)))];
    try {
      const res = await base44.functions.invoke('catalogAccess', { action: 'variantSources', warehouse_id: id, variant_ids: ids });
      (res.data?.sources || []).forEach(s => sources.current.set(s.id, s.source_id || s.id));
    } catch {
      return null; // unknown → the caller shows no warning
    }
    if (!sources.current.has(variantId)) sources.current.set(variantId, variantId);
    return sources.current.get(variantId);
  };

  return async (variantId) => {
    if (!variantId || !stock.data) return Infinity; // unknown → no warning
    const nid = await networkIdOf(variantId);
    if (!nid) return Infinity;
    const qty = (stock.data || []).filter(s => s.variant_id === nid).reduce((s, r) => s + Number(r.qty || 0), 0);
    const reserved = (reservations.data || [])
      .filter(r => r.item_key === nid && r.order_id !== order.id)
      .reduce((s, r) => s + Number(r.qty || 0), 0);
    return qty - reserved;
  };
}