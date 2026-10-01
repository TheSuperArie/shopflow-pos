import { base44 } from '@/api/base44Client';

/**
 * POS stock deduction runs on the server, keyed by client_sale_id (so a sale is deducted once,
 * even from two computers or after a resync). Sales waiting for it are kept on this computer
 * and sent in the background — the checkout never waits for it.
 */
const QUEUE_KEY = 'pos_pending_stock_sales';
const DEVICE_KEY = 'pos_device_id';

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

const read = () => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
};
const write = (list) => localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
const remove = (id) => write(read().filter(x => x !== id));

export function enqueueSaleStock(clientSaleId) {
  if (!clientSaleId) return;
  const list = read();
  if (!list.includes(clientSaleId)) write([...list, clientSaleId]);
}

let running = false;
/** Sends every waiting sale; returns how many were deducted now. */
export async function flushSaleStock() {
  if (running || !navigator.onLine) return 0;
  running = true;
  let done = 0;
  try {
    for (const id of read()) {
      try {
        await base44.functions.invoke('stockOps', { action: 'posSale', client_sale_id: id, device_id: getDeviceId() });
        remove(id);
        done += 1;
      } catch (err) {
        if (err?.response?.status === 403) remove(id); // not ours — never retried
      }
    }
  } finally {
    running = false;
  }
  return done;
}