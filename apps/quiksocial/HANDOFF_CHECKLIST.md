# QuikSocial v2 → QuikIT Monorepo — Handoff Checklist

Branch: `feature/quiksocial-v2-port` (off `quiksocial-latest`)
Target merge path: `feature/quiksocial-v2-port` → `dev` → `uat` → `main`

---

## 1. DONE BY QUIKSOCIAL TEAM (this PR)

### Schema (`packages/database/prisma/schema.prisma`)
- [x] Added `Offering` model (unified replacement for Product + Service; free-string `type`).
- [x] Added 4 `AutoReply*` models: `AutoReplyRule`, `AutoReplyPostControl`, `AutoReplyLog`, `AutoReplyCursor`.
- [x] Added 4 enums: `AutoReplyTriggerType`, `AutoReplyMode`, `AutoReplyKeywordMatch`, `AutoReplyLogStatus`.
- [x] Dropped `Product` and `Service` models entirely.
- [x] Renamed `Post.selectedProductIds` + `selectedServiceIds` → `selectedOfferingIds`.
- [x] Renamed `Post.attachedProduct` + `attachedService` → `attachedOffering`.
- [x] Renamed `Campaign.productIds` + `serviceIds` → `offeringIds`.
- [x] Renamed `Campaign.attachedProduct` + `attachedService` → `attachedOffering`.
- [x] Added `SocialAccount.autoReplyEnabled` boolean (default true).
- [x] Updated `Brand` back-relations (drop products/services, add offerings/autoReplyRules).
- [x] All new models use `orgId` (NOT `tenantId`).

### API routes
- [x] **Deleted** `app/api/products/{route,[id]/route}.ts`, `app/api/services/{route,[id]/route}.ts`, `app/api/admin/fix-product-images/route.ts`.
- [x] **Added** offerings routes: `app/api/offerings/{route,[id]/route,explore-category/route}.ts`.
- [x] **Added** `app/api/internal/offerings/[id]/enrich/route.ts` (Python service → Next.js enrichment callback).
- [x] **Added** 8 auto-reply user routes: `app/api/auto-reply/{logs, platform-toggle, post-control, rules, rules/[id], rules/[id]/toggle, social-accounts, stats}`.
- [x] **Added** 6 auto-reply internal routes: `app/api/internal/auto-reply/{cursor, log, log/[id], monitor-batch, responder-context, sweep-stale}`.
- [x] **Added** `app/api/cron/auto-reply-monitor/route.ts`.
- [x] **Edited** `app/api/brands/route.ts` POST to accept unified `offerings[]` body (legacy `products[]`/`services[]` folded in at write).
- [x] **Edited** `app/api/campaigns/{route,[id]/clone,generate}/route.ts` to use `offeringIds` + `attachedOffering`.
- [x] **Edited** `app/api/posts/route.ts` to use `attachedOffering`.
- [x] **Edited** `app/api/posts/[id]/publish-now/route.ts` to accept platform override body field.
- [x] Every user-facing route uses `withOrgAuth` wrapper + `{ success, data }` envelope + Zod validation.
- [x] Every internal route uses `checkInternalToken` from `lib/auto-reply/internal-auth.ts` (accepts both `orgId` and legacy `tenantId` in body).

### UI
- [x] **Deleted** `app/dashboard/products/` + `app/dashboard/services/`.
- [x] **Added** `app/dashboard/catalog/page.tsx` (unified offerings UI).
- [x] **Added** `app/dashboard/auto-reply/page.tsx` (Rules / Activity / Post Controls tabs).
- [x] **Added** 20 auto-reply components: `components/auto-reply/{ActivityView, KpiStrip, LogEntry, PlatformToggleStrip, PostControlRow, PostControlsView, RuleCard, RuleWizard, RulesView, WizardStep*}.tsx` + 6 primitives.
- [x] **Fixed** `components/posts/SelectMediaModal.tsx` to call `/api/offerings` (was calling deleted endpoints).
- [x] **Fixed** `components/calendar/CalendarDayPanel.tsx` to route post links via `/dashboard/content-hub?post=…` (the old `/dashboard/posts/[id]` URLs went nowhere).

### Lib
- [x] **Added** `lib/offerings/labels.ts` (offering type → human label).
- [x] **Added** `lib/auto-reply/internal-auth.ts` (X-QS-Internal-Token guard).
- [x] **Added** 8 auto-reply lib files: `ai-service-client.ts`, `client-types.ts`, `types.ts`, 5 React Query hooks.
- [x] **Edited** `lib/cron/scheduler.ts` to poll both `publish-scheduled` (30s) and `auto-reply-monitor` (60s).
- [x] **Edited** `scripts/seed-dummy.ts` to seed Offering rows instead of Product+Service.

### Wire-format preservation (Python AI service)
- [x] Outgoing payloads (Next.js → Python) still ship `tenantId` field where Python expects it.
- [x] Inbound payloads (Python → Next.js `/api/internal/*`) accept BOTH `orgId` and `tenantId` via `resolveOrgId()` helper. No simultaneous deploy required.
- [x] Internal route response shapes preserved byte-for-byte (Python parser is shape-sensitive).

### Config + verification
- [x] `.env.example` rewritten with every key referenced by ported code (placeholders only — no real secrets).
- [x] No `package.json` changes needed. Auto-reply uses `fetch()` + Prisma auto-cuid, not axios/cuid2.
- [x] No version bumps. Next.js stays on 14.0.4 (v2 was on 14.2.x — separate PR if upgrade wanted).
- [x] `MIGRATION_PROGRESS.md` documents every batch + deviations.
- [x] `npx tsc --noEmit` → exit 0.
- [x] `npx vitest run` → 3/3 passing.
- [x] `npx next lint` → exit 0 (pre-existing rule-resolution errors on unrelated files).

---

## 2. REQUIRED FROM QUIKIT TEAM (Pravin / Ashwin)

### Merge + database
- [ ] Review PR and merge `feature/quiksocial-v2-port` → `dev` (`--no-ff`).
- [ ] On the merged `dev` branch, generate the migration SQL:
      ```
      DATABASE_URL=<dev-db-url> DATABASE_URL_DIRECT=<dev-db-url> \
      npx prisma migrate dev --name add-offering-and-autoreply \
        --schema=packages/database/prisma/schema.prisma
      ```
      This creates `packages/database/prisma/migrations/<ts>_add-offering-and-autoreply/migration.sql`. Commit the migration file.
- [ ] Apply to UAT:
      ```
      DATABASE_URL=<uat-db-url> npx prisma migrate deploy
      ```
- [ ] **Destructive change**: the migration drops `app_quiksocial.Product` and `app_quiksocial.Service` tables. Confirm no production data lives in them before deploying past UAT. Local dev is clean-slate.
- [ ] Fast-forward `dev` → `uat` → `main`. Vercel auto-deploys on push to `main`.

### Shared package edits (be aware of)
- [ ] `packages/database/prisma/schema.prisma` — only file edited outside `apps/quiksocial/`. Adds 5 models + 4 enums in the `app_quiksocial` schema; drops 2 models. Other apps don't reference these.
- [ ] No edits to `packages/auth/`, `packages/shared/`, `packages/ui/`, `packages/redis/`.

### Env vars to set on the deployment (Vercel project: `quiksocial`)
Production secrets must be entered through Vercel's project → Settings → Environment Variables. Description for each key — values are application-owner-controlled.

**Postgres (Neon for prod):**
- [ ] `DATABASE_URL` — pgbouncer/pooled connection string.
- [ ] `DATABASE_URL_DIRECT` — direct (non-pooled) connection for `prisma migrate`.

**NextAuth + cross-app handoff:**
- [ ] `NEXTAUTH_SECRET` — 32-byte base64. **MUST** be identical across every QuikIT app for shared session cookies.
- [ ] `NEXTAUTH_URL` — public URL of this app (e.g. `https://social.quikit.ai`).
- [ ] `NEXT_PUBLIC_AUTH_URL` — public URL of the auth app (`https://quik-it-auth.vercel.app` or `https://auth.quikit.ai`).
- [ ] `QUIKIT_URL` — public URL of the launcher (`https://apps.quikit.ai`).
- [ ] `NEXT_PUBLIC_QUIKIT_URL` — same value as `QUIKIT_URL`.
- [ ] `QUIKIT_ISSUER_URL` — usually same as `QUIKIT_URL`.
- [ ] `QUIKIT_CLIENT_ID` — OAuth client id registered in `apps/quikit`'s `OAuthClient` table for quiksocial. Suggest: `quiksocial`.
- [ ] `QUIKIT_CLIENT_SECRET` — bcrypt'd in `OAuthClient`; plain in this env. Rotate at will.
- [ ] `INTERNAL_SECRET` — shared cross-app token. Same value across every QuikIT app.

**Cron + default org:**
- [ ] `CRON_SECRET` — bearer token for `/api/cron/publish-scheduled` and `/api/cron/auto-reply-monitor`. Set the same value in `vercel.json` cron config.
- [ ] `DEFAULT_ORG_ID` — the `quikit.Org.id` cron runs against during the single-org migration window. Must exist in the live DB; provision a real `Org` row first.

**Python AI service (Railway):**
- [ ] `AI_SERVICE_URL` — base URL of the FastAPI service (e.g. `https://quiksocial-v2-production.up.railway.app`).
- [ ] `AI_SERVICE_WS_URL` — WebSocket variant (`wss://…`).
- [ ] `QS_INTERNAL_TOKEN` — shared with the Python service. The Python side **must** be configured with the same value or every `/api/internal/*` call (auto-reply, offering enrichment) will 401.

**Cloudinary (asset uploads):**
- [ ] `CLOUDINARY_CLOUD_NAME`
- [ ] `CLOUDINARY_API_KEY`
- [ ] `CLOUDINARY_API_SECRET`

**Social OAuth integrations:**
- [ ] `META_APP_ID` + `META_APP_SECRET` — used for both Facebook and Instagram. Register OAuth redirect URIs in Meta Developer Portal: `{NEXTAUTH_URL}/api/integrations/callback/facebook` and `…/instagram`.
- [ ] `LINKEDIN_APP_ID` + `LINKEDIN_APP_SECRET` (optional). Redirect URI: `{NEXTAUTH_URL}/api/integrations/callback/linkedin`.
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (also covers YouTube). Redirect URI: `{NEXTAUTH_URL}/api/integrations/callback/youtube`.

**SMTP (workspace invites + scrape-ready emails):**
- [ ] `EMAIL_USER` — Gmail address.
- [ ] `EMAIL_PASSWORD` — Gmail app password.
- [ ] `SMTP_FROM` — `From:` header value (e.g. `QuikSocial <noreply@quikit.ai>`).

**Misc:**
- [ ] `ENVIRONMENT` — `production` / `staging` / `development`.
- [ ] `LOG_LEVEL` — `info` for prod, `debug` for staging.
- [ ] `NODE_TLS_REJECT_UNAUTHORIZED` — leave `"1"` in prod.

### DNS / Vercel project setup
- [ ] Create Vercel project `quiksocial` (or reuse if exists). Production branch = `main`. Preview deployments disabled (per root `CLAUDE.md`).
- [ ] Map custom domain: `social.quikit.ai` → quiksocial project. Confirm `apps/quiksocial/vercel.json` `deploymentEnabled: {main: true}` is in place (already committed).
- [ ] Add `social.quikit.ai` to the `AUTH_ALLOWED_RETURN_ORIGINS` list in `apps/auth`'s env (so cross-domain handoff redirects allow it). The defaults in `packages/auth/index.ts` already include `https://quiksocial.vercel.app` and `https://social.quikit.ai`.
- [ ] Add OAuth client row in production DB:
      ```sql
      INSERT INTO quikit."OAuthClient" (id, name, "clientId", "clientSecret", ...)
      VALUES (..., 'QuikSocial', 'quiksocial', bcrypt('<prod-secret>'), ...);
      ```

### Python AI service (Railway) connectivity
- [ ] Confirm Railway service for `quiksocial-v2-production` is reachable from Vercel (no allowlist required — it's a public HTTPS endpoint).
- [ ] On the Python side, set `QS_INTERNAL_TOKEN` to the SAME value as the Vercel env. Set `NEXTJS_BASE_URL` (or whatever Python's env var is called) to `https://social.quikit.ai` so callbacks to `/api/internal/*` reach the new host.
- [ ] If Railway has a CORS allowlist, add `https://social.quikit.ai`.

### Campaign persistence — cutover env coupling (Railway worker → monorepo)

The campaign-persistence fix (`9050a01`, landed here as PR1 commit `872f7709`) makes
the **Railway Python/Celery worker the system of record** for campaign posts: the
worker persists each post server-side via `POST ${APP_URL}/api/internal/posts` (header
`X-QS-Internal-Token: $QS_INTERNAL_TOKEN`) rather than the browser persisting them. That
creates a hard env coupling which only bites **at cutover** — when the Railway worker is
repointed from the standalone NextJS to the live monorepo host (GKE/monorepo go-live).

**Currently SAFE — nothing to do yet.** Prod/UAT Railway still points `APP_URL` at the
**standalone** NextJS, which already has the route (from `9050a01` on standalone main).
The monorepo's `app/api/internal/posts/route.ts` + the browser-`persistPost` removal only
*prepare* the monorepo; merging them here does **not** touch the running Railway
environment. The two stay independent until someone repoints `APP_URL`.

**At cutover (repointing the Railway worker at the monorepo), do these together** — miss
any one and incremental campaign-post persistence breaks **silently** (posts never reach
the Content Hub, or duplicate):
- [ ] **Route is live on the monorepo:** `apps/quiksocial/app/api/internal/posts/route.ts`
      is present and deployed on the live monorepo host (this PR merged + deployed).
- [ ] **Repoint `APP_URL`** (the worker's NextJS base-URL env) at the LIVE monorepo
      QuikSocial host (e.g. `https://social.quikit.ai`), NOT the legacy standalone/Vercel URL.
- [ ] **`QS_INTERNAL_TOKEN` matches on BOTH sides** — the Railway worker env AND the
      monorepo NextJS env must hold the SAME value (the `QS_INTERNAL_TOKEN` env item above).
      The route guard fails closed: missing/mismatched token → 401 → silent persistence failure.
- [ ] **Browser `persistPost` removal is live** (PR1's page edit) so the browser isn't also
      persisting — the worker uses deterministic ids `cmp_<campaignId>_<postNumber>` while the
      old browser path used random ids; if both fire, rows duplicate.
- [ ] **Network reachability:** Railway → monorepo host over HTTPS.
- [ ] **Smoke test after cutover:** run one campaign on the monorepo; confirm posts appear in
      the Content Hub (Postgres), no duplicates, and a mid-campaign disconnect loses nothing.

**Failure signature:** campaign runs, worker logs success, images land in Cloudinary, but
posts **don't appear in the Content Hub** (or appear **duplicated**). If you see this right
after a cutover, check `APP_URL` and `QS_INTERNAL_TOKEN` first.

> Folded in from the former `CUTOVER_persistence-fix-env-coupling.md` (now deleted) — read
> this section before repointing Railway at the monorepo / going live on the monorepo.

### Auth / RBAC setup
The monorepo's auth is **OIDC against the QuikIT IdP**. Roles are:
- **Super admin** (`User.isSuperAdmin = true` in `quikit.User`) — platform-level; sees everything.
- **Org admin** (`OrgMember.role IN ('owner','app_admin')`) — per-org grant; manages users + app access in their org.
- **App admin / member** (`UserAppAccess.role`) — per-org × app grant; gates which apps a user sees in the launcher grid.

For each org that should have access to QuikSocial:
- [ ] Ensure an `App` row exists with `slug='quiksocial'` (one-time bootstrap).
- [ ] Grant `UserAppAccess` rows to the relevant users in each org (the org admin can do this from the launcher's `/apps` user-management UI once it's wired).
- [ ] Confirm that `manifest.ts` (already committed) has the correct `appId: "quiksocial"` and `routePrefix: "/social"` — the launcher reads this at build time.

Inside QuikSocial itself, per-brand RBAC is:
- **Brand admin / approver / member** (`BrandMembership.role`) — granted via invite flow inside the app. Brand creators get `admin` automatically (backward-compat in `lib/auth/rbac.ts`).

---

## 3. RISHABH'S FOLLOW-UPS (after merge)

### Meta credentials in production
- [ ] When `social.quikit.ai` DNS is live, log into Meta Developer Portal → QuikSocial app → Settings → Basic → add `https://social.quikit.ai` to App Domains.
- [ ] Facebook Login product → Settings → Valid OAuth Redirect URIs → add `https://social.quikit.ai/api/integrations/callback/facebook` and `…/instagram`.
- [ ] Same for LinkedIn + Google (YouTube) if those integrations are in scope at launch.
- [ ] Verify `META_APP_ID`/`META_APP_SECRET` from local `.env.local` matches what's set on Vercel prod (or rotate if the local dev creds shouldn't be reused for prod).

### Python AI service env on Railway
- [ ] Update Railway env: set the variable pointing at Next.js (`NEXT_JS_BASE_URL` or equivalent — check `quiksocial-v2/apps/ai-service/.env.example`) to `https://social.quikit.ai`. Without this, the Python service's webhooks/callbacks to `/api/internal/*` will go to the old `quiksocial.vercel.app` host and 404.
- [ ] Confirm `QS_INTERNAL_TOKEN` on Railway matches the value set on Vercel.
- [ ] Test one round-trip: trigger a brand scrape from the new monorepo UI and confirm the Python service successfully PATCHes back to `/api/internal/offerings/[id]/enrich`.

### Brand Brain integration (Sagar, 2026-06-01 → 2026-06-10)
- [ ] Coordinate with Sagar on the Brand Brain API contract once the monorepo is live on `dev`.
- [ ] Brand Brain will likely consume `db.brand` directly (read-only) or via a new `/api/internal/brand-snapshot` route. Decide on the integration surface during week-1 of June.
- [ ] If a new internal route is needed, follow the existing `/api/internal/*` pattern (token guard + JSON shape).

### Deferred v2 features to follow up
Each lands in its own follow-up PR after this migration merges. All work cleanly today; these are pure UX additions.

- [ ] **Brand Creation Wizard v2** (`app/dashboard/brands/create/page.tsx`):
      Port v2's unified `ScrapedOffering` shape, `CatalogDiscoveryStep.tsx` component, and Phase 5 marketability scoring. Currently the wizard still uses the legacy `ScrapedProduct`/`ScrapedService` client-side interfaces; works (POST `/api/brands` accepts both) but no catalog-discovery UX.
- [ ] **Calendar / Campaigns / Content-Hub / Posts-Create / Settings pages** — diff against v2 and merge the additions (likely marketability sort, ScheduleModal integration improvements, etc.).
- [ ] **ScheduleModal + dashboard-layout** — minor v2 deltas worth diffing.
- [ ] **Vitest coverage** for auto-reply API routes — per root `CLAUDE.md`: every new API route needs 401 / org-isolation / happy-path tests. None exist yet for the auto-reply surface.
- [ ] **ESLint config repair** — pre-existing `@typescript-eslint/*` rule resolution errors. Fix in a `chore/eslint-config` PR.
- [ ] **Next.js upgrade** 14.0.4 → 14.2.x — v2 was on 14.2.29. Defer to a clean `chore/next-upgrade` PR; don't bundle with feature work.
- [ ] **OTP signup flow** — explicitly skipped (auth lives on the launcher). Revisit only if a standalone signup path is ever needed.
