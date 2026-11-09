import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { actingUser } from '../../shared/acting.ts';
import { createTrust, LEGACY_CUTOFF, parseServerDate } from '../../shared/trust.ts';

/**
 * Network links (branch station ⇄ network owner, warehouse account ⇄ network owner).
 * Accepting / declining an invitation goes through here, so the acceptance is recorded by the
 * server (NetworkMembership, service-only) and can't be forged by the owner — and an invitation
 * that the owner didn't really send (a row someone else typed in) can't be accepted at all.
 *
 *  accept  { kind: 'branch' | 'warehouse', id }  → the station accepts (status ACTIVE)
 *  decline { kind, id }                          → the station declines (status REJECTED)
 *  mine    {}                                    → { branches, warehouses } the caller is the
 *                                                  confirmed, active station of
 */
const lc = (s: unknown) => String(s || '').trim().toLowerCase();
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const realUser = await base44.auth.me();
    if (!realUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;
    const trust = createTrust(base44);

    if (body.action === 'mine') {
      // A network manager sees what the owner sees
      const user = await actingUser(base44, realUser);
      const me = lc(user.email);
      const [branches, warehouses] = await Promise.all([
        db.Branch.filter({ station_email: user.email }, undefined, 50),
        db.Warehouse.filter({ station_email: user.email }, undefined, 20),
      ]);
      const own = (rows: any[]) => (rows || []).filter(r => lc(r.station_email) === me);
      return Response.json({
        ok: true,
        branches: await trust.confirmedLive('branch', own(branches)),
        warehouses: await trust.confirmedLive('warehouse', own(warehouses)),
      });
    }

    if (body.action !== 'accept' && body.action !== 'decline') throw httpError(400, 'Unknown action');

    const kind = body.kind === 'warehouse' ? 'warehouse' : body.kind === 'branch' ? 'branch' : null;
    if (!kind) throw httpError(400, 'סוג לא תקין');
    if (!body.id || typeof body.id !== 'string') throw httpError(400, 'חסר מזהה');
    const entity = kind === 'branch' ? db.Branch : db.Warehouse;
    const [link] = await entity.filter({ id: body.id }, undefined, 1);
    if (!link) throw httpError(404, 'ההזמנה לא נמצאה');

    // Only the invited account itself answers (never a manager acting for someone else)
    const me = lc(realUser.email);
    if (lc(link.station_email) !== me) throw httpError(403, 'ההזמנה הזו לא מיועדת לחשבון הזה');
    const tenant = lc(link.tenant_email);
    if (!tenant) throw httpError(409, 'ההזמנה לא שייכת לרשת');

    if (body.action === 'decline') {
      await entity.update(link.id, { status: 'REJECTED', is_active: false });
      const rows = await db.NetworkMembership.filter({ link_id: link.id, kind }, undefined, 20).catch(() => []);
      for (const m of rows || []) await db.NetworkMembership.update(m.id, { status: 'REVOKED' });
      return Response.json({ ok: true });
    }

    // accept: the invitation must really come from the network owner…
    if (!(await trust.isTenantAuthored(link))) throw httpError(403, 'ההזמנה לא נשלחה על ידי בעל הרשת');
    // …and, for a branch, must have passed the developer's approval
    if (kind === 'branch') {
      const sa = link.system_approval;
      const legacy = parseServerDate(link.created_date) < LEGACY_CUTOFF;
      if (sa === 'PENDING_SYSTEM' || sa === 'REJECTED' || (!sa && !legacy)) {
        throw httpError(403, 'ההזמנה עוד לא אושרה על ידי המערכת');
      }
    }
    if (link.status === 'REJECTED') throw httpError(409, 'ההזמנה נדחתה — בקשו מבעל הרשת לשלוח הזמנה חדשה');

    const existing = await db.NetworkMembership.filter({ link_id: link.id, kind }, undefined, 20).catch(() => []);
    const same = (existing || []).find((m: any) => lc(m.station_email) === me && lc(m.tenant_email) === tenant);
    if (same) {
      if (same.status === 'REVOKED') await db.NetworkMembership.update(same.id, { status: 'ACTIVE', accepted_at: new Date().toISOString() });
    } else {
      await db.NetworkMembership.create({
        kind, link_id: link.id, station_email: me, tenant_email: tenant, status: 'ACTIVE', accepted_at: new Date().toISOString(),
      });
    }
    const updated = await entity.update(link.id, { status: 'ACTIVE', is_active: true });
    return Response.json({ ok: true, link: updated });
  } catch (error: any) {
    const status = error?.status || 500;
    if (status >= 500) console.error('networkMembership', error);
    return Response.json({ error: status >= 500 ? 'Server error' : error.message }, { status });
  }
}
