# Security

This app runs on Base44: the browser talks to the entity API directly (guarded by each table's
row-level security, `base44/entities/*.jsonc` → `rls`), and to the backend functions in
`base44/functions/*` (which use the service role and must do their own access checks).

## Security gate (every push)

`.github/workflows/security.yml` runs on every push / pull request and weekly:

| Job | What it guards | OWASP |
|---|---|---|
| **policy** — `node security/check-policy.mjs` | every table has RLS; nothing world-writable; secret/server tables stay server-only; every function authenticates; cross-account functions use `shared/trust.ts`; no leaked error details; no unescaped HTML; invitations only accepted via the server | A01, API1 BOLA, API5, A03, A05 |
| **bola-tests** — `deno test … security/tests` | replays attacks against the real function code (in-memory SDK mock): forged branches/warehouses, cross-tenant reads/writes, manager scope, developer portal, feeds, invitations | A01, API1 BOLA, A07 |
| **dependencies** — `npm audit` | no high/critical advisories in shipped packages, no critical ones in build tooling | A06 |
| **secrets** — gitleaks | no credentials anywhere in git history | A02, A05 |
| **sast** — Semgrep `p/owasp-top-ten`, `p/javascript`, `p/typescript`, `p/react`, `p/secrets` | fails on findings *introduced* by the push / PR (diff-aware) | A03, A05, A08, A10 |

Locally: `npm run security` (needs [Deno](https://deno.com) for the tests).

## Rules for new code

- **Never authorize by `station_email` / `tenant_email` / `acting_owner` alone.** Any account can create
  rows with any value in them. In functions, use `createTrust(base44)` from `base44/shared/trust.ts`
  (`isStationOf`, `isTenantOf`, `confirmedLive`, `ownedRows`). In the browser, use
  `src/lib/networkLinks.js` to find the branches/warehouses this account really accepted.
- Branch / warehouse invitations are accepted or declined only through the `networkMembership` function.
- New tables need an `rls` block. Server-only tables use `{ "created_by_id": "__developer_service_role_only__" }`.
- HTML built as a string (print windows, e-mails) must pass every value through `escapeHtml()` / `esc()`.
- Server errors return a generic message; details go to `console.error`.

## Deploy notes

- **Developer pages** (access requests, usage logs) now require the developer's account to be an app
  **admin** in Base44 (the app owner is), or to be listed in the `DEVELOPER_EMAILS` secret
  (comma separated) — the developer code alone is no longer enough. Change the default developer code.
- **Network links**: from now on a station is trusted only after it accepts its invitation (recorded in
  the server-only `NetworkMembership` table). Links created before 2026-11-09 that are ACTIVE, and links
  whose station sent the "invitation accepted" alert, keep working and are recorded on first use.
  Changing a branch's station e-mail later requires the new station to accept again.
- Review existing Branch / Warehouse rows once: a row created before this change by someone other than
  the network owner should be deleted.
- Feed keys (`__bot_feed__`, `__public_feed__` in AdminSecret) should be long random strings (32+ chars).

## Known residual risks

- Most tables allow any signed-in account to *create* rows carrying another network's `tenant_email`
  (Base44 RLS cannot check that relation). The owner may see such junk rows in their own screens; they
  can't be used to read or change the owner's data, and the server functions ignore them.
- The access-approval gate (`User.access_status`) is enforced in the browser only; data access is still
  limited by RLS to the account's own records.
- `react-router` 6.x has a moderate advisory (open redirect via backslash in `<Link>`), not reachable
  here (no user-controlled links); fixed only in v7.
- Nedarim payment key (`nedarimConfig`) is sent to the station's browser because the payment iframe needs
  it — only to the owner and to accepted stations of their network.
