import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchWarehouseStock, fetchWarehouseReservations } from '@/lib/warehouseStock';

/**
 * Free warehouse stock for a line in picking = stock − what OTHER orders reserved.
 * Branch variant → network variant via source_id (the warehouse keeps stock per network variant).
 * The branch variant belongs to another account, so its source_id is looked up on the server.
 *
 * Returns an async fn(variantId) → free qty (Infinity when unknown), plus
 * fn.freeOf(variantId) → the same synchronously (null while not known yet) — used to keep
 * lines with nothing in the warehouse out of the picker's list. Refreshes every 30 s.
 */
export function usePickAvailability(warehouse, order) {
  const id = warehouse?.id;
  const stock = useQuery({ queryKey: ['warehouse-stock', id], queryFn: () => fetchWarehouseStock(id), enabled: !!id, refetchInterval: 30000 });
  const reservations = useQuery({ queryKey: ['warehouse-reservations', id], queryFn: () => fetchWarehouseReservations(id), enabled: !!id, refetchInterval: 30000 });
  const sources = useRef(new Map()); // branch variant id → network variant id
  const [, setResolved] = useState(0); // re-render once the whole order's sources are known

  // Resolve every line of the order: from the line itself when it carries the network id, else one server call
  const resolveAll = async (extraId) => {
    const items = order?.items || [];
    items.forEach(i => { if (i.variant_id && i.network_variant_id) sources.current.set(i.variant_id, i.network_variant_id); });
    const ids = [...new Set([extraId, ...items.map(i => i.variant_id)].filter(v => v && !sources.current.has(v)))];
    if (!ids.length) return true;
    try {
      const res = await base44.functions.invoke('catalogAccess', { action: 'variantSources', warehouse_id: id, variant_ids: ids });
      (res.data?.sources || []).forEach(s => sources.current.set(s.id, s.source_id || s.id));
      ids.forEach(v => { if (!sources.current.has(v)) sources.current.set(v, v); });
      return true;
    } catch {
      return false; // unknown → the caller shows no warning
    }
  };

  useEffect(() => {
    if (!id || !order?.items?.length) return;
    let off = false;
    resolveAll().then(() => { if (!off) setResolved(n => n + 1); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, order?.id, order?.items?.length]);

  const freeOfNetwork = (nid) => {
    const qty = (stock.data || []).filter(s => s.variant_id === nid).reduce((s, r) => s + Number(r.qty || 0), 0);
    const reserved = (reservations.data || [])
      .filter(r => r.item_key === nid && r.order_id !== order.id)
      .reduce((s, r) => s + Number(r.qty || 0), 0);
    return qty - reserved;
  };

  const fn = async (variantId) => {
    if (!variantId || !stock.data) return Infinity; // unknown → no warning
    if (!sources.current.has(variantId)) {
      const ok = await resolveAll(variantId);
      if (!ok) return Infinity;
    }
    const nid = sources.current.get(variantId);
    return nid ? freeOfNetwork(nid) : Infinity;
  };

  fn.freeOf = (variantId) => {
    if (!variantId || !stock.data || !reservations.data) return null;
    const nid = sources.current.get(variantId);
    return nid ? freeOfNetwork(nid) : null;
  };

  return fn;
}
