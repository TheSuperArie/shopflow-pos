/**
 * In-memory stand-in for npm:@base44/sdk, used only by the security tests.
 * The real backend functions are imported unchanged; the import map in security/deno.json points
 * their `npm:@base44/sdk@…` import here.
 *
 * - createClientFromRequest(req) → the signed-in user is the email in the `x-test-user` header
 *   (no header = signed out, base44.auth.me() returns null)
 * - entities behave like the service role (no RLS) — the functions under test use asServiceRole
 * - created_by is the caller's email for user writes and empty for service-role writes
 */
type Row = Record<string, any>;

const tables = new Map<string, Row[]>();
let seq = 0;
export const sent: any[] = [];

export function resetDb() {
  tables.clear();
  sent.length = 0;
  seq = 0;
}

const table = (name: string) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name)!;
};

const serverNow = () => new Date().toISOString().replace('Z', '');
const newId = () => (++seq).toString(16).padStart(24, 'a');

function matchValue(actual: any, cond: any): boolean {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, v]: [string, any]) => {
      switch (op) {
        case '$in': return (v as any[]).includes(actual);
        case '$nin': return !(v as any[]).includes(actual);
        case '$gte': return actual != null && actual >= v;
        case '$lte': return actual != null && actual <= v;
        case '$gt': return actual != null && actual > v;
        case '$lt': return actual != null && actual < v;
        case '$ne': return actual !== v;
        case '$exists': return (actual !== undefined) === !!v;
        default: throw new Error(`mock: unsupported operator ${op}`);
      }
    });
  }
  if (cond === null) return actual === null || actual === undefined;
  return actual === cond;
}

export function matches(row: Row, q: any): boolean {
  if (!q) return true;
  return Object.entries(q).every(([k, v]: [string, any]) => {
    if (k === '$or') return (v as any[]).some(s => matches(row, s));
    if (k === '$and') return (v as any[]).every(s => matches(row, s));
    if (k === '$nor') return !(v as any[]).some(s => matches(row, s));
    return matchValue(row[k], v);
  });
}

function entityApi(name: string, actor: () => Row | null) {
  const rows = () => table(name);
  const filter = async (q?: any, sort?: string, limit?: number, skip?: number) => {
    let out = rows().filter(r => matches(r, q || {}));
    if (sort) {
      const desc = sort.startsWith('-');
      const f = desc ? sort.slice(1) : sort;
      out = [...out].sort((a, b) => (String(a[f] ?? '') < String(b[f] ?? '') ? -1 : String(a[f] ?? '') > String(b[f] ?? '') ? 1 : 0) * (desc ? -1 : 1));
    }
    out = out.slice(skip || 0, limit ? (skip || 0) + limit : undefined);
    return structuredClone(out);
  };
  const create = async (data: Row) => {
    const a = actor();
    const row = {
      ...structuredClone(data || {}),
      id: newId(),
      created_date: serverNow(),
      updated_date: serverNow(),
      created_by: a?.email ?? undefined,
      created_by_id: a?.id ?? undefined,
    };
    rows().push(row);
    return structuredClone(row);
  };
  return {
    filter,
    list: (sort?: string, limit?: number, skip?: number) => filter({}, sort, limit, skip),
    get: async (id: string) => structuredClone(rows().find(r => r.id === id) || null),
    create,
    bulkCreate: async (list: Row[]) => Promise.all((list || []).map(create)),
    update: async (id: string, data: Row) => {
      const r = rows().find(x => x.id === id);
      if (!r) throw Object.assign(new Error('not found'), { status: 404 });
      const { id: _i, created_by: _c, created_by_id: _ci, created_date: _cd, ...rest } = data || {};
      Object.assign(r, structuredClone(rest), { updated_date: serverNow() });
      return structuredClone(r);
    },
    delete: async (id: string) => {
      const list = rows();
      const i = list.findIndex(x => x.id === id);
      if (i >= 0) list.splice(i, 1);
      return { id };
    },
  };
}

const entitiesFor = (actor: () => Row | null) => new Proxy({}, { get: (_, name: string) => entityApi(name, actor) });

/** Seeds a row as if `as` (an email, or null = service role) created it. */
export function seed(name: string, data: Row, opts: { as?: string | null; created_date?: string } = {}) {
  const user = opts.as ? table('User').find(u => u.email === opts.as) : null;
  const row = {
    ...data,
    id: data.id || newId(),
    created_date: opts.created_date || serverNow(),
    updated_date: serverNow(),
    created_by: opts.as ?? undefined,
    created_by_id: user?.id,
  };
  table(name).push(row);
  return row;
}

export function addUser(email: string, extra: Row = {}) {
  const row = { id: newId(), email, full_name: email.split('@')[0], role: 'user', created_date: serverNow(), ...extra };
  table('User').push(row);
  return row;
}

export const rowsOf = (name: string) => structuredClone(table(name));

export function createClientFromRequest(req: Request) {
  const email = req.headers.get('x-test-user');
  const me = () => (email ? table('User').find(u => u.email === email) || null : null);
  const integrations = { Core: { SendEmail: async (m: any) => { sent.push(m); return { ok: true }; } } };
  return {
    auth: { me: async () => structuredClone(me()) },
    entities: entitiesFor(me),
    integrations,
    asServiceRole: { entities: entitiesFor(() => null), integrations },
  };
}

export const createClient = () => { throw new Error('mock: createClient is not available in tests'); };

/** Edits a stored row in place, the way an RLS-allowed browser update would (created_by stays). */
export function patchRow(name: string, id: string, patch: Row) {
  const r = table(name).find(x => x.id === id);
  if (!r) throw new Error(`mock: no ${name} ${id}`);
  Object.assign(r, structuredClone(patch), { updated_date: serverNow() });
  return structuredClone(r);
}
