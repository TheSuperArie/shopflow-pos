#!/usr/bin/env node
/**
 * Static security policy for this repo — runs in CI on every push (no dependencies).
 * Fails when a change re-opens one of the holes closed in the security review:
 *
 *  1. Entity access rules (RLS)   — every table has rules; nothing is world-writable; tables that
 *                                   hold secrets / server state stay server-only; world-readable
 *                                   tables are an explicit, reviewed list.
 *  2. Backend functions           — every function authenticates (user sign-in or a constant-time
 *                                   shared key); functions that decide access by station_email /
 *                                   tenant_email use the shared trust checks (BOLA); server errors
 *                                   don't leak internals.
 *  3. Browser code                — network links are accepted only through the server; no raw
 *                                   HTML injection.
 *  4. Test wiring                 — every Base44 SDK version used by a function is mocked, so the
 *                                   BOLA tests really run the function code.
 *
 * Usage: node security/check-policy.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const errors = [];
const fail = (file, msg) => errors.push(`${relative(ROOT, file)}: ${msg}`);

const parseJsonc = (text) => JSON.parse(
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"\\])\/\/[^\n]*/g, '$1').replace(/,(\s*[}\]])/g, '$1'),
);
const walk = (dir, pred, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
};

// ───────────────────────── 1. Entity RLS ─────────────────────────
const SERVICE = '__developer_service_role_only__';
const isService = (rule) => !!rule && typeof rule === 'object' && rule.created_by_id === SERVICE && Object.keys(rule).length === 1;

/** Built-in tables whose rules Base44 manages itself. */
const BUILTIN = new Set(['User']);
/** Tables every signed-in account may READ (reviewed: no secrets in them). */
const WORLD_READABLE = {
  AppSettings: 'store display settings; legacy codes are swept out by adminAuth',
  Branch: 'network directory needed by invitations; trust is decided server-side (shared/trust.ts)',
};
/** Tables only the server may touch for the listed operations. */
const SERVER_ONLY = {
  AdminSecret: ['read', 'create', 'update', 'delete'],
  DeveloperSettings: ['read', 'create', 'update', 'delete'],
  DevCodeAttempt: ['read', 'create', 'update', 'delete'],
  TicketChat: ['read', 'create', 'update', 'delete'],
  AccessRequest: ['create', 'update', 'delete'],
  UsageLog: ['read', 'update', 'delete'],
  NetworkMembership: ['create', 'update', 'delete'],
  StockOperation: ['create', 'update', 'delete'],
  StockReservation: ['create', 'update', 'delete'],
};
/** Tables the browser may create in (UsageLog: the login logger writes its own row). */
const CREATE_ONLY_OPEN = new Set(['UsageLog']);

const entityDir = join(ROOT, 'base44/entities');
const entityFiles = readdirSync(entityDir).filter(f => f.endsWith('.jsonc'));
const seen = new Set();
for (const f of entityFiles) {
  const file = join(entityDir, f);
  let d;
  try { d = parseJsonc(readFileSync(file, 'utf8')); } catch (e) { fail(file, `invalid JSON: ${e.message}`); continue; }
  const name = d.name || f.replace('.jsonc', '');
  seen.add(name);
  if (BUILTIN.has(name)) continue;
  const rls = d.rls;
  if (!rls || typeof rls !== 'object') { fail(file, 'no "rls" block — the table would be open to every account'); continue; }
  for (const op of ['read', 'update', 'delete']) {
    if (rls[op] === undefined && !(name in SERVER_ONLY && !SERVER_ONLY[name].includes(op))) {
      if (!(CREATE_ONLY_OPEN.has(name) && op !== 'read')) fail(file, `rls.${op} is missing (defaults to open)`);
    }
  }
  for (const op of ['update', 'delete']) {
    if (rls[op] === true) fail(file, `rls.${op} is true — any account could change/delete any row (BOLA)`);
  }
  if (rls.read === true && !(name in WORLD_READABLE)) {
    fail(file, 'rls.read is true — add it to WORLD_READABLE in security/check-policy.mjs only after review');
  }
  for (const op of SERVER_ONLY[name] || []) {
    if (!isService(rls[op])) fail(file, `rls.${op} must stay server-only ({ created_by_id: "${SERVICE}" })`);
  }
  // A scoped rule must actually scope by the caller
  for (const op of ['read', 'update', 'delete']) {
    const r = rls[op];
    if (r && typeof r === 'object' && !isService(r) && !JSON.stringify(r).includes('{{user.')) {
      fail(file, `rls.${op} does not reference the caller ({{user.id}} / {{user.email}})`);
    }
  }
}
for (const name of Object.keys(SERVER_ONLY)) {
  if (!seen.has(name)) fail(entityDir, `expected table ${name} is missing`);
}

// ───────────────────────── 2. Backend functions ─────────────────────────
const fnDir = join(ROOT, 'base44/functions');
/** Called by other servers with a shared key instead of a signed-in user. */
const KEY_AUTH = { botFeed: 'x-bot-key', publicStockFeed: 'x-feed-key' };
/** Use their own, reviewed scoping instead of shared/trust.ts. */
const OWN_SCOPE = {
  networkDelegate: 'confines a verified manager to the owner scope ($and with scopeOf(owner))',
  accessControl: 'developer-only (isDeveloper + code) or the caller\'s own request',
  developerPortal: 'developer-only (isDeveloper + code)',
};

const sdkVersions = new Set();
for (const name of readdirSync(fnDir)) {
  const file = join(fnDir, name, 'entry.ts');
  if (!existsSync(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/npm:@base44\/sdk@([\w.\-]+)/g)) sdkVersions.add(m[0]);

  const retired = /status:\s*410/.test(src) && !/createClientFromRequest/.test(src);
  if (retired) continue;

  if (KEY_AUTH[name]) {
    const header = KEY_AUTH[name];
    if (!new RegExp(`safeEqual\\(\\s*req\\.headers\\.get\\(['"]${header}['"]\\)`).test(src)) {
      fail(file, `must check the ${header} header with safeEqual() before doing anything`);
    }
  } else {
    if (!/await\s+base44\.auth\.me\(\)/.test(src)) fail(file, 'must authenticate the caller (base44.auth.me())');
    if (!/status:\s*401/.test(src)) fail(file, 'must answer 401 to signed-out callers');
  }

  if (/asServiceRole/.test(src) && /(station_email|tenant_email)/.test(src) && !OWN_SCOPE[name]) {
    if (!/shared\/trust\.ts/.test(src)) {
      fail(file, 'reads/writes across accounts by station_email / tenant_email without shared/trust.ts (BOLA)');
    }
  }
  // Raw "station_email / tenant_email equals me" checks on a Branch / Warehouse are forgeable
  if (/isMe\(\s*(b|w|branch|warehouse)\.(station_email|tenant_email)\s*\)\s*\|\|/.test(src) && !/trust\.(isStationOf|isTenantOf)/.test(src)) {
    fail(file, 'authorizes by Branch/Warehouse station_email/tenant_email alone — use trust.isStationOf / isTenantOf');
  }
  if (/error:\s*error\.message\s*}\s*,\s*{\s*status:\s*(error\.status\s*\|\|\s*)?500/.test(src)) {
    fail(file, 'returns error.message on server errors (information leak) — return a generic message');
  }
}

// ───────────────────────── 3. Browser code ─────────────────────────
const srcFiles = walk(join(ROOT, 'src'), p => /\.(jsx?|tsx?)$/.test(p));
for (const file of srcFiles) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  if (/(Branch|Warehouse)\.update\([^)]*status:\s*['"]ACTIVE['"]/.test(src)) {
    fail(file, 'activates a network link directly — accept invitations through the networkMembership function');
  }
  if (/dangerouslySetInnerHTML/.test(src) && !rel.startsWith('src/components/ui/')) {
    fail(file, 'dangerouslySetInnerHTML outside the UI kit — render text, or sanitize and get it reviewed');
  }
  if (/\beval\s*\(|new Function\s*\(/.test(src)) fail(file, 'eval / new Function');
  // String-built HTML: every ${...} must be escaped, a number, or a known-safe helper
  if (/document\.write\(/.test(src)) {
    for (const m of src.matchAll(/\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
      const expr = m[1].trim();
      const safe = /^(esc|escapeHtml)\(/.test(expr) || /toFixed\(|toLocaleString\(|format\(|\.join\(''\)|Html\b|Html\(|^(receiptDate|content|html|itemsHtml)$/.test(expr)
        || /^[\w.]+\s*\?/.test(expr) || /^['"`]/.test(expr) || /^(boxStyle|rowStyle)$/.test(expr) || /^\d/.test(expr);
      if (!safe && /(name|notes|title|label|method|number|email|description|address|phone)/i.test(expr)) {
        fail(file, `unescaped \${${expr}} in HTML built for document.write — wrap it in escapeHtml()`);
      }
    }
  }
}

// ───────────────────────── 4. Test wiring ─────────────────────────
const denoCfg = JSON.parse(readFileSync(join(ROOT, 'security/deno.json'), 'utf8'));
for (const v of sdkVersions) {
  if (!denoCfg.imports?.[v]) fail(join(ROOT, 'security/deno.json'), `"${v}" is not mapped to the mock — the security tests would hit the real SDK`);
}

if (errors.length) {
  console.error(`✖ Security policy: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log(`✔ Security policy: ${entityFiles.length} tables, functions and browser code OK`);
