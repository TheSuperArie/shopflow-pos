import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Supply-order helpers that need to see the whole network, while each account can only read
 * its own orders (RLS).
 *
 *  nextOrderNumber { tenant_email } → { order_number } — running number per network (1001, 1002, ...),
 *                                      for the network owner or an active station of one of its branches
 */
const lc = (s) => String(s || '').toLowerCase();

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));

    if (body.action === 'nextOrderNumber') {
      const tenant = String(body.tenant_email || '').trim();
      if (!tenant) return Response.json({ error: 'חסרה רשת' }, { status: 400 });
      if (lc(tenant) !== lc(user.email)) {
        const branches = await db.Branch.filter({ station_email: user.email, tenant_email: tenant }, undefined, 10);
        if (!branches.some(b => b.status === 'ACTIVE' || b.is_active)) {
          return Response.json({ error: 'אין הרשאה לרשת הזו' }, { status: 403 });
        }
      }
      const last = await db.SupplyOrder.filter({ tenant_email: tenant }, '-created_date', 50);
      const max = last.reduce((m, o) => Math.max(m, parseInt(o.order_number, 10) || 0), 1000);
      return Response.json({ ok: true, order_number: String(max + 1) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
