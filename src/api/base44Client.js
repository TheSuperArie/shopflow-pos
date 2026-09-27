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

// Ownership stamping on create/bulkCreate — every other call passes through untouched.
const stamp = createOwnershipResolver(client);
const wrappedHandlers = new Map();
const wrapHandler = (name, handler) => {
  if (!wrappedHandlers.has(name)) {
    wrappedHandlers.set(name, new Proxy(handler, {
      get(target, prop) {
        if (prop === 'create') return async (data) => target.create(await stamp(data));
        if (prop === 'bulkCreate') return async (rows) => target.bulkCreate(await Promise.all((rows || []).map(stamp)));
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
    return STAMPED_ENTITIES.has(name) && handler ? wrapHandler(name, handler) : handler;
  },
});

export const base44 = new Proxy(client, {
  get(target, prop) {
    if (prop === 'entities') return entities;
    return Reflect.get(target, prop);
  },
});