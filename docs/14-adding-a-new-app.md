# 14 — Adding a New App to the QuikIT Monorepo

> **Audience:** a developer bringing a brand-new app (or an existing standalone app) into this
> monorepo as a first-class QuikIT platform app that authenticates via **central SSO** — exactly
> like `apps/quiktrack`, `apps/quikfinance`, and `apps/quikasset`.
>
> **Worked examples:** `QUIKASSET_INTEGRATION.md` (cleanest, most recent — port 3012, self-contained
> schema) and `QUIKFINANCE_INTEGRATION.md` (documents the hard edge cases — raw-SQL search_path,
> uuid→cuid, shadowing `lib/db.ts`). Both live at the repo root. Read whichever is closest to your app.

---

## Mental model — how the platform wires an app

Every client app (quiktrack, quikcrm, quikfinance, quikasset, …) follows the same five contracts.
**The app never owns identity** — users and orgs come from the central IdP token.

1. **Auth = OIDC client of the central IdP.** `packages/auth` → `createOAuthClientOptions({ quikitUrl,
   clientId, clientSecret })` builds a NextAuth **v4** `"quikit"` OIDC provider. The token carries
   identity: `sub→id`, `tenant_id→orgId`, `role→membershipRole`, `sessionId`.
2. **Middleware** = `createMiddleware()` from `@quikit/auth/middleware` (loginRoute, publicRoutes,
   centralLoginUrl, centralSelectOrgUrl, enforceRemoteSessionValidation), wrapped to hand off through
   the launcher.
3. **App registry lives in the DB** — the `quikit.App` table (slug/name/baseUrl/iconUrl/status) +
   `OAuthClient` table (clientId, bcrypt-hashed secret, redirectUris, scopes), seeded by
   `packages/database/prisma/seed-oauth.ts`. The launcher renders tiles from the `App` table.
4. **App tables live in the central DB** under a dedicated Postgres schema namespace (`app_quiktrack`,
   `app_quikasset`, …) via Prisma multi-schema. Apps reuse central `quikit.User`/`quikit.Org` and add
   a plain `orgId String` column for tenant scoping — they do **not** define their own identity tables.
5. **Per-app `manifest.ts`** (appId, routePrefix, icon, navigation) is in-app metadata only. There is
   **no** central manifest aggregation — the launcher reads the DB `App` table.

**Strategy: scaffold-from-template, then graft.** Start from `apps/_template` (correct login shell),
graft your feature code on top, and drop everything the source app owned for auth/DB. Login is solved
by the shell; the real labor is the schema merge and repointing identity.

> ⚠️ **Scope:** adding an app edits shared platform files (`packages/database` schema + seeds, the
> launcher route, root `turbo.json`, `@quikit/ui` app-switcher). This goes beyond a single-app working
> boundary — get explicit direction before starting.

---

## Phase 0 — Decisions (lock these first)

- [ ] **Slug** — lowercase, e.g. `quikasset`. Used as the app folder name, `clientId`, schema prefix.
- [ ] **Dev port** — pick a free one (see table below). Set consistently in **five** places.
- [ ] **Model prefix** — a 2–3 char PascalCase prefix for every model + enum (`Qf` for finance,
      `Ast` for asset) to avoid Prisma client collisions with existing `app_*` schemas.
- [ ] **DB strategy** — merge into `packages/database` under Postgres schema `app_<slug>`; reuse central
      `quikit.User`/`quikit.Org`; scope every table with a plain `orgId String`.

### Port map (authoritative — package.json dev ports + launcher fallbacks)

| Port | App | | Port | App |
|---|---|---|---|---|
| 3000 | quikit (launcher) | | 3007 | quiksocial |
| 3001 | auth (central IdP) | | 3008 | quikcrm |
| 3002 | admin | | 3009 | quikhrms |
| 3003 | quikscale | | 3010 | quiksupport |
| 3004 | quiktrack | | 3011 | *free* |
| 3005 | quikvc | | 3012 | quikasset |
| 3006 | quikinfra | | 3013 | quikfinance |

> The template ships default `-p 3010`, which now **collides with quiksupport** — always change it.
> Next free ports: **3011**, then **3014+**. Do NOT trust the port comment in `seed-oauth.ts` (it is
> internally inconsistent per `port-audit.txt`); trust package.json + the launcher fallbacks.

---

## Phase 1 — Land the app shell

1. Copy `apps/_template` → `apps/<slug>`.
2. **Delete `apps/<slug>/.skip-build`** (the template is marked non-buildable). Workspaces auto-pick up
   `apps/*` — you do **not** edit the root `package.json` `workspaces` array.
3. `package.json`: set `"name": "<slug>"`; change `dev`/`start` ports to your port; keep the
   `prebuild: prisma generate --schema=../../packages/database/prisma/schema.prisma`.
4. `next.config.js`: set `experimental.serverActions.allowedOrigins: ["localhost:<port>"]`. Keep the
   CSP/security `headers()` block.
5. `manifest.ts`: set `appId`, `name`, `routePrefix`, `icon` (a lucide name), and `navigation`.
6. Customize `apps/<slug>/CLAUDE.md` (app-scoped rules override the root CLAUDE.md).
7. `npm install` at root → confirm the app **builds under turbo**.

> ⚠️ **The template is partially STALE vs the live `@quikit/auth` exports.** The template's
> `app/api/auth/[...nextauth]/route.ts` imports `@quikit/auth/options` and `lib/api/withOrgAuth.ts`
> imports `@quikit/auth/withOrgAuth` — **neither export exists**. Also delete the illustrative
> `app/api/example/route.ts` (references a non-existent `db.widget`). **Copy auth/db wiring from
> `apps/quiktrack`, not the template** (Phase 2).

---

## Phase 2 — Auth shell (mirror `apps/quiktrack`)

Copy these from `apps/quiktrack`, changing only the slug where noted:

| File | Change |
|---|---|
| `lib/auth.ts` | Copy verbatim — reads `QUIKIT_URL`/`QUIKIT_CLIENT_ID`/`QUIKIT_CLIENT_SECRET`; builds `createOAuthClientOptions`. |
| `app/api/auth/[...nextauth]/route.ts` | `import { authOptions } from "@/lib/auth"` → `NextAuth(authOptions)`. |
| `lib/api/withOrgAuth.ts` | Self-contained: `getServerSession` → `getOrgId` → optional `gateModuleApi("<slug>", …)`. **Change the app slug** in `gateModuleApi`. |
| `lib/api/getOrgId.ts` | `createGetOrgId(authOptions, { appSlug: "<slug>" })`. **Change `appSlug`.** |
| `lib/api/errors.ts` | Copy verbatim (app-agnostic `toErrorMessage`). |
| `lib/db.ts` | `export { db } from "@quikit/database";` (keep for a Prisma-client app). |
| `middleware.ts` | Full quiktrack pattern: `createMiddleware` + launcher handoff `${QUIKIT_URL}/apps?handoff=<slug>`. **Change `APP_SLUG`**, `publicRoutes`, and the matcher. |
| `components/providers.tsx` | Provider order is fixed: **`SessionProvider → QueryClientProvider → ThemeProvider`**. |

> **Trap (from QuikFinance):** if your app carries a raw-SQL query-builder under `lib/db/`, the
> template's `lib/db.ts` file shadows `lib/db/index.ts` in module resolution and breaks `db.from()` /
> `DbClient`. Delete `lib/db.ts` in that case. For a plain Prisma-client app (like quikasset), keep it.

**Checkpoint:** `next build` green; `/api/auth/[...nextauth]` present; middleware bundle built.

---

## Phase 2b — RBAC / roles & permissions (NOT in the template — copy from quiktrack)

> The template ships **only the auth shell** — none of the runtime RBAC v2 machinery. If your app needs
> fine-grained roles & permissions (most do), copy this whole set from `apps/quiktrack` and rename the
> slug/prefix. Full explanation in **doc 15 — App Role Permissions**.

The **data model** (`<Prefix>AppRole` / `RolePermission` / `RoleNavigation` / `UserAppRole` /
`UserPermissionExtra`) lives in the **central** `packages/database/prisma/schema.prisma` under
`app_<slug>` (added in Phase 4) — not in per-app files. The per-app **code** to copy:

| File (copy from `apps/quiktrack`) | What to change |
|---|---|
| `lib/api/permissionsRegistry.ts` | Replace `PERMISSION_TREE` with your resources + `ENTITY_TO_NAV` map. |
| `lib/api/permissions.ts` | The `userCan()` engine — repoint `db.qt*` → `db.<prefix>*`; rename `is<App>AppAdmin`, `getAppId` (cached slug lookup). |
| `lib/api/requireAdmin.ts` | `createRequireAdmin(authOptions, { extraAdminCheck: is<App>AppAdmin })`. |
| `lib/api/seedAdminAppRole.ts` | `seedAdminAppRole` / `seedUserAppRole` / `seedAllDefaultRoles` / `ensureUserOnRole`. |
| `app/api/me/permissions/route.ts` | Serve effective set + lazy `seedAllDefaultRoles` on first fetch. |
| `app/api/internal/provision-roles/route.ts` | INTERNAL_SECRET-guarded service seed (paired with `provisionAppRoles.ts` — §3.5). |
| `app/api/org/roles/route.ts` + `[id]/**` | Role CRUD (`GET`/`POST`, atomic `PUT` permissions replace). |
| `app/api/org/users/[id]/role/route.ts` | Assign role — **must** keep the entitlement precondition + admin-lockout guards. |
| `lib/hooks/useMyPermissions.ts` + `components/shell/require-perm.tsx` + sidebar `hasNav` gating | Client-side gates. |

**Checkpoint:** `userCan()` compiles against your `db.<prefix>*` models; `next build` green.

---

## Phase 3 — Register the app with the platform

### 3.1 `packages/database/prisma/seed-oauth.ts`

Add a BASE constant (note the required `// prod-safety-allow:` comment — CI `prod-safety.yml` enforces it):

```ts
const QUIKASSET_BASE = resolveAppUrl("QUIKASSET_URL", "http://localhost:3012"); // prod-safety-allow: dev fallback
```

Append a block to the `APPS = [...]` array:

```ts
{
  slug: "quikasset",
  name: "QuikAsset",
  description: "IT & fixed-asset lifecycle management.",
  baseUrl: QUIKASSET_BASE,
  iconUrl: `${QUIKIT_BASE}/app-icons/quikasset.svg`,   // absolute → resolves cross-origin
  status: "active",
  oauth: {
    clientId: "quikasset",
    clientSecretPlain: resolveClientSecret("QUIKASSET_OAUTH_CLIENT_SECRET", "quikasset-dev-secret-change-in-prod"),
    redirectUris: [ `${QUIKASSET_BASE}/api/auth/callback/quikit` ],
    scopes: ["openid", "profile", "email", "tenant"],
  },
}
```

Rules: `clientId` = slug; `redirectUris` = `${BASE}/api/auth/callback/quikit`; scopes always
`["openid","profile","email","tenant"]`; the seed **bcrypt-hashes** `clientSecretPlain` into
`OAuthClient.clientSecret`, and the app sends the **same plain value** as `QUIKIT_CLIENT_SECRET` — they
must match.

> **Runtime gotcha:** the full `seed-oauth.ts` crashes partway on a pre-existing `quikinfra` P2002
> duplicate. Both prior integrations seeded their rows via a **focused one-off upsert** instead of
> running the whole script.

### 3.2 Launcher — `apps/quikit/app/api/apps/launcher/route.ts`

Add your slug to **both** maps:

```ts
const envBaseUrls = { …, quikasset: process.env.QUIKASSET_URL };
const devLocalhostFallbacks = { …, quikasset: "http://localhost:3012" };
```

Also add it to the admin app switcher's fallbacks: `apps/admin/app/api/apps/switcher/route.ts`.

### 3.3 Root `turbo.json` — add two env vars to `tasks.build.env`

```
"QUIKASSET_URL",
"QUIKASSET_OAUTH_CLIENT_SECRET",
```

### 3.4 App icon + favicon

- Add `<slug>.svg` to `apps/quikit/public/app-icons/`. Because the in-app **AppSwitcher** needs the
  icon on every origin, copy `<slug>.svg` into **every** app's `public/app-icons/` folder.
- `packages/ui/components/app-switcher.tsx`:
  - `BRAND_ICONS`: add `<slug>: "/app-icons/<slug>.svg"` (overrides the DB `iconUrl`).
  - `ICON_FALLBACKS` (optional): `<slug>: { emoji: "📦", bg: "bg-emerald-100" }`.
- Add `app/icon.svg` to your app (Next.js App Router auto-favicon).

### 3.5 RBAC auto-provision hook — `apps/quikit/lib/provisionAppRoles.ts`

Add `<slug>: "<SLUG>_URL"` to the `APP_URL_OVERRIDE` map so granting the app to an org auto-seeds its
roles via your app's `/api/internal/provision-roles` route (INTERNAL_SECRET-guarded — implement it;
see doc **15 — App Role Permissions**).

---

## Phase 4 — Database reconciliation (the bulk of the work)

`packages/database/prisma/schema.prisma`:

1. Add `"app_<slug>"` to the datasource `schemas = [...]` list (kept alphabetical).
2. Append all your models, each with `@@schema("app_<slug>")` and the original `@@map("table")`
   preserved. **Prefix every model + enum name** (`Ast*`, `Qf*`).
3. Reuse central identity — do **not** define your own User/Org. Scope tables with a plain
   `orgId String`. **Avoid `@db.Uuid`** on org/user id columns: central ids are **cuid (text)**
   (QuikFinance had to retype 128 uuid→text columns because of this; a self-contained schema like
   QuikAsset's — plain `orgId`/`appId` strings, no relations to `quikit.App`/`Org` — avoids the pain
   entirely and is the preferred shape).
4. `npx prisma validate` → must print **"The schema is valid 🚀"**.

### Creating the tables — NEVER `prisma db push`

A full `db push`/`migrate diff` against the shared dev DB will **drop other apps' tables** (there is
pre-existing drift across schemas). Instead:

1. `prisma migrate diff` (empty → schema) to generate the full SQL.
2. **Filter to `app_<slug>`-only statements** (a small script splitting on `;` and keeping statements
   that reference `"app_<slug>"`; verify **0 DROP** and **0 cross-schema leaks**). Prepend
   `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` if needed.
3. Apply with `prisma db execute --url <db> --file app_<slug>.sql`.
4. Verify table counts per schema — all other schemas must be unchanged.

Then graft your feature code (`app/`, `components/`, `lib/`, `types/`, `public/`), reconciling the auth
seam: wrap providers in `SessionProvider`; repoint any `requireApiContext()` to `getServerSession` +
`getOrgId()`; delete any conflicting `types/next-auth.d.ts`; ensure every query is `orgId`-scoped.

---

## Phase 5 — Provision & verify

- [ ] Seed the `App` + `OAuthClient` rows (focused upsert — §3.1).
- [ ] Grant a test org access: `OrgAppAccess.enabled = true` (super-admin UI at
      `/organizations/[id]`, or a focused seed script). The launcher tile only appears once this is set.
- [ ] Seed default app roles for the org (doc **15**).
- [ ] `next build` exit 0; `/api/health` → 200; middleware 307-gates protected routes; `/login` → 200.
- [ ] Interactive: browser SSO login through `auth` (:3001) + `quikit` launcher (:3000) → land on your
      dashboard rendering live data under the real session.

### `.env.local` (never committed)

`QUIKIT_URL`, `QUIKIT_CLIENT_ID=<slug>`, `QUIKIT_CLIENT_SECRET=<same plain value as seed>`,
`NEXT_PUBLIC_AUTH_URL`, `NEXT_PUBLIC_QUIKIT_URL`, `INTERNAL_SECRET`, `NEXTAUTH_SECRET`,
`NEXTAUTH_URL=http://localhost:<port>`, `DATABASE_URL`.

---

## Complete file inventory (everything a from-scratch app needs)

Every file/change the new app requires, grouped by **origin**. "Template" = comes from `_template`;
"Copy-QT" = copy from `apps/quiktrack` (template's version is missing/stale); "New" = author it;
"Shared" = edit a central platform file.

### A. In `apps/<slug>/` — the app itself

| File | Origin | Notes |
|---|---|---|
| `package.json` | Template | name = slug; dev/start port; keep `prebuild` prisma generate |
| `next.config.js` | Template | `allowedOrigins: ["localhost:<port>"]` |
| `manifest.ts` | Template | appId, name, routePrefix, icon, navigation |
| `middleware.ts` | **Copy-QT** | `APP_SLUG`, publicRoutes, matcher; launcher handoff |
| `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `.eslintrc.json`, `vercel.json` | Template | ship as-is |
| `CLAUDE.md` | Template | app-scoped rules (override root) |
| `app/layout.tsx`, `app/globals.css` | Template | `globals.css` must `@import "@quikit/ui/styles"` |
| `app/login/page.tsx` | Template | SSO redirect stub |
| `app/(dashboard)/layout.tsx` + `page.tsx` | Template → graft | replace with your feature UI |
| `app/api/health/route.ts` | Template | keep |
| `app/api/auth/[...nextauth]/route.ts` | **Copy-QT** | template version imports a non-existent export |
| `app/icon.svg` | **New** | favicon |
| `components/providers.tsx` | Template | order `SessionProvider → QueryClient → Theme` |
| `lib/auth.ts` | **Copy-QT** | template has none |
| `lib/db.ts` | Template | keep for Prisma-client app (delete if you carry a `lib/db/` query-builder) |
| `lib/utils.ts` | Template | keep |
| `lib/api/withOrgAuth.ts` | **Copy-QT** | template version is stale |
| `lib/api/getOrgId.ts` | **Copy-QT** | `appSlug: "<slug>"` — template has none |
| `lib/api/errors.ts` | **Copy-QT** | template has none |
| **RBAC set** (`lib/api/permissionsRegistry.ts`, `permissions.ts`, `requireAdmin.ts`, `seedAdminAppRole.ts`; `app/api/me/permissions/route.ts`, `app/api/internal/provision-roles/route.ts`, `app/api/org/roles/**`, `app/api/org/users/[id]/role/route.ts`; `lib/hooks/useMyPermissions.ts`, `components/shell/require-perm.tsx`) | **Copy-QT** | Phase 2b — none of this is in the template |
| `.env.local` | **New** | never committed (see Phase 5) |
| Delete: `.skip-build`, `app/api/example/route.ts` | — | template cruft |

### B. Shared platform files (edit these central files once)

| File | Change |
|---|---|
| `packages/database/prisma/schema.prisma` | `app_<slug>` in `schemas=[...]`; prefixed models + RBAC tables |
| `packages/database/prisma/seed-oauth.ts` | BASE constant + App/OAuthClient block |
| `apps/quikit/app/api/apps/launcher/route.ts` | `envBaseUrls` + `devLocalhostFallbacks` |
| `apps/admin/app/api/apps/switcher/route.ts` | `devLocalhostFallbacks` |
| `apps/quikit/lib/provisionAppRoles.ts` | `APP_URL_OVERRIDE` entry |
| `turbo.json` | `<SLUG>_URL` + `<SLUG>_OAUTH_CLIENT_SECRET` |
| `apps/quikit/public/app-icons/<slug>.svg` (+ copy into every app's `public/app-icons/`) | icon asset |
| `packages/ui/components/app-switcher.tsx` | `BRAND_ICONS` (+ optional `ICON_FALLBACKS`) |

### C. Runtime provisioning (not files — DB state)

| Action | How |
|---|---|
| Seed `App` + `OAuthClient` rows | focused upsert (full `seed-oauth.ts` crashes on quikinfra P2002) |
| `OrgAppAccess.enabled = true` for a test org | super-admin UI or focused seed — makes the tile appear |
| Seed default roles for the org | `seedAllDefaultRoles(orgId)` (auto-fires on first `/api/me/permissions` fetch) |

---

## Touchpoint checklist (copy into your PR description)

- [ ] `apps/<slug>/` scaffolded from `_template`; `.skip-build` + `api/example` deleted; port set in package.json + next.config
- [ ] Auth files copied from `apps/quiktrack`: `lib/auth.ts`, `[...nextauth]/route.ts`, `lib/api/{withOrgAuth,getOrgId,errors}.ts`, `middleware.ts` (slug renamed)
- [ ] **RBAC set copied from quiktrack** (Phase 2b): `permissionsRegistry.ts`, `permissions.ts`, `requireAdmin.ts`, `seedAdminAppRole.ts`, `me/permissions`, `internal/provision-roles`, `org/roles/**`, `org/users/[id]/role`, `useMyPermissions`, `require-perm` (prefix/slug renamed)
- [ ] `seed-oauth.ts` — App + OAuthClient block + BASE constant
- [ ] `launcher/route.ts` — `envBaseUrls` + `devLocalhostFallbacks`
- [ ] `admin/.../switcher/route.ts` — fallback
- [ ] `turbo.json` — `<SLUG>_URL` + `<SLUG>_OAUTH_CLIENT_SECRET`
- [ ] `schema.prisma` — `app_<slug>` in schemas list + prefixed models + RBAC tables, `prisma validate` passes
- [ ] Tables created via **filtered SQL** (never full `db push`)
- [ ] Icons in `public/app-icons/` (all apps) + `app-switcher.tsx` maps + `app/icon.svg`
- [ ] `provisionAppRoles.ts` — `APP_URL_OVERRIDE` entry
- [ ] `OrgAppAccess.enabled` for a test org; default roles seeded
- [ ] `.env.local` populated; build green; SSO round-trip verified

---

*CI (`ci.yml`) is monorepo-wide (`turbo run lint/typecheck/test`) — a new app is covered automatically
as a workspace; no per-app CI matrix entry is needed. `vercel.json` ships correct from the template
(only `main` deploys); no per-app edits.*
