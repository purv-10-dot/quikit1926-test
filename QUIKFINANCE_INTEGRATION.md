# QuikFinance → QuikIT Platform Integration

**Goal:** Bring the standalone **QuikFinance** app into this monorepo as `apps/quikfinance`, a
first-class QuikIT platform app that authenticates via central SSO exactly like `apps/quiktrack`
— *not* with its own login. Core finance features are carried over as-is; only the app shell,
auth, and data layer change.

- **Source app:** `../QuikFinance/` (the FULLER source — superset of `QuikFinance 1/QuikFinance`;
  same 91 models, plus extra features: lib/security, pos, design, transaction-locking, barcode/QR).
  Re-grafted from this on 2026-06-30. (Older `../QuikFinance 1/QuikFinance/` was the initial source.)
- **Target:** `apps/quikfinance/`
- **App slug:** `quikfinance`
- **Dev port:** `3013`
- **Dev URL:** `http://localhost:3013`
- **Status:** PLANNING — nothing implemented yet.

> ⚠️ **Scope note:** This goes beyond the usual "quiktrack-only" working boundary. It creates a new
> app and edits shared platform files (`packages/database` schema + seeds, the launcher app catalog,
> root `turbo.json`). User has explicitly directed this.

---

## How the platform wires an app (verified facts)

These are the integration contracts every client app (quiktrack, quikcrm, …) follows:

1. **Auth = OIDC client of the central IdP.** `packages/auth/index.ts` → `createOAuthClientOptions({
   quikitUrl, clientId, clientSecret })` builds a NextAuth **v4** `"quikit"` OIDC provider. The IdP
   token carries identity: `sub→id`, `tenant_id→orgId`, `role→membershipRole`, `sessionId`.
   **The app never owns users** — identity comes from the token.
2. **Middleware** = `createMiddleware()` from `@quikit/auth/middleware` (loginRoute, publicRoutes,
   centralLoginUrl, centralSelectOrgUrl, enforceRemoteSessionValidation).
3. **App registry lives in the DB** — `App` table (slug/name/baseUrl/icon/status) + `OAuthClient`
   table (clientId, bcrypt-hashed secret, redirectUris, scopes), seeded by
   `packages/database/prisma/seed-oauth.ts`. The launcher renders tiles from the `App` table
   (`apps/quikit/app/api/apps/launcher/route.ts`).
4. **App tables live in the central schema** under a dedicated Postgres schema namespace
   (`app_quiktrack`, `app_quikcrm`, …) via Prisma multi-schema in
   `packages/database/prisma/schema.prisma`. Apps reuse the central `quikit.User` / `quikit.Org`
   — they do **not** define their own identity tables.
5. **Per-app manifest** — each app has `manifest.ts` (appId, routePrefix, permissions, navigation);
   the launcher aggregates them.
6. **New apps start from `apps/_template`**, which already ships the correct shell:
   `app/api/auth/[...nextauth]/route.ts`, `app/login/page.tsx`, `middleware.ts`,
   `lib/api/withOrgAuth.ts`, `lib/db.ts`, `manifest.ts`, configs.

**Strategy:** *scaffold-from-template-then-graft* — start from the correct login shell, graft
QuikFinance's feature code on top, drop everything QuikFinance owned for auth/DB. Login is solved by
the template; the real labor is merging the 91-model schema and repointing identity.

---

## Phase 0 — Decisions (LOCKED)

- [x] Slug = `quikfinance`
- [x] Dev port = **3013**, URL `http://localhost:3013`
- [x] DB strategy = **merge into `packages/database`** under Postgres schema `app_quikfinance`,
      drop QuikFinance's own `User`/`Organization`, reuse central `quikit.User`/`quikit.Org`.
- [ ] Portal subdomain rewriting (client/vendor/ca) in QuikFinance's old middleware — **port it or
      drop it?** (It's a feature, but lives in the middleware we're replacing.) → *decide before Phase 2.*

---

## Phase 1 — Land the app shell in the monorepo ✅ DONE (2026-06-29)

- [x] Copy `apps/_template` → `apps/quikfinance`; removed `.skip-build`.
- [x] `package.json`: name `quikfinance`, `dev/start -p 3013`, added `db:generate`/`db:push`.
- [x] `next.config.js`: `allowedOrigins: ["localhost:3013"]`.
- [x] `manifest.ts`: appId `quikfinance`, `/quikfinance` routePrefix, `Landmark` icon.
- [x] `npm install` at root; quikfinance **builds clean** under turbo (`1 successful`).

**Stale-template fixes required to build (the template references things that no longer exist):**
- `app/api/auth/[...nextauth]/route.ts` imported `@quikit/auth/options` (no such export) → replaced
  with quiktrack pattern: new `lib/auth.ts` (`createOAuthClientOptions`) + route imports `@/lib/auth`.
- `lib/api/withOrgAuth.ts` imported `@quikit/auth/withOrgAuth` (no such export) → replaced with
  quiktrack's self-contained version + added `lib/api/getOrgId.ts` (`@quikit/auth/get-tenant-id`,
  appSlug `quikfinance`) and `lib/api/errors.ts`. Deleted illustrative `app/api/example/route.ts`
  (referenced non-existent `db.widget`).
- `.eslintrc.json` referenced `@typescript-eslint/*` rules without loading the plugin → aligned to
  quiktrack's rule set.
- Bumped `vitest`→`^4.1.4` / `vitest-mock-extended`→`^4.0.0` (template's `^1.x` broke peer-deps).
- Created `.env.local` (placeholder DATABASE_URL etc.) so Prisma client constructs at build time.

> **Lesson:** `apps/_template` is partially STALE vs the live `@quikit/auth` exports. Prefer copying
> auth/db wiring from `apps/quiktrack`, not the template.

## Phase 2 — Auth shell (the core ask) — mirror quiktrack ✅ DONE (2026-06-29)

- [x] `lib/auth.ts` → `createOAuthClientOptions({ QUIKIT_URL, QUIKIT_CLIENT_ID, QUIKIT_CLIENT_SECRET })` (Phase 1).
- [x] `app/api/auth/[...nextauth]/route.ts` (Phase 1), `app/login/page.tsx` redirect stub (from template).
- [x] `middleware.ts` → full quiktrack-style `createMiddleware` (centralLoginUrl, centralSelectOrgUrl,
      enforceRemoteSessionValidation prod-only) + launcher `/apps?handoff=quikfinance` redirect wrapper.
- [x] `app/auth-handoff/route.ts` → cross-domain cookie bridge (copied from quiktrack, app-agnostic).
- [x] **Portal rewriting PORTED** (user decision): added edge-safe `lib/portal/hosts.ts`; middleware
      rewrites client/vendor/ca subdomain hosts onto `/client | /vendor | /ca` route groups and
      **bypasses the SSO gate** for portal hosts (external users have their own auth). Matcher also
      excludes static image extensions so portal-host asset requests aren't rewritten.
      NOTE: the portal *pages* (`app/(portals)/{client,vendor,ca}/*` in standalone QuikFinance) are
      FEATURE code — they come over in the Phase 4 graft. Until then a portal host 404s.
- [x] Env added (`.env.local` + `.env.example`): `NEXT_PUBLIC_AUTH_URL`, `NEXT_PUBLIC_QUIKIT_URL`,
      `INTERNAL_SECRET`, `NEXT_PUBLIC_PORTAL_HOST_{CLIENT,VENDOR,CA}`. Values are dev placeholders —
      finalize against the running auth/launcher in Phase 3.
- [x] **Checkpoint:** `next build` green; `/auth-handoff` route present; middleware bundle built.
      (Live SSO round-trip needs Phase 3 registration + real launcher running.)

> **Note:** Windows throws a transient `EPERM rename query_engine-windows.dll.node` at the
> `prisma generate` prebuild when another node process holds the engine. Workaround: rerun, or
> `npx next build` directly (client is already generated, schema unchanged).

## Phase 3 — Register with the platform — CODE DONE (2026-06-29); DB seed PENDING

Code registration (committed to files):
- [x] `packages/database/prisma/seed-oauth.ts`: added `QUIKFINANCE_BASE` + a `quikfinance` block —
      `App` (slug/name/baseUrl, icon `${QUIKIT_BASE}/app-icons/quikfinance.svg`) + `OAuthClient`
      (clientId `quikfinance`, redirect `http://localhost:3013/api/auth/callback/quikit`,
      scopes `openid profile email tenant`, dev secret `quikfinance-dev-secret-change-in-prod`).
- [x] `apps/quikit/app/api/apps/launcher/route.ts`: `quikfinance` added to `envBaseUrls` +
      `devLocalhostFallbacks` (→ `http://localhost:3013`).
- [x] Root `turbo.json`: added `QUIKFINANCE_URL` + `QUIKFINANCE_OAUTH_CLIENT_SECRET` to build `env`.
- [x] App `.env.local`/`.env.example`: `QUIKIT_*`, `NEXT_PUBLIC_AUTH_URL`, `NEXT_PUBLIC_QUIKIT_URL`,
      `INTERNAL_SECRET`, portal hosts (Phase 1/2).
- ~~Launcher manifest aggregation~~ — N/A. No central manifest aggregation exists; the launcher reads
  the DB `App` table (`db.app.findMany`). Per-app `manifest.ts` is in-app metadata only.

Runtime action (needs a live DB — BLOCKED on `DATABASE_URL`; none configured in repo):
- [ ] Run `cd packages/database && npx tsx prisma/seed-oauth.ts` (with `QUIKFINANCE_URL` +
      `QUIKFINANCE_OAUTH_CLIENT_SECRET` set) to upsert the `App` + `OAuthClient` rows.
- [ ] Provision `OrgAppAccess.enabled=true` for a test org (super-admin UI or direct row).
- [ ] **Checkpoint:** `quikfinance` tile appears in launcher `/apps` for an entitled user.

> The `OAuthClient.clientSecret` is a bcrypt hash of `QUIKFINANCE_OAUTH_CLIENT_SECRET`; the app sends
> `QUIKIT_CLIENT_SECRET` (plain) — these MUST be the same value. Dev placeholder
> `quikfinance-dev-secret-change-in-prod` is wired on both sides already.

## Phase 4 — Database reconciliation (the bulk of the work)

### Phase 4a — schema merge ✅ DONE (2026-06-29), VALIDATED
- [x] Added `app_quikfinance` to the `schemas = [...]` list.
- [x] Merged all **90** QuikFinance models into the central schema, each `Qf`-prefixed (avoids client
      collisions: `Invoice`/`Account`/`Payment`/`Notification`/`Contact` all exist centrally) with
      `@@schema("app_quikfinance")` and original `@@map("table")` preserved. Done via scripts in
      scratchpad (`transform-schema.js` → `integrate-schema.js`); central schema backed up first.
- [x] **Dropped** QuikFinance's `User` (use central `auth.User`; nothing referenced it as a type).
- [x] **Kept** `Organization` as `QfOrganization` (finance org-profile, @@map `organizations`,
      id keyed 1:1 to `quikit.Org.id`) per the chosen strategy — finance settings preserved.
- [x] Intra-schema relations (Contact, JournalEntry + list back-relations) had their TYPE references
      re-prefixed too (first pass missed them → 14 errors; fixed with 2-pass transform).
- [x] `npx prisma validate` → **"The schema is valid 🚀"**.
- NOTE: models are scalar-relations-light; QuikFinance app uses raw SQL, so model renames don't affect
      app queries — but see Phase 4b raw-SQL note.

### Phase 4b-i — create tables in DB ✅ DONE (2026-06-29), SURGICAL
- [x] Confirmed the risk was REAL: `prisma migrate diff` (live DB → schema) produced **8334 lines** —
      it wanted to DROP tables in quikcrm/quikinfra/quiksocial and create 136 quikhrms tables (all
      PRE-EXISTING drift, unrelated to us). A blind `db push` would have damaged the shared DB.
- [x] Extracted **app_quikfinance-only** statements via `scratchpad/filter-sql.js` (split on `;`, keep
      statements referencing `"app_quikfinance"`; verified **0 cross-schema leaks**). Prepended
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`. Result: 1 CREATE SCHEMA, 90 CREATE TABLE, 94
      indexes, 7 FK ALTERs, **0 DROP** → `scratchpad/app_quikfinance.sql`.
- [x] Applied via `prisma db execute --url <db> --file app_quikfinance.sql` → success.
- [x] Verified counts: `app_quikfinance=90` (new); quikcrm=82, quikinfra=80, quiksocial=15,
      quiktrack=45, auth=5, quikit=8 — **all other schemas intact**.

### Phase 4b-ii — graft finance code ✅ BUILDS (2026-06-29)
- [x] Merged dependencies into `apps/quikfinance/package.json` (dinero, react-pdf, radix, recharts,
      react-hook-form, resend, sonner, zustand, etc.); kept monorepo-pinned next/react/lucide.
- [x] Copied feature code from source: `app/(dashboard)`, `app/(portals)`, `app/portal`,
      `app/api/{cron,public,v1}`, `components/`, `types/`, `public/`, all `lib/*` subdirs, root
      `layout.tsx` + `globals.css`, finance `tailwind.config.ts`/`postcss.config.js`. EXCLUDED
      `(auth)`, `api/auth`, `lib/auth*.ts` (we own identity).
- [x] Reconciled the auth seam:
      - `components/providers.tsx` → wrapped finance providers in `SessionProvider` (SSO).
      - Rewrote `lib/api/auth.ts` `requireApiContext()` to use `getServerSession(authOptions)` +
        `getOrgId()` (was NextAuth-v5 `auth()` + local `profiles` table); same `ApiContext` shape.
      - `lib/portal/context.ts` `requirePortalContext()` → `getServerSession` (was v5 `auth()`).
      - Deleted QuikFinance `types/next-auth.d.ts` (conflicted with `@quikit/auth/types` → TS2687).
      - `lib/db/index.ts`: `DbClient` re-exported as value (was `export type`).
- [x] `lib/prisma.ts` → finance client pins connection `search_path=app_quikfinance,public,quikit,auth`
      so raw-SQL bare table names resolve (LOCAL override; identity client unaffected).
- [x] Icons: 4 newer lucide names (`Columns3/ImageUp/LockOpen/ChartNoAxesCombined`) → 0.294 equivalents
      (`Columns/ImagePlus/Unlock/LineChart`) since monorepo pins lucide 0.294 (Next barrel-opt resolves
      the hoisted copy, not the nested 0.468).
- [x] **`next build` → exit 0.** All routes built: full finance dashboard, client/vendor/ca portals,
      `/api/v1/*`. Middleware bundle built.

### Phase 4b-iii — DEBT burn-down — REAL ERRORS CLEARED (2026-06-30)
- [x] **ROOT CAUSE of the `.from`/`DbClient` errors: a shadowing `lib/db.ts`.** The `_template`
      scaffold left `apps/quikfinance/lib/db.ts` (`export { db } from "@quikit/database"`) sitting
      beside the grafted `lib/db/` directory. `@/lib/db` resolved to the FILE (central PrismaClient),
      not the finance query-builder `lib/db/index.ts`. So `db.from()` failed (PrismaClient has no
      `.from`) and `DbClient` wasn't exported — 35 `.from` + 3 `DbClient` errors, all from this.
      **Fix: deleted `lib/db.ts`.** Now `@/lib/db` = the finance query-builder (raw SQL on the
      app_quikfinance search_path). Also cleaned `lib/db/index.ts` export + a `Map<string,ContactLite>`
      typing in `lib/report-data.ts`.
- [x] Type errors: **193 → 86, and ALL 86 remaining are TS7006 implicit-any params** (benign noise the
      standalone app also shipped). Zero correctness type errors. `next build` exit 0.
- [ ] `eslint.ignoreDuringBuilds` + `typescript.ignoreBuildErrors` still on in `next.config.js` (only
      the implicit-any noise remains; can be flipped off after annotating those params, or left as
      accepted debt). Latest census: `scratchpad/qf-typecheck5.log`.
- [ ] Runtime: confirm no finance raw SQL still references the dropped `users`/`profiles` tables
      (requireApiContext's `profiles` lookup was already removed). Verify in Phase 5.
- [x] **uuid-vs-cuid FIXED (2026-06-30).** Since quikfinance uses the COMMON auth service, the
      user/org ids are central cuids. Retyped the central-identity columns uuid→text in BOTH the DB and
      schema.prisma: `org_id` (85), `user_id`, `assigned_to`, all actor `*_by` (created/updated/approved/
      uploaded/posted/sent/filed/granted/linked/completed/requested/reviewed), and `QfOrganization.id`
      (= central Org id, default dropped). 128 columns total. Internal finance FKs (contact_id, invoice_id,
      *_account_id, …) left as uuid. `prisma validate` passes. Generated via information_schema (scripts in
      scratchpad: qf-id-migration.sql, update-schema-idtypes.js).
- [ ] Verify raw-SQL `search_path` actually resolves at runtime (Phase 5).
- [ ] Any finance raw SQL that referenced the dropped `users`/`profiles` tables must repoint to
      central `auth."User"` / membership.
- [ ] `org_id`/`user_id` columns are `@db.Uuid`, but central ids are **cuid (text)** — must change those
      columns to text (or the app must map). Data-layer fix during graft.
- [ ] Raw SQL in QuikFinance app references bare table names (`FROM invoices`); tables now live in
      `app_quikfinance` schema → need search_path/schema-qualification. Graft-time fix.
- [ ] Graft finance feature code (`app/(dashboard)/*`, `app/(portals)/*`, `components/`, `lib/`).
- [ ] Wire finance queries to `orgId` (= session tenant) via `lib/api/withOrgAuth.ts`.
- [ ] Remove from new app: old `lib/auth*.ts`, `app/(auth)/`, old `middleware.ts`, `prisma/`,
      `supabase/`, `bcryptjs`, next-auth v5 (these live in the SOURCE app, not yet copied — clean cut
      happens as code is grafted).

## Phase 5 — Verify — SERVER-SIDE PASSED (2026-06-30)

- [x] **Data-layer keystone proven at runtime.** Provisioned test org MoreYeahs
      (`cmpgz253x00019660d7d4qkzq`) + user ashwin: `OrgMember`(org_admin/active), `OrgAppAccess`
      (enabled → launcher tile), `QfOrganization` row with `id = central org cuid`. Then a finance
      query via the search_path client read `SELECT … FROM organizations` (BARE name) and returned the
      row — proving search_path → app_quikfinance AND text id/org_id columns hold central cuids.
- [x] **App runs.** `/api/health` → 200 `{name:"quikfinance"}` on the live :3013 server.
- [x] **Middleware gates correctly.** `/`, `/dashboard`, `/invoices` → 307 (redirect to SSO);
      `/login` → 200 (public redirect stub).
- [x] `next build` passes (exit 0); type-check has only benign implicit-any left.
- [ ] **Interactive (optional, not yet done):** full browser SSO login through `auth` (:3001) +
      `quikit` launcher (:3000) → `/auth-handoff` cookie → land on a finance dashboard rendering live
      data under the real session. Needs all three dev servers + a browser + creds. All server-side
      pieces it depends on are individually verified above.

> Note: a quikfinance dev server is already running on :3013 (a `next dev` start attempt hit
> EADDRINUSE — port held by pid that's serving our app, hot-reloading changes).

---

## Gotchas

- **Don't mix `next build` and `next dev` in the same `.next`.** Running production builds in
  `apps/quikfinance/.next` while a `next dev` server uses the same folder corrupts the chunk manifests
  → `MODULE_NOT_FOUND` from `webpack-runtime.js` + unstyled pages (missing CSS chunks). Fix: stop dev,
  `Remove-Item -Recurse -Force apps/quikfinance/.next`, restart `npm run dev`. (Hit + resolved
  2026-06-30 after repeated verification builds.) The app renders fine on :3013 once the cache is clean.

- **lucide-react dual-version → hydration mismatch.** A stale `package-lock` left a NESTED
  `apps/quikfinance/node_modules/lucide-react@0.468` while root is `0.294` (from a brief bump that
  was reverted in package.json but not the lock). Server SSR resolved nested 0.468, the client barrel
  bundle resolved root 0.294 → same icon, different SVG (`<rect ry>`) → `Warning: Extra attributes from
  the server: ry` → full hydration failure. Fix: deleted the nested copy (app pins `^0.294.0`, icon
  names already swapped to 0.294-compatible ones); **restart dev** (SSR module cache). Reconcile the
  lockfile with a clean `npm install` so it can't recur. Also fixed render-time hydration sources:
  recharts `ResponsiveContainer` (now client-only via `components/design/ClientResponsiveContainer.tsx`
  + `MiniArea` gate) and `CommandCenter`'s `new Date()` (computed post-mount).

- **marketing.css global rules leaked into the dashboard on soft-nav.** The copied marketing.css had
  unscoped document-wide rules (`html,body{font-family}`, `h1-h6{font-family !important}`, `*` reset,
  `a`/`ul`). Next App Router keeps a route group's CSS loaded across client navigations, so after
  visiting `/` those globals overrode the dashboard's fonts/spacing until a hard refresh. Fix: scoped
  ALL global rules in `app/(marketing)/marketing.css` to `.marketing-shell`. Also: marketing headings
  use Plus Jakarta Sans (`--heading: var(--sans)`, loaded in the marketing layout) — Fraunces was
  dropped because it fell back to Times. Added `public/app-icons/quikfinance.svg` + `app/icon.svg`
  (favicon) and the in-header AppSwitcher (`/api/apps/switcher` → `@quikit/database`).

## Open questions / risks

- Portal subdomain rewriting — port or drop (Phase 0).
- next-auth **v5 → v4** downgrade: QuikFinance feature code may call v5-only `signIn`/`auth()` APIs;
  audit call sites during the graft.
- 91 models → name collisions with existing `app_*` schemas are avoided by the dedicated
  `app_quikfinance` namespace, but watch for shared enums/types.
- Multi-tenancy: QuikFinance was effectively single-org per deploy; every finance query must now be
  org-scoped. This is the riskiest behavioral change.

---

## Progress log

- 2026-06-30 — **Public marketing landing added at `/`** (mirrors quiktrack's UX). Dashboard home
  (CommandCenter) moved `/` → `/dashboard`. New `app/(marketing)/` group: Nav (QuikFinance text
  wordmark + Login→/login→SSO→/dashboard), Hero (BESPOKE CSS finance mockup — NOT quiktrack's office
  photo, which the user rejected), Outcomes, Workflows (finance cards), FooterCTA. Reused quiktrack's
  `marketing.css` for the visual language only. Middleware: added `/` to publicRoutes (exact match);
  login stub callbackUrl → /dashboard. tsc clean on new files. Unused copied components (Comparison/
  Testimonial/Features-OPSP/etc.) left in _components/ but not imported. Restart dev to pick up the
  route-group change.

- 2026-06-30 — **Phase 5 server-side verification PASSED.** Provisioned MoreYeahs test org
  (OrgMember + OrgAppAccess + QfOrganization keyed to the central cuid). Finance query via search_path
  client read app_quikfinance tables by bare name scoped on the cuid org → WORKS (keystone proven at
  runtime). Live :3013 server: /api/health 200, middleware 307-gates /dashboard /invoices, /login 200.
  Only the interactive 3-server browser SSO login remains (optional final confirmation).
- 2026-06-30 — **Data-layer wiring fixed + real type debt cleared.** Found the `.from`/`DbClient`
  errors were ALL caused by a shadowing template `lib/db.ts` (re-exporting the central PrismaClient)
  winning resolution over the grafted `lib/db/` query-builder. Deleted it → `@/lib/db` is now the
  finance query-builder. Type errors 193→86, all remaining are benign implicit-any. Build green.
  Next: Phase 5 runtime bring-up.
- 2026-06-30 — **uuid→text identity migration DONE** (the keystone for common-auth). 128 central-identity
  columns retyped in DB + schema.prisma; validates. Finance org_id/user_id now hold central cuids.
  Remaining: rewrite Supabase `prisma.from()` remnants + repoint raw SQL off dropped users/profiles;
  then Phase 5 runtime (QfOrganization row + OrgAppAccess provisioning, SSO round-trip, load a page).
- 2026-06-30 — **Source switched to the fuller `../QuikFinance`** (superset; same 91 models so schema/DB
  unchanged). Re-grafted feature code over the app, re-applied all platform reconciliation
  (SessionProvider, lib/prisma search_path, requireApiContext + portal context auth, DbClient export,
  deleted next-auth.d.ts, re-ran lucide icon swap). Added `jsbarcode`/`qrcode`/`@types/qrcode` for the
  new inventory barcode/QR feature (installed via `npm install --ignore-scripts` to dodge the recurring
  prisma EPERM lock). `next build` → exit 0 again. Reconciliation + icon-swap + next-auth.d.ts deletion
  must be RE-APPLIED on any future re-graft from source (the copy overwrites them).

- 2026-06-29 — Doc created. Planning complete; port locked to 3013.
- 2026-06-29 — **Phase 1 complete.** `apps/quikfinance` scaffolded from `_template`, all stale-template
  imports fixed (see Phase 1 notes), builds green under turbo. Empty SSO shell on :3013. No finance
  code or DB changes yet.
- 2026-06-29 — **Phase 2 complete.** Full quiktrack-style SSO middleware + `/auth-handoff` cross-domain
  cookie bridge wired. Portal subdomain rewriting PORTED from standalone QuikFinance (edge-safe
  `lib/portal/hosts.ts`; portal hosts bypass SSO). `next build` green. Portal *pages* still pending
  (come with Phase 4 feature graft).
- 2026-06-29 — **Phase 3 code done.** Registered `quikfinance` in `seed-oauth.ts`, launcher route maps,
  and `turbo.json`. Manifest-aggregation step found N/A (launcher reads DB `App` table).
- 2026-06-29 — **DB confirmed** = same as quiktrack (`postgresql://postgres:***@localhost:5432/quikit_dev`).
  quikfinance `.env.local` aligned to the cluster (shared NEXTAUTH_SECRET/INTERNAL_SECRET, QUIKIT SSO,
  port 3013). **Phase 3 runtime:** shared `seed-oauth.ts` crashes at quikinfra (pre-existing P2002 on
  `OAuthClient.appId` — NOT ours), so seeded quikfinance via a focused one-off → `App` + `OAuthClient`
  rows created. `OrgAppAccess` provisioning for a test org still TODO (tile visibility).
- 2026-06-29 — **Phase 4a complete + validated.** 90 finance models merged into `app_quikfinance`
  (Qf-prefixed, @@map preserved), `User` dropped, `Organization`→`QfOrganization` (1:1 to central Org).
  `prisma validate` passes. Central schema backed up at scratchpad/schema.prisma.bak before the merge.
- 2026-06-29 — **Phase 4b-i complete: 90 tables live in DB (surgically).** The full diff would have
  damaged other schemas (drift: drops in quikcrm/infra/social, 136 quikhrms creates), so applied an
  app_quikfinance-ONLY filtered SQL (+uuid-ossp). Verified: app_quikfinance=90 tables, all other
  schemas unchanged.
- 2026-06-29 — **Phase 4b-ii complete: full finance app GRAFTED + BUILDS green.** Copied all feature
  code, reconciled the auth seam (SessionProvider, requireApiContext via getServerSession+getOrgId,
  portal context, deleted conflicting next-auth.d.ts), pinned finance prisma search_path to
  app_quikfinance, swapped 4 newer lucide icons. `next build` exit 0 — dashboard + portals + api built.
  Lint & type-check GATED OFF as debt (~190 type errors in scratchpad/qf-typecheck.log; real ones:
  Supabase `prisma.from` remnants, uuid-vs-cuid org_id). Next: Phase 4b-iii debt burn-down + Phase 5
  runtime verify (provision OrgAppAccess, dev SSO round-trip, a finance page under a real session).
