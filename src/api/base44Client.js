import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { STAMPED_ENTITIES, createOwnershipResolver } from '@/lib/ownershipStamp';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
const client = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: true,
  appBaseUrl
});

// ── Authorized network manager (מנהל רשת מורשה) ─────────────────────────────────────
// An account the developer set to manage someone else's network (AdminSecret.delegate_of).
// All of its data calls go through the server (function networkDelegate), which acts as the
// network owner within the owner's own access rules. Checked once per sign-in and remembered.
const DELEGATE_CACHE = 'shopflow_delegate_v1';
const tokenTag = () => String(appParams.token || localStorage.getItem('base44_access_token') || '').slice(-24);
let delegatePromise = null;

export function getDelegateOwner() {
  if (!delegatePromise) {
    delegatePromise = (async () => {
      const tag = tokenTag();
      try {
        const cached = JSON.parse(localStorage.getItem(DELEGATE_CACHE) || 'null');
        if (cached && tag && cached.tag === tag) return cached.owner || null;
      } catch { /* no cache */ }
      try {
        const res = await client.functions.invoke('networkDelegate', { op: 'whoami' });
        const owner = res?.data?.owner || null;
        try { if (tag) localStorage.setItem(DELEGATE_CACHE, JSON.stringify({ tag, owner })); } catch { /* ignore */ }
        return owner;
      } catch {
        delegatePromise = null; // not signed in yet / offline — ask again next time
        return null;            // the tables' own access rules still apply
      }
    })();
  }
  return delegatePromise;
}

// Never routed for a manager (their own access rules / service-only tables)
const DIRECT_ONLY = new Set(['User', 'AccessRequest', 'AdminSecret', 'DevCodeAttempt', 'DeveloperSettings', 'TicketChat', 'UsageLog']);

const viaDelegate = async (payload) => {
  const res = await client.functions.invoke('networkDelegate', payload);
  return res?.data?.data;
};

// Records a manager created carry acting_owner = the network owner → shown as the owner's
const asOwner = (r) => (r && typeof r === 'object' && r.acting_owner ? { ...r, created_by: r.acting_owner } : r);
const asOwnerAll = (v) => (Array.isArray(v) ? v.map(asOwner) : asOwner(v));

// created_by: X also matches records a manager created for X (only such records carry acting_owner)
function withActingOwner(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return q;
  const out = {};
  const extra = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === '$and' || k === '$or' || k === '$nor') out[k] = Array.isArray(v) ? v.map(withActingOwner) : v;
    else if (k === 'created_by') extra.push({ $or: [{ created_by: v }, { acting_owner: v }] });
    else out[k] = v;
  }
  if (!extra.length) return out;
  const parts = [...(Object.keys(out).length ? [out] : []), ...extra];
  return parts.length === 1 ? parts[0] : { $and: parts };
}

// Ownership stamping on create/bulkCreate — every other call passes through untouched.
const stamp = createOwnershipResolver(client);
const wrappedHandlers = new Map();
const wrapHandler = (name, handler) => {
  if (!wrappedHandlers.has(name)) {
    const routed = !DIRECT_ONLY.has(name);
    const stamped = STAMPED_ENTITIES.has(name);
    wrappedHandlers.set(name, new Proxy(handler, {
      get(target, prop) {
        if (prop === 'filter') return async (query, ...rest) => {
          if (routed && await getDelegateOwner()) {
            const [sort, limit, skip] = rest;
            return viaDelegate({ op: 'filter', entity: name, query: query || {}, sort, limit, skip });
          }
          return asOwnerAll(await target.filter(withActingOwner(query), ...rest));
        };
        if (prop === 'list') return async (...args) => {
          if (routed && await getDelegateOwner()) {
            const [sort, limit, skip] = args;
            return viaDelegate({ op: 'list', entity: name, sort, limit, skip });
          }
          return asOwnerAll(await target.list(...args));
        };
        if (prop === 'get') return async (id) => {
          if (routed && await getDelegateOwner()) return viaDelegate({ op: 'get', entity: name, id });
          return asOwner(await target.get(id));
        };
        if (prop === 'create') return async (data) => {
          if (routed && await getDelegateOwner()) return viaDelegate({ op: 'create', entity: name, data });
          return target.create(stamped ? await stamp(data) : data);
        };
        if (prop === 'bulkCreate') return async (rows) => {
          if (routed && await getDelegateOwner()) return viaDelegate({ op: 'bulkCreate', entity: name, rows });
          return target.bulkCreate(stamped ? await Promise.all((rows || []).map(stamp)) : rows);
        };
        if (prop === 'update') return async (id, data) => {
          if (routed && await getDelegateOwner()) return viaDelegate({ op: 'update', entity: name, id, data });
          return target.update(id, data);
        };
        if (prop === 'delete') return async (id) => {
          if (routed && await getDelegateOwner()) return viaDelegate({ op: 'delete', entity: name, id });
          return target.delete(id);
        };
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }));
  }
  return wrappedHandlers.get(name);
};

const entities = new Proxy(client.entities, {
  get(target, name) {
    const handler = Reflect.get(target, name);
    return handler && typeof name === 'string' ? wrapHandler(name, handler) : handler;
  },
});

export const base44 = new Proxy(client, {
  get(target, prop) {
    if (prop === 'entities') return entities;
    return Reflect.get(target, prop);
  },
});
