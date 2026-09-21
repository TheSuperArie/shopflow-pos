import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const DEFAULT_CODE = '0963';

async function getSettingsRecord(base44) {
  const existing = await base44.asServiceRole.entities.DeveloperSettings.list('-created_date', 1);
  if (existing.length > 0) return existing[0];
  return base44.asServiceRole.entities.DeveloperSettings.create({ dev_code: DEFAULT_CODE });
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action = 'verify', code, new_code } = body;

    const record = await getSettingsRecord(base44);
    const currentCode = record.dev_code || DEFAULT_CODE;

    if (String(code || '').trim() !== String(currentCode)) {
      return Response.json({ error: 'קוד שגוי' }, { status: 403 });
    }

    if (action === 'verify') {
      return Response.json({ ok: true });
    }

    if (action === 'logs') {
      const logs = await base44.asServiceRole.entities.UsageLog.list('-login_at', 3000);
      return Response.json({ ok: true, logs });
    }

    if (action === 'setCode') {
      const next = String(new_code || '').trim();
      if (next.length < 4) return Response.json({ error: 'הקוד חייב להיות לפחות 4 תווים' }, { status: 400 });
      await base44.asServiceRole.entities.DeveloperSettings.update(record.id, { dev_code: next });
      return Response.json({ ok: true, dev_code: next });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}