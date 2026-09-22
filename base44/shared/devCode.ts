const DEFAULT_CODE = '0963';
const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

/** Returns the single DeveloperSettings record, creating it with the default code if missing. */
export async function getDevSettings(base44) {
  const existing = await base44.asServiceRole.entities.DeveloperSettings.list('-created_date', 1);
  if (existing.length > 0) return existing[0];
  return base44.asServiceRole.entities.DeveloperSettings.create({ dev_code: DEFAULT_CODE });
}

/** Verifies the supplied developer code. Returns the settings record, or null when wrong. */
export async function verifyDevCode(base44, code) {
  const record = await getDevSettings(base44);
  const current = record.dev_code || DEFAULT_CODE;
  if (String(code || '').trim() !== String(current)) return null;
  return record;
}

/**
 * Rate-limited developer-code check: 5 wrong attempts by the same account
 * trigger a 15 minute block. Counters live server-side in DevCodeAttempt.
 * Returns { ok: true, record } or { ok: false, status, message }.
 */
export async function guardDevCode(base44, email, code) {
  const sr = base44.asServiceRole.entities;
  const rows = await sr.DevCodeAttempt.filter({ user_email: email }, '-created_date', 1);
  const row = rows[0] || null;
  const now = Date.now();

  if (row && row.blocked_until && new Date(row.blocked_until).getTime() > now) {
    const minutes = Math.ceil((new Date(row.blocked_until).getTime() - now) / 60000);
    return { ok: false, status: 429, message: `יותר מדי ניסיונות שגויים. נסה שוב בעוד ${minutes} דקות` };
  }

  const record = await verifyDevCode(base44, code);
  const nowIso = new Date().toISOString();

  if (record) {
    if (row && (row.failed_count || row.blocked_until)) {
      await sr.DevCodeAttempt.update(row.id, { failed_count: 0, blocked_until: null, last_attempt_at: nowIso });
    }
    return { ok: true, record };
  }

  const failed = (row?.failed_count || 0) + 1;
  const data = { user_email: email, failed_count: failed, last_attempt_at: nowIso, blocked_until: null };
  let message = 'קוד שגוי';
  let status = 403;
  if (failed >= MAX_ATTEMPTS) {
    data.failed_count = 0;
    data.blocked_until = new Date(now + BLOCK_MINUTES * 60000).toISOString();
    message = `יותר מדי ניסיונות שגויים. נסה שוב בעוד ${BLOCK_MINUTES} דקות`;
    status = 429;
  }

  if (row) await sr.DevCodeAttempt.update(row.id, data);
  else await sr.DevCodeAttempt.create(data);

  return { ok: false, status, message };
}