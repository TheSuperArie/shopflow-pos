import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getDeviceId } from '@/lib/saleStockQueue';

const STALE_MS = 15 * 60 * 1000;

/**
 * Cart reservations per computer. The cart is sent to the server in the background (debounced,
 * one call at a time); nothing here ever blocks selling. Without internet nothing is sent.
 * Returns reservedByOthers(variantId) — what OTHER computers of this branch hold in their carts.
 */
export function usePosReservations({ branch, user, cartItems }) {
  const deviceId = getDeviceId();
  const stationEmail = branch?.station_email || user?.email;

  const { data: rows = [] } = useQuery({
    queryKey: ['pos-reservations', stationEmail],
    queryFn: () => base44.entities.StockReservation.filter({ scope: 'BRANCH', station_email: stationEmail }, undefined, 2000),
    enabled: !!stationEmail,
    refetchInterval: 30000,
    staleTime: 15000,
    retry: false,
  });

  const sender = useRef({ busy: false, next: null });
  const send = useCallback(async (payload) => {
    const s = sender.current;
    if (s.busy) { s.next = payload; return; }
    s.busy = true;
    try { await base44.functions.invoke('stockOps', payload); } catch { /* ignored — selling continues */ }
    s.busy = false;
    if (s.next) { const n = s.next; s.next = null; send(n); }
  }, []);

  const signature = JSON.stringify(cartItems.filter(i => i.variant_id).map(i => [i.variant_id, i.quantity]));
  useEffect(() => {
    if (!user?.email) return undefined;
    const items = JSON.parse(signature).map(([variant_id, qty]) => ({ variant_id, qty }));
    const payload = { action: 'posCart', device_id: deviceId, branch_id: branch?.id || null, items };
    const timer = setTimeout(() => { if (navigator.onLine) send(payload); }, 700);
    // Heartbeat while the cart has items, so an open cart doesn't expire after 15 minutes
    const beat = items.length ? setInterval(() => { if (navigator.onLine) send(payload); }, 5 * 60 * 1000) : null;
    return () => { clearTimeout(timer); if (beat) clearInterval(beat); };
  }, [signature, branch?.id, user?.email, deviceId, send]);

  return useCallback((variantId) => {
    const freshAfter = Date.now() - STALE_MS;
    return rows
      .filter(r => r.variant_id === variantId && r.device_id !== deviceId && new Date(r.touched_at).getTime() >= freshAfter)
      .reduce((s, r) => s + Number(r.qty || 0), 0);
  }, [rows, deviceId]);
}