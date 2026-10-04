import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Admin codes (branch manager code + network master code) live only on the server, in
 * AdminSecret (service-role only). They used to sit in AppSettings, which other accounts can read.
 *
 *  verify       { password }                 → { ok, role: 'NETWORK_MASTER' | 'BRANCH_MANAGER' }
 *  status       {}                           → { custom_admin, custom_network } (is a non-default code set)
 *  setPasswords { current, admin_password?, network_admin_password? }
 *               — `current` must be one of this account's valid codes
 *  nedarimConfig {}                          → { enabled, mosad, api_valid, source } — the Nedarim Plus
 *               payment settings the POS uses: this account's own, or else its network owner's
 *  nedarimStatus {}                          → same without the key (settings screens)
 *  setNedarim   { current, enabled, mosad, api_valid? } — needs a valid admin code; an empty
 *               api_valid keeps the saved key
 *
 * Same rules as the old login screen: no code set → defaults (1234 branch / 8888 network);
 * an account that is a branch station of someone else's network can't open the network dashboard.
 * 8 wrong codes in a row → 10 minute block.
 */
const DEFAULT_BRANCH = '1234';
const DEFAULT_NETWORK = '8888';
const MAX_FAILS = 8;
const BLOCK_MIN = 10;
const MOVED = 'moved:'; // marker left in AppSettings after the code moved here

const clean = (v) => {
  const s = String(v ?? '').trim();
  return s.startsWith(MOVED) ? '' : s;
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;
    const email = String(user.email || '').toLowerCase();

    // This account's codes. First use: moved over from AppSettings, which keeps only a marker.
    const loadSecret = async () => {
      const [existing] = await db.AdminSecret.filter({ owner_email: email }, 'created_date', 1);
      if (existing) return existing;
      const settingsList = await db.AppSettings.filter({ created_by: user.email }, 'created_date', 5);
      const s = settingsList[0];
      const created = await db.AdminSecret.create({
        owner_email: email,
        admin_password: clean(s?.admin_password),
        network_admin_password: clean(s?.network_admin_password),
        failed_count: 0,
      });
      const marker = () => `${MOVED}${crypto.randomUUID()}`;
      for (const row of settingsList) {
        await db.AppSettings.update(row.id, { admin_password: marker(), network_admin_password: marker() });
      }
      return created;
    };

    const isNetworkBranchStation = async () => {
      const branches = await db.Branch.filter({ station_email: user.email, is_active: true, status: 'ACTIVE' }, undefined, 50);
      return branches.some(b => b.tenant_email && String(b.tenant_email).toLowerCase() !== email);
    };

    const roleFor = async (secret, code) => {
      const pwd = String(code ?? '').trim();
      if (!pwd) return null;
      const network = secret.network_admin_password || DEFAULT_NETWORK;
      const branch = secret.admin_password || DEFAULT_BRANCH;
      if (pwd === network && !(await isNetworkBranchStation())) return 'NETWORK_MASTER';
      if (pwd === branch) return 'BRANCH_MANAGER';
      return null;
    };

    // Wrong-code counter shared by verify and setPasswords
    const checkCode = async (secret, code) => {
      if (secret.blocked_until && new Date(secret.blocked_until).getTime() > Date.now()) {
        const minutes = Math.ceil((new Date(secret.blocked_until).getTime() - Date.now()) / 60000);
        return { blocked: `יותר מדי ניסיונות שגויים. נסה שוב בעוד ${minutes} דקות` };
      }
      const role = await roleFor(secret, code);
      if (role) {
        if (secret.failed_count || secret.blocked_until) {
          await db.AdminSecret.update(secret.id, { failed_count: 0, blocked_until: null });
        }
        return { role };
      }
      const fails = Number(secret.failed_count || 0) + 1;
      if (fails >= MAX_FAILS) {
        await db.AdminSecret.update(secret.id, {
          failed_count: 0, blocked_until: new Date(Date.now() + BLOCK_MIN * 60000).toISOString(),
        });
        return { blocked: `יותר מדי ניסיונות שגויים. נסה שוב בעוד ${BLOCK_MIN} דקות` };
      }
      await db.AdminSecret.update(secret.id, { failed_count: fails });
      return { role: null };
    };

    const { action = 'verify' } = body;
    const secret = await loadSecret();

    if (action === 'verify') {
      const res = await checkCode(secret, body.password);
      if (res.blocked) return Response.json({ ok: false, error: res.blocked }, { status: 429 });
      return Response.json({ ok: !!res.role, role: res.role || null });
    }

    if (action === 'status') {
      return Response.json({ ok: true, custom_admin: !!secret.admin_password, custom_network: !!secret.network_admin_password });
    }

    if (action === 'setPasswords') {
      const res = await checkCode(secret, body.current);
      if (res.blocked) return Response.json({ error: res.blocked }, { status: 429 });
      if (!res.role) return Response.json({ error: 'הקוד הנוכחי שגוי' }, { status: 403 });
      const patch = {};
      if (body.admin_password !== undefined) {
        const next = String(body.admin_password || '').trim();
        if (next.length < 4) return Response.json({ error: 'הקוד חייב להיות לפחות 4 תווים' }, { status: 400 });
        patch.admin_password = next;
      }
      if (body.network_admin_password !== undefined) {
        // Only the network owner (logged in with the network code) changes the network code
        if (res.role !== 'NETWORK_MASTER') return Response.json({ error: 'רק עם קוד המאסטר של הרשת' }, { status: 403 });
        const next = String(body.network_admin_password || '').trim();
        if (next.length < 4) return Response.json({ error: 'הקוד חייב להיות לפחות 4 תווים' }, { status: 400 });
        patch.network_admin_password = next;
      }
      const a = patch.admin_password ?? secret.admin_password ?? DEFAULT_BRANCH;
      const n = patch.network_admin_password ?? secret.network_admin_password ?? DEFAULT_NETWORK;
      if ((a || DEFAULT_BRANCH) === (n || DEFAULT_NETWORK)) {
        return Response.json({ error: 'קוד הסניף וקוד הרשת חייבים להיות שונים' }, { status: 400 });
      }
      if (Object.keys(patch).length) await db.AdminSecret.update(secret.id, patch);
      return Response.json({ ok: true });
    }

    // ── Nedarim Plus (credit card payments in the POS) ──
    const hasNedarim = (s) => !!(s && s.nedarim_mosad);
    const networkSecret = async () => {
      // A branch station without its own settings uses its network owner's
      const branches = await db.Branch.filter({ station_email: user.email, status: 'ACTIVE' }, undefined, 10);
      const tenant = branches.map(b => String(b.tenant_email || '').toLowerCase()).find(t => t && t !== email);
      if (!tenant) return null;
      const [s] = await db.AdminSecret.filter({ owner_email: tenant }, 'created_date', 1);
      return s || null;
    };
    const nedarimFor = async () => {
      if (hasNedarim(secret)) return { s: secret, source: 'own' };
      const n = await networkSecret();
      if (hasNedarim(n)) return { s: n, source: 'network' };
      return { s: null, source: null };
    };

    if (action === 'nedarimConfig' || action === 'nedarimStatus') {
      const { s, source } = await nedarimFor();
      const out = {
        ok: true,
        enabled: !!(s && s.nedarim_enabled && s.nedarim_mosad && s.nedarim_api_valid),
        mosad: s?.nedarim_mosad || '',
        has_key: !!s?.nedarim_api_valid,
        source,
        own_enabled: !!secret.nedarim_enabled,
        own_mosad: secret.nedarim_mosad || '',
        own_has_key: !!secret.nedarim_api_valid,
      };
      if (action === 'nedarimConfig' && out.enabled) out.api_valid = s.nedarim_api_valid;
      return Response.json(out);
    }

    if (action === 'setNedarim') {
      const res = await checkCode(secret, body.current);
      if (res.blocked) return Response.json({ error: res.blocked }, { status: 429 });
      if (!res.role) return Response.json({ error: 'קוד המנהל שגוי' }, { status: 403 });
      const mosad = String(body.mosad ?? '').trim();
      if (mosad && !/^\d{4,10}$/.test(mosad)) return Response.json({ error: 'מספר מוסד חייב להיות מספרים בלבד' }, { status: 400 });
      const patch = { nedarim_enabled: !!body.enabled && !!mosad, nedarim_mosad: mosad };
      const key = String(body.api_valid ?? '').trim();
      if (key) patch.nedarim_api_valid = key;
      if (body.clear_key) patch.nedarim_api_valid = '';
      await db.AdminSecret.update(secret.id, patch);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
