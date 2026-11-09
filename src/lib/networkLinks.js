/**
 * Security (BOLA): which Branch / Warehouse links this account really accepted.
 *
 * Any signed-in account can create a Branch row with any station_email / tenant_email, so a row
 * naming this account as its station proves nothing — a stranger could otherwise make this POS
 * stamp its sales with the stranger's network (and so hand them over). The server
 * (base44/functions/networkMembership) answers which links were created by the network owner AND
 * accepted by this account; station-side code only trusts those.
 *
 * Returns { branches: Set<id>, warehouses: Set<id> }, or null when the answer is unknown
 * (offline before the first check) — callers then keep using the row's own status.
 */
const CACHE_KEY = 'shopflow_links_v1';
const TTL_MS = 5 * 60 * 1000;
const memo = new Map();

const toSets = (b, w) => ({ branches: new Set(b || []), warehouses: new Set(w || []) });

export function confirmedLinkIds(client, email) {
  if (!email) return Promise.resolve(null);
  const hit = memo.get(email);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async () => {
    try {
      const res = await client.functions.invoke('networkMembership', { action: 'mine' });
      const data = res?.data || {};
      const branches = (data.branches || []).map(b => b.id);
      const warehouses = (data.warehouses || []).map(w => w.id);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ email, branches, warehouses })); } catch { /* storage blocked */ }
      return toSets(branches, warehouses);
    } catch {
      memo.delete(email);
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && cached.email === email) return toSets(cached.branches, cached.warehouses);
      } catch { /* no cache */ }
      return null;
    }
  })();
  memo.set(email, { at: Date.now(), promise });
  return promise;
}

/** Forget the cached answer (after accepting / declining an invitation). */
export function resetConfirmedLinks() {
  memo.clear();
}

/** Only the rows this account accepted (all rows when the answer is unknown). */
export function keepConfirmed(rows, ids, kind = 'branches') {
  const list = rows || [];
  return ids ? list.filter(r => r && ids[kind].has(r.id)) : list;
}

/** Active branches this account is the accepted station of. */
export async function fetchStationBranches(client, email, query = { is_active: true, status: 'ACTIVE' }) {
  const [rows, ids] = await Promise.all([
    client.entities.Branch.filter({ station_email: email, ...query }),
    confirmedLinkIds(client, email),
  ]);
  return keepConfirmed(rows, ids);
}

/** This account's Warehouse rows — an ACTIVE one only when this account accepted it (PENDING ones are invitations). */
export async function fetchMyWarehouses(client, email) {
  const [rows, ids] = await Promise.all([
    client.entities.Warehouse.filter({ station_email: email }),
    confirmedLinkIds(client, email),
  ]);
  return rows.filter(w => w.status !== 'ACTIVE' || !ids || ids.warehouses.has(w.id));
}
