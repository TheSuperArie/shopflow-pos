import { base44 } from '@/api/base44Client';

/**
 * POS stock deduction runs on the server, keyed by client_sale_id (so a sale is deducted once,
 * even from two computers or after a resync). Sales waiting for it are kept on this computer
 * and sent in the background — the checkout never waits for it.
 * A sale the server can't find is retried up to MAX_TRIES times / MAX_AGE, then moved to a
 * "stuck" list shown to the manager instead of retrying forever.
 */
const QUEUE_KEY = 'pos_pending_stock_sales';
const STUCK_KEY = 'pos_stuck_stock_sales';
const DEVICE_KEY = 'pos_device_id';
const MAX_TRIES = 10;
const MAX_AGE = 24 * 60 * 60 * 1000;

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

const load = (key) => {
  try {
    // Older entries were plain ids
    return JSON.parse(localStorage.getItem(key) || '[]').map(x => (typeof x === 'string' ? { id: x, tries: 0, since: Date.now() } : x));
  } catch { return []; }
};
const save = (key, list) => {
  localStorage.setItem(key, JSON.stringify(list));
  window.dispatchEvent(new Event('pos-stuck-stock'));
};

export function enqueueSaleStock(clientSaleId) {
  if (!clientSaleId) return;
  const list = load(QUEUE_KEY);
  if (!list.some(x => x.id === clientSaleId)) save(QUEUE_KEY, [...list, { id: clientSaleId, tries: 0, since: Date.now() }]);
}

export const getStuckSaleStock = () => load(STUCK_KEY);

/** Back to the queue (fresh tries) — the "try again" button */
export function retryStuckSaleStock() {
  const stuck = load(STUCK_KEY);
  save(STUCK_KEY, []);
  stuck.forEach(s => enqueueSaleStock(s.id));
}
export const dismissStuckSaleStock = () => save(STUCK_KEY, []);

let running = false;
/** Sends every waiting sale; returns how many were deducted now. */
export async function flushSaleStock() {
  if (running || !navigator.onLine) return 0;
  running = true;
  let done = 0;
  try {
    for (const entry of load(QUEUE_KEY)) {
      const drop = () => save(QUEUE_KEY, load(QUEUE_KEY).filter(x => x.id !== entry.id));
      try {
        await base44.functions.invoke('stockOps', { action: 'posSale', client_sale_id: entry.id, device_id: getDeviceId() });
        drop();
        done += 1;
      } catch (err) {
        const status = err?.status ?? err?.originalError?.response?.status;
        if (status !== 404 && status !== 403) continue; // network/server error — keep trying later
        const tries = (entry.tries || 0) + 1;
        // No permission → straight to the manager's stuck list (never silently dropped)
        if (status === 403 || tries >= MAX_TRIES || Date.now() - (entry.since || Date.now()) > MAX_AGE) {
          drop();
          save(STUCK_KEY, [...load(STUCK_KEY).filter(x => x.id !== entry.id), { ...entry, tries, stuck_at: Date.now() }]);
        } else {
          save(QUEUE_KEY, load(QUEUE_KEY).map(x => (x.id === entry.id ? { ...x, tries } : x)));
        }
      }
    }
  } finally {
    running = false;
  }
  return done;
}