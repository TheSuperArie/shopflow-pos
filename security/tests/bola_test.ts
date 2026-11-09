/**
 * Security regression tests (OWASP API1 BOLA / A01 Broken Access Control, A07 auth).
 * Each test plays an attacker against the REAL backend function code with an in-memory database.
 * Run: deno test --config security/deno.json security/tests
 */
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { patchRow, rowsOf, seed } from '../mock/sdk.ts';
import { ADMIN, ATTACKER, BEFORE_CUTOFF, DELEGATE, OTHER, OWNER, STATION, WH, call, world } from './helpers.ts';

import adminAuth from '../../base44/functions/adminAuth/entry.ts';
import accessControl from '../../base44/functions/accessControl/entry.ts';
import catalogAccess from '../../base44/functions/catalogAccess/entry.ts';
import developerPortal from '../../base44/functions/developerPortal/entry.ts';
import networkDelegate from '../../base44/functions/networkDelegate/entry.ts';
import networkMembership from '../../base44/functions/networkMembership/entry.ts';
import publicStockFeed from '../../base44/functions/publicStockFeed/entry.ts';
import botFeed from '../../base44/functions/botFeed/entry.ts';
import stockOps from '../../base44/functions/stockOps/entry.ts';
import supplyOps from '../../base44/functions/supplyOps/entry.ts';

const AUTHED = { adminAuth, accessControl, catalogAccess, developerPortal, networkDelegate, networkMembership, stockOps, supplyOps };

// ───────────────────────────── authentication ─────────────────────────────

Deno.test('every user function rejects signed-out callers with 401', async () => {
  world();
  for (const [name, fn] of Object.entries(AUTHED)) {
    const r = await call(fn, null, { action: 'status', op: 'whoami' });
    assertEquals(r.status, 401, `${name} must require sign-in`);
  }
});

Deno.test('server feeds reject a missing / wrong key', async () => {
  world();
  seed('AdminSecret', { owner_email: '__public_feed__', admin_password: 'k'.repeat(40) });
  seed('AdminSecret', { owner_email: '__bot_feed__', admin_password: 'b'.repeat(40) });
  assertEquals((await call(publicStockFeed, null, { action: 'branches' })).status, 401);
  assertEquals((await call(publicStockFeed, null, { action: 'branches' }, { 'x-feed-key': 'k'.repeat(39) + 'x' })).status, 401);
  assertEquals((await call(botFeed, null, { action: 'overview' })).status, 401);
  assertEquals((await call(botFeed, ATTACKER, { action: 'overview' }, { 'x-bot-key': 'nope' })).status, 401);
  assertEquals((await call(publicStockFeed, null, { action: 'branches' }, { 'x-feed-key': 'k'.repeat(40) })).status, 200);
});

// ───────────────────────────── developer portal ─────────────────────────────

Deno.test('developer code alone is not enough — non-admin accounts are refused', async () => {
  world();
  seed('DeveloperSettings', { dev_code: '0963' });
  const r = await call(developerPortal, ATTACKER, { action: 'logs', code: '0963' });
  assertEquals(r.status, 403);
  const r2 = await call(accessControl, ATTACKER, { action: 'setAccountStatus', code: '0963', email: ATTACKER, status: 'approved' });
  assertEquals(r2.status, 403);
  assertEquals(rowsOf('User').find(u => u.email === ATTACKER)?.access_status, undefined);
  // wrong guesses by a non-developer don't even reach the code check
  assertEquals(rowsOf('DevCodeAttempt').length, 0);
});

Deno.test('the app admin with the right code gets in; invalid statuses are refused', async () => {
  world();
  seed('DeveloperSettings', { dev_code: '0963' });
  assertEquals((await call(developerPortal, ADMIN, { action: 'verify', code: '0963' })).status, 200);
  assertEquals((await call(developerPortal, ADMIN, { action: 'verify', code: '0000' })).status, 403);
  assertEquals((await call(accessControl, ADMIN, { action: 'setAccountStatus', code: '0963', email: STATION, status: 'superuser' })).status, 400);
});

Deno.test('DEVELOPER_EMAILS grants the developer pages to a listed account', async () => {
  world();
  seed('DeveloperSettings', { dev_code: '0963' });
  Deno.env.set('DEVELOPER_EMAILS', ` Other@Net2.test , x@y.z`);
  try {
    assertEquals((await call(developerPortal, OTHER, { action: 'verify', code: '0963' })).status, 200);
    assertEquals((await call(developerPortal, ATTACKER, { action: 'verify', code: '0963' })).status, 403);
  } finally {
    Deno.env.delete('DEVELOPER_EMAILS');
  }
});

// ───────────────────────────── forged network links (BOLA) ─────────────────────────────

Deno.test('BOLA: a self-made Branch row naming a network does NOT leak its payment key', async () => {
  world();
  // Attacker "joins" the owner's network by creating a Branch row himself
  seed('Branch', { name: 'x', tenant_email: OWNER, station_email: ATTACKER, status: 'ACTIVE', is_active: true }, { as: ATTACKER });
  const r = await call(adminAuth, ATTACKER, { action: 'nedarimConfig' });
  assertEquals(r.status, 200);
  assertEquals(r.body.api_valid, undefined);
  assertEquals(r.body.mosad, '');
  assertEquals(r.body.enabled, false);
});

Deno.test('the real, accepted branch station still gets its network payment settings', async () => {
  world();
  const r = await call(adminAuth, STATION, { action: 'nedarimConfig' });
  assertEquals(r.body.source, 'network');
  assertEquals(r.body.api_valid, 'SECRET-OWNER-KEY');
});

Deno.test('BOLA: an owner cannot enlist someone as a station without that station accepting', async () => {
  world();
  // Attacker (as "network owner") creates an ACTIVE branch with the victim station in it
  const forged = seed('Branch', { name: 'trap', tenant_email: ATTACKER, station_email: OTHER, status: 'ACTIVE', is_active: true }, { as: ATTACKER });
  seed('AdminSecret', { owner_email: ATTACKER, nedarim_enabled: true, nedarim_mosad: '9999999', nedarim_api_valid: 'ATTACKER-KEY' });
  // The victim's POS must not pick up the attacker's payment account…
  const cfg = await call(adminAuth, OTHER, { action: 'nedarimConfig' });
  assertNotEquals(cfg.body.api_valid, 'ATTACKER-KEY');
  // …nor treat the forged branch as its own
  const mine = await call(networkMembership, OTHER, { action: 'mine' });
  assertEquals(mine.body.branches.length, 0);
  // …and the victim's stock calls through it are refused
  assertEquals((await call(stockOps, OTHER, { action: 'posCart', branch_id: forged.id, device_id: 'd', items: [] })).status, 403);
});

Deno.test('BOLA: a forged Warehouse row cannot read the network catalog or change stock', async () => {
  const { variant, otherVariant } = world();
  const fake = seed('Warehouse', { name: 'fake', tenant_email: OWNER, station_email: ATTACKER, status: 'ACTIVE', is_active: true }, { as: ATTACKER });
  assertEquals((await call(catalogAccess, ATTACKER, { action: 'networkCatalog', warehouse_id: fake.id })).status, 403);
  assertEquals((await call(catalogAccess, ATTACKER, { action: 'variantSources', warehouse_id: fake.id, variant_ids: [variant.id] })).status, 403);
  assertEquals((await call(stockOps, ATTACKER, { action: 'warehouseCount', warehouse_id: fake.id, op_key: 'k', item: { variant_id: variant.id }, value: 999 })).status, 403);
  // and someone else's real warehouse id
  const warehouse = rowsOf('Warehouse')[0];
  assertEquals((await call(catalogAccess, ATTACKER, { action: 'networkCatalog', warehouse_id: warehouse.id })).status, 403);
  assertEquals((await call(catalogAccess, OTHER, { action: 'variantSources', warehouse_id: warehouse.id, variant_ids: [otherVariant.id] })).status, 403);
});

Deno.test('the accepted warehouse reads the catalog; forged acting_owner rows are dropped', async () => {
  const { warehouse, variant } = world();
  // Attacker plants a product that claims to be made for the owner by a manager
  const planted = seed('ProductVariant', { group_id: 'g', stock: 1, acting_owner: OWNER, delegate_email: DELEGATE, sell_price: 1 }, { as: ATTACKER });
  // A real manager-made row (service role, verified delegate) is kept
  const real = seed('ProductVariant', { group_id: 'g', stock: 2, acting_owner: OWNER, delegate_email: DELEGATE });
  const r = await call(catalogAccess, WH, { action: 'networkCatalog', warehouse_id: warehouse.id });
  assertEquals(r.status, 200);
  const ids = r.body.variants.map((v: any) => v.id);
  assert(ids.includes(variant.id));
  assert(ids.includes(real.id));
  assert(!ids.includes(planted.id), 'forged acting_owner row must not reach the warehouse');
});

Deno.test('BOLA: a station re-pointing its Branch at another network cannot read that catalog', async () => {
  const { branch, otherVariant } = world();
  // The station edits its own Branch row (allowed by RLS) to name another network
  patchRow('Branch', branch.id, { tenant_email: OTHER, catalog_share: { pv_ids: [otherVariant.id] } });
  const r = await call(catalogAccess, STATION, { action: 'sharedCatalog', branch_id: branch.id });
  assertEquals(r.status, 403);
});

Deno.test('BOLA: warehouseFree on someone else\'s branch is refused', async () => {
  const { branch, variant } = world();
  assertEquals((await call(catalogAccess, ATTACKER, { action: 'warehouseFree', branch_id: branch.id, keys: [variant.id] })).status, 403);
  assertEquals((await call(catalogAccess, STATION, { action: 'warehouseFree', branch_id: branch.id, keys: [variant.id] })).status, 200);
});

Deno.test('BOLA: supply order numbers of a network only for its owner / accepted stations', async () => {
  world();
  seed('Branch', { name: 'x', tenant_email: OWNER, station_email: ATTACKER, status: 'ACTIVE', is_active: true }, { as: ATTACKER });
  assertEquals((await call(supplyOps, ATTACKER, { action: 'nextOrderNumber', tenant_email: OWNER })).status, 403);
  assertEquals((await call(supplyOps, STATION, { action: 'nextOrderNumber', tenant_email: OWNER })).status, 200);
  assertEquals((await call(supplyOps, OWNER, { action: 'nextOrderNumber', tenant_email: OWNER })).status, 200);
});

Deno.test('BOLA: stock of another account\'s sale / return / order cannot be touched', async () => {
  const { otherSale, branch } = world();
  assertEquals((await call(stockOps, ATTACKER, { action: 'posSale', client_sale_id: otherSale.client_sale_id })).status, 403);
  const ret = seed('Return', { status: 'אושר', items: [], station_email: OTHER, tenant_email: OTHER }, { as: OTHER });
  assertEquals((await call(stockOps, ATTACKER, { action: 'returnStock', return_id: ret.id })).status, 403);
  const order = seed('SupplyOrder', { branch_id: branch.id, status: 'SENT_TO_BRANCH', items: [], tenant_email: OWNER, station_email: STATION }, { as: STATION });
  assertEquals((await call(stockOps, ATTACKER, { action: 'branchReceive', order_id: order.id })).status, 403);
  assertEquals((await call(stockOps, ATTACKER, { action: 'posCart', branch_id: branch.id, device_id: 'd', items: [] })).status, 403);
});

Deno.test('a sale id reused by another account does not hide the real sale', async () => {
  world();
  // Attacker creates his own sale with the victim's client id first
  seed('Sale', { client_sale_id: 'dup', items: [], station_email: ATTACKER }, { as: ATTACKER });
  seed('Sale', { client_sale_id: 'dup', items: [], station_email: OTHER, tenant_email: OTHER }, { as: OTHER });
  assertEquals((await call(stockOps, OTHER, { action: 'posSale', client_sale_id: 'dup' })).status, 200);
});

// ───────────────────────────── invitations ─────────────────────────────

Deno.test('invitation acceptance: only invitations the owner really sent and the system approved', async () => {
  world();
  const forged = seed('Branch', { name: 'f', tenant_email: OWNER, station_email: ATTACKER, status: 'PENDING', system_approval: 'APPROVED' }, { as: ATTACKER });
  assertEquals((await call(networkMembership, ATTACKER, { action: 'accept', kind: 'branch', id: forged.id })).status, 403);

  const unapproved = seed('Branch', { name: 'u', tenant_email: OTHER, station_email: ATTACKER, status: 'PENDING', system_approval: 'PENDING_SYSTEM' }, { as: OTHER });
  assertEquals((await call(networkMembership, ATTACKER, { action: 'accept', kind: 'branch', id: unapproved.id })).status, 403);

  const noApproval = seed('Branch', { name: 'n', tenant_email: OTHER, station_email: ATTACKER, status: 'PENDING' }, { as: OTHER });
  assertEquals((await call(networkMembership, ATTACKER, { action: 'accept', kind: 'branch', id: noApproval.id })).status, 403);

  const real = seed('Branch', { name: 'r', tenant_email: OTHER, station_email: ATTACKER, status: 'PENDING', system_approval: 'APPROVED' }, { as: OTHER });
  // someone else can't accept on the station's behalf
  assertEquals((await call(networkMembership, OTHER, { action: 'accept', kind: 'branch', id: real.id })).status, 403);
  assertEquals((await call(networkMembership, ATTACKER, { action: 'accept', kind: 'branch', id: real.id })).status, 200);
  const mine = await call(networkMembership, ATTACKER, { action: 'mine' });
  assertEquals(mine.body.branches.map((b: any) => b.id), [real.id]);
});

Deno.test('NetworkMembership is server-written only (entity RLS)', async () => {
  const rls = JSON.parse(await Deno.readTextFile(new URL('../../base44/entities/NetworkMembership.jsonc', import.meta.url))).rls;
  for (const op of ['create', 'update', 'delete']) {
    assertEquals(rls[op], { created_by_id: '__developer_service_role_only__' }, `${op} must be service-only`);
  }
});

Deno.test('legacy links keep working, but editing the station afterwards needs a new acceptance', async () => {
  world();
  const legacy = seed('Branch', { name: 'old', tenant_email: OTHER, station_email: ATTACKER, status: 'ACTIVE', is_active: true }, { as: OTHER, created_date: BEFORE_CUTOFF });
  let mine = await call(networkMembership, ATTACKER, { action: 'mine' });
  assertEquals(mine.body.branches.map((b: any) => b.id), [legacy.id]);
  // first trust recorded the pair
  assert(rowsOf('NetworkMembership').some(m => m.link_id === legacy.id && m.station_email === ATTACKER));
  // The owner now re-points the old branch at a different account
  patchRow('Branch', legacy.id, { station_email: STATION });
  mine = await call(networkMembership, STATION, { action: 'mine' });
  assert(!mine.body.branches.some((b: any) => b.id === legacy.id), 'a re-pointed legacy branch must not be trusted');
});

// ───────────────────────────── network manager (delegate) ─────────────────────────────

Deno.test('BOLA: the network manager is confined to the owner\'s network', async () => {
  const { otherSale, otherVariant } = world();
  const get = await call(networkDelegate, DELEGATE, { op: 'get', entity: 'Sale', id: otherSale.id });
  assertEquals(get.status, 404);
  const list = await call(networkDelegate, DELEGATE, { op: 'filter', entity: 'ProductVariant', query: {} });
  assert(!list.body.data.some((v: any) => v.id === otherVariant.id));
  const upd = await call(networkDelegate, DELEGATE, { op: 'update', entity: 'ProductVariant', id: otherVariant.id, data: { stock: 0 } });
  assertEquals(upd.status, 403);
  const del = await call(networkDelegate, DELEGATE, { op: 'delete', entity: 'Sale', id: otherSale.id });
  assertEquals(del.status, 403);
  const make = await call(networkDelegate, DELEGATE, { op: 'create', entity: 'Sale', data: { station_email: OTHER, tenant_email: OTHER } });
  assertEquals(make.status, 403);
  for (const entity of ['AdminSecret', 'User', 'NetworkMembership', 'DeveloperSettings']) {
    assertEquals((await call(networkDelegate, DELEGATE, { op: 'list', entity })).status, 403, `${entity} must be blocked`);
  }
  assertEquals((await call(networkDelegate, DELEGATE, { op: 'create', entity: 'StockOperation', data: { op_key: 'sale:x', status: 'DONE' } })).status, 403);
  // a regular account is not a manager
  assertEquals((await call(networkDelegate, ATTACKER, { op: 'list', entity: 'Sale' })).status, 403);
});

// ───────────────────────────── public feed ─────────────────────────────

Deno.test('public feed: only the real network\'s accepted branches and genuine products', async () => {
  world();
  seed('AdminSecret', { owner_email: '__public_feed__', admin_password: 'k'.repeat(40) });
  const TENANT = 'tt0534168729@gmail.com';
  const real = seed('Branch', { name: 'Real', tenant_email: TENANT, station_email: STATION, status: 'ACTIVE', is_active: true }, { as: TENANT, created_date: BEFORE_CUTOFF });
  const fake = seed('Branch', { name: 'Fake', tenant_email: TENANT, station_email: ATTACKER, status: 'ACTIVE', is_active: true }, { as: ATTACKER });
  const g = seed('ProductGroup', { name: 'G', is_active: true, image_url: 'javascript:alert(1)' }, { as: STATION });
  seed('ProductVariant', { group_id: g.id, stock: 5 }, { as: STATION });
  const evilG = seed('ProductGroup', { name: 'Spam', is_active: true, branch_id: real.id }, { as: ATTACKER });
  seed('ProductVariant', { group_id: evilG.id, stock: 5, branch_id: real.id }, { as: ATTACKER });

  const key = { 'x-feed-key': 'k'.repeat(40) };
  const br = await call(publicStockFeed, null, { action: 'branches' }, key);
  assertEquals(br.body.branches.map((b: any) => b.id), [real.id]);
  assertEquals((await call(publicStockFeed, null, { action: 'catalog', branch_id: fake.id }, key)).status, 404);
  const cat = await call(publicStockFeed, null, { action: 'catalog', branch_id: real.id }, key);
  assertEquals(cat.body.products.map((p: any) => p.n), ['G']);
  assertEquals(cat.body.products[0].img, '', 'non-https image links must be dropped');
});

// ───────────────────────────── errors ─────────────────────────────

Deno.test('server errors do not leak internals', async () => {
  world();
  const r = await call(networkDelegate, DELEGATE, { op: 'filter', entity: 'Sale', query: { amount: { $where: 'x' } } });
  assertEquals(r.status, 500);
  assertEquals(r.body.error, 'Server error');
});

Deno.test('legacy admin codes are moved out of the world-readable AppSettings', async () => {
  world();
  seed('AppSettings', { store_name: 'Old shop', admin_password: '4321', network_admin_password: '9876' }, { as: OTHER });
  // a fresh server instance (the sweep runs once per instance)
  const fresh = (await import(`../../base44/functions/adminAuth/entry.ts?fresh=${Date.now()}`)).default;
  await call(fresh, ATTACKER, { action: 'status' });
  const s = rowsOf('AppSettings').find(r => r.created_by === OTHER)!;
  assert(String(s.admin_password).startsWith('moved:'));
  assert(String(s.network_admin_password).startsWith('moved:'));
  const secret = rowsOf('AdminSecret').find(r => r.owner_email === OTHER)!;
  assertEquals(secret.admin_password, '4321');
  // and the owner still logs in with the old code
  assertEquals((await call(adminAuth, OTHER, { action: 'verify', password: '9876' })).body.role, 'NETWORK_MASTER');
});
