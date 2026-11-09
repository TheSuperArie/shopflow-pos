import { addUser, resetDb, seed } from '../mock/sdk.ts';

export const OWNER = 'owner@net.test';        // network owner (victim)
export const STATION = 'station@net.test';    // the owner's real branch station
export const WH = 'warehouse@net.test';       // the owner's real warehouse account
export const ATTACKER = 'attacker@evil.test'; // any other signed-in account
export const OTHER = 'other@net2.test';       // a second, unrelated network owner
export const DELEGATE = 'manager@net.test';   // the owner's authorized network manager
export const ADMIN = 'dev@app.test';          // Base44 app admin (the developer)

export const BEFORE_CUTOFF = '2026-01-01T10:00:00.000';

/** Calls a backend function as `user` (null = signed out). */
export async function call(fn: (req: Request) => Promise<Response>, user: string | null, body: unknown = {}, headers: Record<string, string> = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  if (user) h.set('x-test-user', user);
  const res = await fn(new Request('https://fn.test/', { method: 'POST', headers: h, body: JSON.stringify(body) }));
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

/** A small, realistic world: one network with an accepted branch + warehouse, plus outsiders. */
export function world() {
  resetDb();
  for (const e of [OWNER, STATION, WH, ATTACKER, OTHER, DELEGATE]) addUser(e);
  addUser(ADMIN, { role: 'admin' });

  // Owner's codes / payment settings, and the manager record (service-only table)
  seed('AdminSecret', { owner_email: OWNER, admin_password: '5555', network_admin_password: '7777', nedarim_enabled: true, nedarim_mosad: '1234567', nedarim_api_valid: 'SECRET-OWNER-KEY' });
  seed('AdminSecret', { owner_email: DELEGATE, delegate_of: OWNER });

  // Legit branch: invited by the owner, approved by the system, accepted by the station (membership)
  const branch = seed('Branch', {
    name: 'Main', tenant_email: OWNER, station_email: STATION, status: 'ACTIVE', is_active: true, system_approval: 'APPROVED',
  }, { as: OWNER });
  seed('NetworkMembership', { kind: 'branch', link_id: branch.id, station_email: STATION, tenant_email: OWNER, status: 'ACTIVE' });

  // Legit warehouse
  const warehouse = seed('Warehouse', { name: 'WH', tenant_email: OWNER, station_email: WH, status: 'ACTIVE', is_active: true }, { as: OWNER });
  seed('NetworkMembership', { kind: 'warehouse', link_id: warehouse.id, station_email: WH, tenant_email: OWNER, status: 'ACTIVE' });

  // Owner catalog
  const group = seed('ProductGroup', { name: 'Shirt', is_active: true, tenant_email: OWNER, station_email: OWNER }, { as: OWNER });
  const variant = seed('ProductVariant', { group_id: group.id, stock: 10, cost_price: 12, tenant_email: OWNER, station_email: OWNER }, { as: OWNER });

  // Other network's private data
  const otherVariant = seed('ProductVariant', { group_id: 'x', stock: 3, cost_price: 99, tenant_email: OTHER, station_email: OTHER }, { as: OTHER });
  const otherSale = seed('Sale', { total_amount: 500, client_sale_id: 'other-sale-1', station_email: OTHER, tenant_email: OTHER, items: [] }, { as: OTHER });

  return { branch, warehouse, group, variant, otherVariant, otherSale };
}
