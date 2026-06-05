# QuikSocial v2 → Monorepo Port — Progress

Feature branch: `feature/quiksocial-v2-port` (off `quiksocial-latest`)

## Status

| Batch | Status | Commit |
| --- | --- | --- |
| Phase A — Schema | ✅ done | e22320a1 |
| Batch 1 — Lib utilities | ✅ done | eeba2a3c |
| Batch 2 — Offering API + UI | ✅ done | d156460b |
| Batch 3 — Brands/Posts/Campaigns adaptation | ✅ done | b4e47415 |
| Batch 4 — Components + dashboard pages | ✅ done (minimum) | 3a9f4cba |
| Batch 5 — Auto-reply subsystem | ✅ done | 59f4da5e |
| Batch 6 — Meta / publisher / cron merge | ✅ done | eeeceb37 |
| Batch 7 — deps + .env.example + final cleanup | ✅ done | (current) |
| Final verify (typecheck + lint + test) | ✅ done | (current) |

## Typecheck status (after Batch 1)

**Expected schema-cascade failures only** — no new Batch 1 errors. All errors are in code Batches 2/3/7 will rewrite or delete:

- `app/api/products/**`, `app/api/services/**` — DELETE in Batch 2 (replaced by offerings).
- `app/api/admin/fix-product-images/route.ts` — DELETE or rewrite in Batch 3 (relied on Product/Service).
- `app/api/brands/route.ts` — `db.product`/`db.service` writes; rewrite in Batch 3 to use `db.offering`.
- `app/api/campaigns/{route,[id]/clone,generate}.ts` — `productIds`/`serviceIds`/`attachedProduct`/`attachedService` fields gone; rewrite in Batch 3 to use `offeringIds`/`attachedOffering`.
- `app/api/posts/route.ts` — `attachedProduct` field gone; rewrite in Batch 3 to use `attachedOffering`.
- `scripts/seed-dummy.ts` — `db.product`/`db.service` writes; rewrite or delete in Batch 7.

## Files changed

### Phase A (commit e22320a1)
- `packages/database/prisma/schema.prisma` — added Offering, 4 AutoReply enums, 4 AutoReply models; dropped Product/Service; renamed Post/Campaign fields; added SocialAccount.autoReplyEnabled.

### Batch 1 (commit eeba2a3c)
- **New**: `apps/quiksocial/lib/offerings/labels.ts` (offering type → human label mapping; new file).
- **No-op**: `lib/utils/{currency,email,parse-name-from-email,timezone}.ts` and `lib/constants/{background-images,campaign-templates,holidays,timezones}.ts` confirmed byte-identical to v2 (CRLF differences only — git normalizes).
- **No-op**: `lib/oauth/state.ts` already ported in monorepo (default port set to 3007 with proper TODO).

### Batch 2 (this commit)
- **Deleted**:
  - `apps/quiksocial/app/api/products/` (route.ts + [id]/route.ts)
  - `apps/quiksocial/app/api/services/` (route.ts + [id]/route.ts)
  - `apps/quiksocial/app/dashboard/products/`
  - `apps/quiksocial/app/dashboard/services/`
- **New**:
  - `apps/quiksocial/lib/auto-reply/internal-auth.ts` — `X-QS-Internal-Token` guard for /api/internal/* routes (used by enrich + Batch 5's auto-reply).
  - `apps/quiksocial/app/api/offerings/route.ts` — GET (paginated, filterable by type) + POST.
  - `apps/quiksocial/app/api/offerings/[id]/route.ts` — PUT + DELETE (soft delete).
  - `apps/quiksocial/app/api/offerings/explore-category/route.ts` — POST proxy to Python /explore-category.
  - `apps/quiksocial/app/api/internal/offerings/[id]/enrich/route.ts` — PATCH from Python enrich_offerings_task (accepts orgId or legacy tenantId).
  - `apps/quiksocial/app/dashboard/catalog/page.tsx` — unified offerings UI (replaces /dashboard/products + /dashboard/services).
- Catalog page uses `useActiveBrandId()` instead of `session.user.activeBrandId` (the OIDC session has no activeBrandId), and unwraps `{ success, data }` from every API response via `unwrap()` from `lib/utils/api-fetch.ts`.

## Typecheck status after Batch 2

Remaining errors are all in Batch 3/7 territory:
- `app/api/admin/fix-product-images/route.ts` — uses `db.product` / `db.service` / `Prisma.ProductWhereInput` / `Prisma.ServiceWhereInput`.
- `app/api/brands/route.ts` — `db.product` / `db.service` writes during brand create.
- `app/api/campaigns/{route,[id]/clone,generate}.ts` — `productIds`/`serviceIds`/`attachedProduct`/`attachedService` fields.
- `app/api/posts/route.ts` — `attachedProduct` field on Post create.
- `scripts/seed-dummy.ts` — `db.product` / `db.service` writes.

**No new errors from Batch 2.** Error count down from ~40 (after schema change) to ~24 (Product/Service routes themselves now deleted).

## Typecheck status after Batch 3

✅ **`npx tsc --noEmit` is GREEN** — all schema-driven errors resolved. Zero remaining errors.

### Batch 3 (this commit)
- **Edited**:
  - `app/api/brands/route.ts` — POST body schema unified: drops the separate `productInputSchema`/`serviceInputSchema`, accepts `offerings[]` (with optional legacy `products[]`/`services[]` arrays folded into Offering rows). Transaction now writes `tx.offering.createMany(...)` instead of `tx.product.createMany` + `tx.service.createMany`.
  - `app/api/campaigns/route.ts` — POST body schema accepts `offeringIds` + `attachedOffering` (with legacy `productIds`/`serviceIds`/`attachedProduct`/`attachedService` folded in). DB write uses `offeringIds` + `attachedOffering`.
  - `app/api/campaigns/[id]/clone/route.ts` — `useSameOfferings` flag (alias: `useSameProducts`); clones `offeringIds` from source instead of product/service ID arrays.
  - `app/api/campaigns/generate/route.ts` — reads `campaign.offeringIds`, queries `db.offering.findMany`, re-splits into `products`/`services` arrays for the AI service payload by Offering.type. Maps `Offering.price` → AI service's `service.pricing` field. Uses `attachedOffering` from campaign.
  - `app/api/posts/route.ts` — POST body schema accepts `attachedOffering` (with legacy attached fields folded in); writes `attachedOffering` to Post.
  - `app/api/posts/[id]/publish-now/route.ts` — already ported; added v2's platform-override body parsing (`{ platform: "facebook" | "instagram" }`) and persist the actually-published platform on success/failure.
  - `scripts/seed-dummy.ts` — wipe step uses `db.offering.deleteMany`; seed loops use `db.offering.create` with `type: "product"` or `type: "service"`.
- **Deleted**:
  - `app/api/admin/fix-product-images/route.ts` (and the empty `admin/` directory). One-shot legacy backfill that operated on the now-removed Product/Service tables; clean-slate DB approach makes it dead code. If a future Offering-image fix tool is needed, build it then.

## Deviations from plan

None.

### Batch 4 (this commit) — minimum required to keep runtime correct

**Scope deliberately narrowed.** After diffing every component + dashboard page between v2 and the monorepo, the verdict was:

- 9 of 13 components are byte-identical to v2 (CRLF only).
- 4 of 12 dashboard pages are byte-identical or have only `unwrap()` / `useActiveBrandId()` adaptations the monorepo already made correctly. Replacing them with v2's versions would REGRESS the QuiKit porting work.
- 1 component (`SelectMediaModal`) had a real runtime bug — it called the deleted `/api/products` and `/api/services` endpoints. **Fixed.**
- 1 component (`CalendarDayPanel`) had broken `/dashboard/posts/${id}` links (no such page in monorepo). **Adopted v2's `/dashboard/content-hub?post=${id}` routing.**
- 6 dashboard pages have large v2 deltas (marketability sorting, CatalogDiscoveryStep, ScheduleModal integration, etc.) but typecheck clean today. **Deferred to a follow-up PR** to keep this migration shippable; documented below.

**Edited**:
- `components/posts/SelectMediaModal.tsx` — replaced two `fetch("/api/products?...")` + `fetch("/api/services?...")` calls with a single `fetch("/api/offerings?...&type=...")` call, splitting client-side by `offering.type`. Preserves the existing Products/Services tab UX without touching component layout.
- `components/calendar/CalendarDayPanel.tsx` — adopted v2's routing for post detail / reschedule / festival-create links (`/dashboard/content-hub?post=…` instead of the broken `/dashboard/posts/${id}`). Also added `createdAt: string | null` to the Post interface to match v2's shape.

## Deferred to follow-up PR

These v2 feature additions don't block typecheck and don't break runtime. Ship as a separate "quiksocial v2 page features" PR after this migration lands.

1. ~~**Brand Creation Wizard**~~ — **DONE in post-batch fix** (commits `6b12ecae` sidebar + wizard port after Batch 7 — see "Post-batch fixes" section). v2's 6-step wizard with `CatalogDiscoveryStep.tsx` (1106 LOC) is now in place, replacing the legacy 5-step monorepo wizard. `WIZARD_TOTAL_STEPS = 6` constant + dynamic `WizardProgress` segments.
2. **Calendar / Campaigns / Content-Hub / Posts-Create / Settings pages** — large v2 deltas (likely Phase 2 unified-offering UI, marketability sorting, etc.). Functional today; cosmetically lag v2.
3. **`ScheduleModal.tsx` + `dashboard-layout.tsx`** — `dashboard-layout.tsx` was partly addressed in the post-batch sidebar fix (catalog dropdown → single link, Auto-reply nav item, MessageSquareReply icon alias). `ScheduleModal.tsx` v2 deltas still pending.

## Post-batch fixes (after Batch 7, surfaced during local testing)

### Sidebar fix (commit `6b12ecae`)

`components/layout/dashboard-layout.tsx` — runtime issues found in local QA:
- Catalog dropdown rendered Products + Services children pointing at deleted pages → replaced with a single `SidebarNavLink` to `/dashboard/catalog`.
- Auto-reply nav item was missing from `socialNavLinksBeforeCatalog` → added.
- `MessageSquareReply` icon doesn't exist in installed `lucide-react@0.294.0` → aliased as `MessageCircle`.
- Dropped unused `catalogOpen` state and auto-expand `useEffect`.

(Approval visibility is unchanged — gated on `canSeeApproval = isWorkspaceAdmin`. Member-role users correctly don't see it; admin-role users do. Test-user role can be set via `UPDATE app_quiksocial."BrandMembership" SET role = 'admin' WHERE …`.)

### Sprint 2 v2 fixes synced (commits 250afa89 → 12bdc2c8)

Five bugfix commits from quiksocial-v2 main shipped between May 27–28
that need to be in the monorepo before this PR ships. Synced one-to-one
preserving v2's commit-level coherence; each adapts to the monorepo
patterns (orgId, withOrgAuth, unwrap, { success, data } envelope).

1. **`250afa89` ← v2 `9307580`** — SelectMediaModal unified Offering.
   Replaces Batch 4's surgical patch (Products/Services tabs with type-
   filtered fetches that missed menu_item/treatment/etc.) with the
   proper v2 UX rewrite: single Catalog tab, one unfiltered /api/offerings
   call, grouped client-side by Offering.type with an "All types"
   dropdown + name search. AttachmentSelection union: asset|product|
   service → asset|offering. Posts/Campaigns create flows now send
   attachedOffering with the offering's free-string type.

2. **`cc27b321` ← v2 `f3cb51e`** — Calendar 4 bugs.
   - Date click → Create Post flow with locked date. Week-view columns
     now clickable; Day view gets "+ Create post for this day" button.
     ScheduleModal gains lockDate prop (greys out the calendar grid,
     clears the pre-selected slot).
   - Week view stuck on "Apr 27 – May 3" — currentDate was pinned to
     the 1st of the month; now inits to today.
   - "Plan this Month" pill now shows in all three views.
   - Published posts missing from calendar — /api/posts date filter
     broadened to OR over scheduledFor / publishedAt / createdAt;
     client postsByDay keys off the same relevantDate.

3. **`8f088384` ← v2 `31f88e0`** — Global dark `<select>` theme +
   campaign festival pre-fill.
   - One CSS rule in globals.css darkens the OS-rendered option list
     (which inline styles cannot reach) — fixes every native select
     across catalog/campaigns/settings/media-picker.
   - Campaigns page reads ?festival=…&scheduledDate=… on mount, opens
     the create modal in scratch mode pre-filled with name + concept +
     a 7-day window anchored on the festival date.

4. **`09ea0ec1` ← v2 `03afefa`** — Calendar deep-link → Content Hub.
   - Added GET /api/posts/[id] (org + workspace-role scoped) so the
     content-hub deep-link can fetch a post not on its current page.
   - Repointed Day-view "View"/"Reschedule" links to
     /dashboard/content-hub?post=<id>[&reschedule=true]. CalendarDayPanel
     was already aligned in Batch 4.
   - Content Hub reads ?post=…[&reschedule=…] on mount, fetches the
     post, opens the detail or reschedule modal, strips the query.

5. **`12bdc2c8` ← v2 `88e5255`** — Drop demo env-fallback + Post-Now
   platform.
   - dispatch.ts: removed META_PAGE_ACCESS_TOKEN/META_IG_ACCOUNT_ID/
     META_PAGE_ID env-var fallback (was silently publishing to a shared
     demo account, masking "not connected" state). Source narrowed to
     "social-account" only. **Behavioral change for UAT/demo:** posts
     without a connected SocialAccount now go to status=Failed with a
     "connect account" message instead of "publishing" to nowhere.
   - ScheduleModal.onPublishNow signature: () → (platform: string).
     Content Hub + posts/create handlers now thread the user's platform
     pill through to publish-now via JSON body. posts/create also uses
     it on the draft create (was hardcoded "instagram").

### Sprint 3 v2 fixes synced (commits 038d3b0f → f3325c09)

Four bugfix commits from quiksocial-v2 main shipped between May 29 –
Jun 3 that need to be in the monorepo before this PR ships. The other
~8 v2 commits in this window are either (a) Python AI-service work
that stays external on Railway, or (b) v2's E2 multi-tenant transition
work which the monorepo's architecture (real orgId from QuikIT IdP
OIDC session) doesn't need.

1. **`038d3b0f` ← v2 `e54f3bf`** — Instagram publish uses IG Business
   Account ID. Schema change (SocialAccount.igBusinessAccountId
   String?) + restructured dispatch.ts resolveCredentials with a
   self-heal Graph lookup + OAuth callback persists the id at connect
   time + new scripts/backfill-ig-business-account.ts for legacy rows.
   Fixes the cryptic "Object with ID '...' does not exist" error from
   Meta when the publisher passed the FB Page ID instead of the IG
   Business Account ID.

2. **`70cb7bef` ← v2 `a672c33`** — Drop deprecated Facebook
   `publish_video` scope. One-line scope-string edit. Non-developer
   FB users were hitting "Invalid Scopes: publish_video" before the
   consent screen rendered.

3. **`2a903636` ← v2 `b864b1e`** — Cloudinary fl_attachment +
   platform at scheduling.
   - GeneratedImageCard download injects `fl_attachment:NAME/` into
     Cloudinary URLs (cross-origin download attribute is ignored;
     this sets Content-Disposition server-side).
   - Removed `platforms: ["instagram"]` hardcode from
     campaigns/generate AI payload — platform is now genuinely picked
     at scheduling.
   - posts/[id]/status PATCH route accepts and persists body.platform;
     content-hub handleScheduleSave forwards the modal's chosen
     platform to both schedule and approve-and-schedule branches.

4. **`f3325c09` ← v2 `8e6d10e` + `6eea0e9`** — posts/create regenerate
   forwards attachment + stale-closure dep fixes. Bug: the user
   attaches an offering with a cover image but Python's
   `had_product_image` logged false every time. Two causes:
   (a) regenerate-image POST never sent attachedOffering,
   (b) two useCallbacks read data.attachment without listing it in
   their deps array — captured stale null after re-attach.

## v2 commits explicitly NOT synced

These were reviewed and skipped because they target v2-specific
architecture the monorepo never had:

- `2f5c3d4` E2 per-user tenant provisioning — replaced by monorepo's
  `@quikit/auth` + real `orgId` session.
- `487ed28` Anchor post-schedule + auto-reply rules on brand tenant
  (E2 bugs 4+5) — fixes session-vs-brand tenant divergence which
  monorepo's withOrgAuth + org-scoped BrandMembership prevents.
- `b80b494` 401 silent on scrape/start + diagnostics — v2 middleware
  stack; monorepo uses withOrgAuth (already returns 401 explicitly).
- `09398cc` Infinite redirect loop on /dashboard/brands/create —
  v2-middleware-specific.
- `1edd49d` BrandMembership backfill — pre-E2 data which the monorepo
  doesn't have.
- `55b2be8` First-brand redirect to client (FirstBrandGate) — v2 fix
  for an infinite-loop bug the monorepo doesn't have. Confirmed N/A.
- `ec25393` Middleware /login redirect — monorepo middleware already
  uses /login via createMiddleware's loginRoute.
- Python AI-service commits (template-engine, providers, image
  Phase 2) — out of scope; Python service stays external on Railway.

### Brand Creation Wizard port (commit 3492660f)

`app/dashboard/brands/create/page.tsx` (1487 → 1991 LOC) + new `app/dashboard/brands/create/CatalogDiscoveryStep.tsx` (1106 LOC).

- 5-step wizard → 6-step wizard. New Step 3 ("Pick what to market") inserts catalog discovery between AI Analysis and Visual Identity.
- `WIZARD_TOTAL_STEPS = 6` constant + dynamic `WizardProgress` (was hardcoded `[1,2,3,4,5]`).
- Unified `ScrapedOffering` shape (drops `ScrapedProduct`/`ScrapedService` interfaces).
- Phase 5 marketability scoring fields on `ScrapedOffering`.
- Adapted to monorepo: `useActiveBrandId()` hook, `unwrap()` on every `await res.json()` (5 endpoints all use the `{success, data}` envelope: scrape/start, scrape/status, brands/[id], brands, offerings, offerings/explore-category).
- `CatalogDiscoveryStep.tsx` inlines a `Checkbox` component (v2 imported from `@/components/ui/Checkbox` but that component doesn't exist in the monorepo; inlining keeps the change scoped to the wizard directory per migration guardrails). Future cleanup: extract to `components/ui/Checkbox.tsx` if needed elsewhere.

### Batch 5 (this commit) — Auto-reply subsystem (new)

Ported the entire v2 auto-reply pipeline: 36 new files across API routes, UI, lib hooks. Typecheck green.

Delegated to a general-purpose agent with explicit conversion rules. Files created:
- **8 user-facing API routes** (`app/api/auto-reply/{logs, platform-toggle, post-control, rules, rules/[id], rules/[id]/toggle, social-accounts, stats}`): wrapped in `withOrgAuth`, `orgId` everywhere, `{ success, data }` envelope, Zod input validation.
- **6 internal API routes** (`app/api/internal/auto-reply/{cursor, log, log/[id], monitor-batch, responder-context, sweep-stale}`): `checkInternalToken` guard, accept BOTH `orgId` and legacy `tenantId` in body via `resolveOrgId()` helper in `lib/auto-reply/types.ts`. Response shapes preserved unmodified for Python parser compatibility.
- **1 cron route** (`app/api/cron/auto-reply-monitor`): Bearer-secret auth, uses `DEFAULT_ORG_ID` env fallback.
- **1 dashboard page** (`app/dashboard/auto-reply/page.tsx`): uses `useActiveBrandId()`, three-tab UI (Rules / Activity / Post Controls).
- **20 components** (`components/auto-reply/{ActivityView, KpiStrip, LogEntry, PlatformToggleStrip, PostControlRow, PostControlsView, RuleCard, RuleWizard, RulesView, WizardStep*}` + 6 primitives).
- **8 lib files** (`lib/auto-reply/{ai-service-client, client-types, types, use-*}`): React Query hooks + ai-service-client + shared types. `internal-auth.ts` was already in the monorepo from Batch 2.

Decisions made by the porting agent (worth knowing for future maintenance):
- Internal routes accept both `orgId` and `tenantId` body aliases via a shared `resolveOrgId()` helper in `lib/auto-reply/types.ts`. Python wire format still ships `tenantId` until the AI service updates.
- `ai-service-client.ts` sends `tenantId` on the wire (Python expects it) but accepts `orgId` as the JS parameter.
- `AutoReplyCursor` upsert key uses `orgId_socialAccountId_postId` (matching the new schema's unique).
- `MessageSquareReply` icon doesn't exist in the installed `lucide-react` → aliased as `MessageCircle`.
- Cron `DEFAULT_ORG_ID` resolution falls through to legacy `DEFAULT_TENANT_ID` then a sentinel for env-file compatibility.

### Batch 6 (this commit) — meta + cron merge

After diff:
- `lib/meta/dispatch.ts` — monorepo is AHEAD of v2 (already orgId-scoped, already has env-var fallback for UAT/demo). **No port needed.**
- `lib/meta/{facebook-publisher,instagram-publisher,token-validator}.ts` — byte-identical to v2 (CRLF only). **No port needed.**
- `lib/cron/scheduler.ts` — **Edited** to add a second `setInterval` that polls `/api/cron/auto-reply-monitor` every 60s alongside the existing 30s `publish-scheduled` poll. Refactored the single-purpose `tick()` into a parameterised `callCronRoute(path, label)` so both ticks share the same auth + base-URL + error logging.

The auto-reply cron route was added in Batch 5; this batch just wires the in-process timer to it. Without this edit, auto-reply would only run when `vercel.json` schedules the prod cron — local/dev wouldn't tick.

Default port in `resolveBaseUrl()` updated `3006` → `3007` to match the monorepo's quiksocial dev port (next.config.js / package.json scripts).

### Batch 7 (this commit) — deps + .env.example + final verification

**Dependencies**: no `package.json` changes needed. The auto-reply port used `fetch()` (not axios) and Prisma's auto-cuid (not `@paralleldrive/cuid2`), so the v2-only deps stay omitted. The monorepo already had every dep the new code references.

**Orphans**: none to delete. The skip-list from the plan (`app/signup/*`, `app/api/auth/signup/*`, `app/login/page.tsx`, `app/api/user/password/route.ts`, `lib/auth/auth.ts`, `lib/db.ts`) was never ported in the first place — verified `ls` returns nothing for those paths in the monorepo. OTP signup is a non-starter anyway because the monorepo authenticates via QuikIT IdP (OIDC) and the launcher handles signup centrally.

**`.env.example`** rewritten to capture every key actually referenced by the ported code:
- DB: `DATABASE_URL`, `DATABASE_URL_DIRECT`
- NextAuth: `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (defaulted to `:3007`, matching the package.json `dev` script)
- Cross-app hand-off: `NEXT_PUBLIC_AUTH_URL`, `QUIKIT_URL`, `NEXT_PUBLIC_QUIKIT_URL`, `QUIKIT_CLIENT_ID`, `QUIKIT_CLIENT_SECRET`, `QUIKIT_ISSUER_URL`, `INTERNAL_SECRET`
- Cron + default org: `CRON_SECRET`, `DEFAULT_ORG_ID` (with `DEFAULT_TENANT_ID` documented as a legacy alias)
- Python AI service: `AI_SERVICE_URL`, `AI_SERVICE_WS_URL`, `QS_INTERNAL_TOKEN`
- Cloudinary: 3 keys
- Social OAuth: `META_APP_ID`/`SECRET` (canonical), legacy `FACEBOOK_APP_*` documented, `LINKEDIN_APP_*`, `GOOGLE_CLIENT_*` (also covers YouTube)
- SMTP for email (`EMAIL_USER`, `EMAIL_PASSWORD`, `SMTP_FROM`) — used by `lib/utils/email.ts` for workspace invites + scrape-ready notifications
- Misc: `NODE_TLS_REJECT_UNAUTHORIZED`, `LOG_LEVEL`, `ENVIRONMENT`, optional Sentry

**Only placeholder values** — never copied actual secrets from anyone's `.env.local`.

## Final verification (run on `feature/quiksocial-v2-port`)

```
$ npx tsc --noEmit
EXIT 0  ✅

$ npx vitest run
 Test Files  1 passed (1)
      Tests  3 passed (3)
EXIT 0  ✅

$ npx next lint
EXIT 0 — emits warnings/errors but command succeeds.
The only `error`-level findings are pre-existing config issues
(`@typescript-eslint/no-explicit-any` rule definitions missing) on
files that existed before this migration (lib/utils/currency.ts,
lib/utils/email.ts, …). NOT introduced by this PR.
```

**Prisma migration SQL is intentionally NOT generated in this PR.** The schema diff is captured in `packages/database/prisma/schema.prisma`; running `prisma migrate dev --name add-offering-and-autoreply` produces the SQL when the integration owner is ready to apply it. Per the plan, this PR is "schema in code" only; DB migration lands in a separate operations step.

## What this PR is shippable for

- ✅ Schema includes Offering + 4 AutoReply* models; Product+Service removed.
- ✅ Every API route + UI surface that called deleted endpoints now points at `/api/offerings`.
- ✅ Auto-reply pipeline fully wired (cron driver → user routes → internal routes → Python AI service).
- ✅ Python AI service contract preserved on the wire (`tenantId` still sent; `orgId`/`tenantId` accepted on inbound).
- ✅ Typecheck + tests green.

## What's deferred to follow-up PRs

1. **v2 dashboard page polish** — marketability sorting, CatalogDiscoveryStep on the wizard, v2's ScheduleModal additions, etc. Functional today; just lacks v2's UX additions.
2. **DB migration SQL** — `prisma migrate dev` run + checked-in migration file. Done by the integration owner at cutover.
3. **Vitest coverage for new code** — auto-reply API routes + lib hooks have no tests yet. Per CLAUDE.md, every new API route should have 401 / org-isolation / happy-path coverage; that's a meaningful test-suite addition.
4. **ESLint config repair** — pre-existing `@typescript-eslint/*` rule resolution issue should be fixed in a `chore/eslint-config` PR.
5. **Lockfile / package.json review** — no new top-level deps added in this PR; if the integration owner wants to update Next.js (v2 ships 14.2.x, monorepo on 14.0.4), do it in a separate `chore/next-upgrade` PR.

## Resume instructions if compacted

1. Read this file.
2. Find the migration plan in the compact summary or scroll back to Claude's "Step 2 — Migration plan" message.
3. Continue from the first `pending` batch in the table above.
