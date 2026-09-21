const DEFAULT_CODE = '0963';

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