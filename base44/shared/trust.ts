/**
 * Server-side trust checks for cross-account links (security — BOLA / IDOR).
 *
 * Every signed-in account can CREATE rows in most tables (RLS create: true) and may write any
 * value into station_email / tenant_email / acting_owner. So those fields alone never prove that
 * a network owner and a station really agreed to be linked. This module decides what to trust:
 *
 *  • A Branch / Warehouse link is "authored by the network owner" only when the owner created it
 *    (created_by = tenant_email), or when the owner's authorized network manager created it through
 *    networkDelegate (service account + acting_owner + verified delegate_email).
 *
 *  • The STATION side of a link is trusted only after the station itself accepted it:
 *      – a NetworkMembership row (written only by the server, function networkMembership), or
 *      – the station's own INVITE_ACCEPTED NetworkAlert (accepted with the older client — the
 *        alert's created_by is set by the server and cannot be forged by the owner), or
 *      – a link created before LEGACY_CUTOFF that is ACTIVE (existing networks keep working), or
 *      – the owner's own self branch (station = tenant).
 *
 *  • acting_owner on any row is honoured only when it was written by a verified network manager of
 *    that owner (never when a regular account typed it into its own record).
 */
const lc = (s: unknown) => String(s || '').trim().toLowerCase();

/** Links created before this moment were made by the old client and are grandfathered when ACTIVE. */
export const LEGACY_CUTOFF = Date.parse('2026-11-09T00:00:00Z');

/** Server timestamps come back as UTC without a "Z". */
export const parseServerDate = (v: unknown): number => {
  if (!v) return NaN;
  let s = String(v);
  if (s.length > 10 && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  return Date.parse(s);
};

export const isLiveBranch = (b: any) => !!b && b.is_active !== false && (!b.status || b.status === 'ACTIVE');
export const isLiveWarehouse = (w: any) => !!w && (w.status === 'ACTIVE' || (!w.status && w.is_active !== false));

export type LinkKind = 'branch' | 'warehouse';

export function createTrust(base44: any, opts: { readOnly?: boolean } = {}) {
  const db = base44.asServiceRole.entities;
  const delegateCache = new Map<string, Promise<string | null>>();
  const userCache = new Map<string, Promise<any>>();
  const membershipCache = new Map<string, Promise<any[]>>();

  const delegateOwner = (email: string) => {
    const me = lc(email);
    if (!me) return Promise.resolve(null);
    if (!delegateCache.has(me)) {
      delegateCache.set(me, (async () => {
        const rows = await db.AdminSecret.filter({ owner_email: me }, 'created_date', 5);
        const owner = (rows || []).map((r: any) => lc(r.delegate_of)).find(Boolean);
        return owner && owner !== me ? owner : null;
      })());
    }
    return delegateCache.get(me)!;
  };

  const userByEmail = (email: string) => {
    const e = lc(email);
    if (!userCache.has(e)) {
      userCache.set(e, db.User.filter({ email: e }, undefined, 1).then((r: any[]) => (r || [])[0] || null).catch(() => null));
    }
    return userCache.get(e)!;
  };

  /**
   * The owner an acting_owner row really belongs to, or null when the mark is forged.
   * Honoured only when delegate_email is a manager of that owner AND the row was not typed in by
   * some other regular account (records a manager creates are made by the service account).
   */
  const actingOwnerOf = async (r: any): Promise<string | null> => {
    const owner = lc(r?.acting_owner);
    const delegate = lc(r?.delegate_email);
    if (!owner || !delegate) return null;
    if ((await delegateOwner(delegate)) !== owner) return null;
    const creator = lc(r.created_by);
    if (creator && creator !== owner && creator !== delegate) {
      const u = await userByEmail(creator);
      if (u && u.role !== 'admin') return null; // a regular account wrote acting_owner itself
    }
    return owner;
  };

  /** Was this row created by `email` (directly, or for it by its verified network manager)? */
  const authoredBy = async (r: any, email: string): Promise<boolean> => {
    const e = lc(email);
    if (!r || !e) return false;
    if (lc(r.created_by) === e) return true;
    return (await actingOwnerOf(r)) === e;
  };

  /** Drops forged acting_owner marks (so asOwnerRows can't relabel someone else's row). */
  const cleanActing = async (rows: any[]): Promise<any[]> => Promise.all((rows || []).map(async (r) => {
    if (!r || !r.acting_owner) return r;
    if (await actingOwnerOf(r)) return r;
    const { acting_owner: _a, delegate_email: _d, ...rest } = r;
    return rest;
  }));

  /** Rows from an ownedBy(email) query that really belong to `email`. */
  const ownedRows = async (rows: any[], email: string): Promise<any[]> => {
    const e = lc(email);
    return (await cleanActing(rows)).filter(r => r && (lc(r.created_by) === e || lc(r.acting_owner) === e));
  };

  const membershipsOf = (kind: LinkKind, link: any) => {
    const key = `${kind}:${link.id}`;
    if (!membershipCache.has(key)) {
      membershipCache.set(key, db.NetworkMembership.filter({ link_id: link.id, kind }, undefined, 20).catch(() => []));
    }
    return membershipCache.get(key)!;
  };
  const matches = (m: any, link: any) =>
    lc(m.station_email) === lc(link.station_email) && lc(m.tenant_email) === lc(link.tenant_email);

  const hasMembership = async (kind: LinkKind, link: any) =>
    ((await membershipsOf(kind, link)) || []).some((m: any) => m.status !== 'REVOKED' && matches(m, link));

  /** Records the station/owner pair a legacy link was trusted with, so a later edit of station_email needs a new acceptance. */
  const snapshot = async (kind: LinkKind, link: any) => {
    if (opts.readOnly) return;
    try {
      const row = await db.NetworkMembership.create({
        kind, link_id: link.id, station_email: lc(link.station_email), tenant_email: lc(link.tenant_email),
        status: 'ACTIVE', accepted_at: new Date().toISOString(), legacy: true,
      });
      membershipCache.set(`${kind}:${link.id}`, Promise.resolve([row]));
    } catch { /* trusted anyway this time; recorded next time */ }
  };

  /** The station's own acceptance alert from the older client (created_by is set by the server). */
  const hasAcceptAlert = async (kind: LinkKind, link: any) => {
    const station = lc(link.station_email);
    const rows = await db.NetworkAlert.filter({ tenant_email: link.tenant_email, type: 'INVITE_ACCEPTED' }, '-created_date', 200).catch(() => []);
    return (rows || []).some((a: any) => lc(a.created_by) === station && (kind === 'warehouse' || a.branch_id === link.id));
  };

  /** The network owner really made this Branch / Warehouse (it is not a row someone else typed in). */
  const isTenantAuthored = async (link: any) => {
    const tenant = lc(link?.tenant_email);
    return !!tenant && authoredBy(link, tenant);
  };

  /** Both sides agreed: authored by the owner, accepted by the station. Status is NOT checked here. */
  const isConfirmedLink = async (kind: LinkKind, link: any): Promise<boolean> => {
    if (!link?.id) return false;
    const tenant = lc(link.tenant_email);
    const station = lc(link.station_email);
    if (!tenant || !station) return false;
    if (!(await isTenantAuthored(link))) return false;
    if (station === tenant) return true;
    const memberships = (await membershipsOf(kind, link)) || [];
    if (memberships.some((m: any) => m.status !== 'REVOKED' && matches(m, link))) return true;
    // Accepted before (by another station / pair) or revoked → this pair needs a new acceptance
    if (memberships.length) return false;
    // Links from before NetworkMembership existed
    const live = kind === 'branch' ? isLiveBranch(link) : isLiveWarehouse(link);
    if (!live) return false;
    const created = parseServerDate(link.created_date);
    const legacy = (Number.isFinite(created) && created < LEGACY_CUTOFF) || await hasAcceptAlert(kind, link);
    if (legacy) await snapshot(kind, link);
    return legacy;
  };

  /** `email` is the accepted, active station of this link. */
  const isStationOf = async (kind: LinkKind, link: any, email: string) => {
    if (!link || lc(link.station_email) !== lc(email)) return false;
    const live = kind === 'branch' ? isLiveBranch(link) : isLiveWarehouse(link);
    return live && isConfirmedLink(kind, link);
  };

  /** `email` is the network owner who created this link. */
  const isTenantOf = async (link: any, email: string) =>
    !!link && lc(link.tenant_email) === lc(email) && isTenantAuthored(link);

  /** Of these links, only the ones confirmed by both sides (and active). */
  const confirmedLive = async (kind: LinkKind, links: any[]) => {
    const live = kind === 'branch' ? isLiveBranch : isLiveWarehouse;
    const out: any[] = [];
    for (const l of links || []) if (live(l) && await isConfirmedLink(kind, l)) out.push(l);
    return out;
  };

  return {
    delegateOwner, actingOwnerOf, authoredBy, cleanActing, ownedRows,
    isTenantAuthored, isConfirmedLink, isStationOf, isTenantOf, confirmedLive, hasMembership,
  };
}

/** Constant-time string comparison (secrets, codes, keys). */
export const safeEqual = (a: unknown, b: unknown) => {
  const x = String(a ?? ''), y = String(b ?? '');
  if (!x || !y || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
};
