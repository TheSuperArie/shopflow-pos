import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { guardDevCode, getDevSettings } from '../../shared/devCode.ts';

async function setUserStatus(base44, email, status) {
  const users = await base44.asServiceRole.entities.User.filter({ email });
  for (const u of users) {
    await base44.asServiceRole.entities.User.update(u.id, { access_status: status });
  }
  return users.length;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, code } = body;

    // ── Actions available to the signed-in account itself ───────────────
    if (action === 'status') {
      // Access is decided ONLY by User.access_status (set by the developer).
      // An account with no status is not approved.
      const status = user.access_status || 'none';

      // The request record is returned for display purposes only.
      const myRequests = await base44.asServiceRole.entities.AccessRequest.filter({ account_email: user.email }, '-created_date', 1);
      const request = myRequests[0] || null;

      return Response.json({ ok: true, status, request, email: user.email, full_name: user.full_name || '' });
    }

    if (action === 'submit') {
      const full_name = String(body.full_name || '').trim();
      const phone = String(body.phone || '').trim();
      const email = String(body.email || '').trim();
      if (!full_name || !phone || !email) {
        return Response.json({ error: 'יש למלא שם, טלפון ומייל' }, { status: 400 });
      }

      const existing = await base44.asServiceRole.entities.AccessRequest.filter({ account_email: user.email }, '-created_date', 1);
      if (existing.length > 0 && existing[0].status === 'pending') {
        return Response.json({ ok: true, status: 'pending', request: existing[0] });
      }

      const request = await base44.asServiceRole.entities.AccessRequest.create({
        full_name, phone, email, account_email: user.email, status: 'pending',
      });
      await setUserStatus(base44, user.email, 'pending');

      const settings = await getDevSettings(base44);
      if (settings.dev_email) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: settings.dev_email,
            subject: 'בקשת גישה חדשה לאתר',
            body: `בקשת גישה חדשה:\n\nשם: ${full_name}\nטלפון: ${phone}\nמייל: ${email}\nחשבון מחובר: ${user.email}\nתאריך: ${new Date().toLocaleString('he-IL')}\n\nאשר או דחה בדף המפתחים.`,
          });
        } catch (e) {
          // הבקשה נוצרה גם אם המייל נכשל
        }
      }

      return Response.json({ ok: true, status: 'pending', request });
    }

    // ── Developer actions — require the developer code (rate limited) ────
    const guard = await guardDevCode(base44, user.email, code);
    if (!guard.ok) return Response.json({ error: guard.message }, { status: guard.status });
    const devRecord = guard.record;

    const sr = base44.asServiceRole.entities;

    if (action === 'list') {
      const [requests, users, branches] = await Promise.all([
        sr.AccessRequest.list('-created_date', 500),
        sr.User.list('-created_date', 1000),
        sr.Branch.filter({ system_approval: 'PENDING_SYSTEM' }, '-created_date', 200),
      ]);
      return Response.json({
        ok: true,
        requests,
        accounts: users.map(u => ({
          id: u.id, email: u.email, full_name: u.full_name,
          access_status: u.access_status || null, created_date: u.created_date,
        })),
        pendingInvites: branches,
        dev_email: devRecord.dev_email || '',
      });
    }

    if (action === 'decide') {
      const { request_id, decision } = body; // decision: approved | rejected
      const request = await sr.AccessRequest.list('-created_date', 500).then(rs => rs.find(r => r.id === request_id));
      if (!request) return Response.json({ error: 'בקשה לא נמצאה' }, { status: 404 });
      await sr.AccessRequest.update(request.id, { status: decision, decided_at: new Date().toISOString() });
      await setUserStatus(base44, request.account_email || request.email, decision);
      return Response.json({ ok: true });
    }

    if (action === 'setAccountStatus') {
      const { email, status } = body; // approved | blocked
      const updated = await setUserStatus(base44, email, status);
      const reqs = await sr.AccessRequest.filter({ account_email: email }, '-created_date', 1);
      if (reqs[0]) await sr.AccessRequest.update(reqs[0].id, { status, decided_at: new Date().toISOString() });
      return Response.json({ ok: true, updated });
    }

    if (action === 'decideInvite') {
      const { branch_id, decision } = body; // APPROVED | REJECTED
      const branches = await sr.Branch.filter({ system_approval: 'PENDING_SYSTEM' }, '-created_date', 200);
      const branch = branches.find(b => b.id === branch_id);
      if (!branch) return Response.json({ error: 'הצעה לא נמצאה' }, { status: 404 });
      await sr.Branch.update(branch.id, { system_approval: decision });
      if (decision === 'APPROVED' && branch.station_email) {
        // Approving the invitation also approves the branch account itself
        await setUserStatus(base44, branch.station_email, 'approved');
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: branch.station_email,
            subject: `הזמנה להצטרף לרשת ${branch.network_name || ''}`,
            body: `שלום!\n\nהוזמנת להצטרף לרשת "${branch.network_name || 'הרשת'}" בתור סניף "${branch.name}".\nפתח את האפליקציה, ואשר את ההזמנה בבאנר "הזמנה להצטרף לרשת" במסך הקופה.\n\nבברכה,\nצוות הרשת`,
          });
        } catch (e) {
          // ההזמנה אושרה גם אם שליחת המייל נכשלה
        }
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}