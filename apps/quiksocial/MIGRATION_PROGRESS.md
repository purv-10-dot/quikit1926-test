# QuikSocial v2 → Monorepo Port — Progress

Feature branch: `feature/quiksocial-v2-port` (off `quiksocial-latest`)

## Status

| Batch | Status | Commit |
| --- | --- | --- |
| Phase A — Schema | ✅ done | e22320a1 |
| Batch 1 — Lib utilities | ✅ done | eeba2a3c |
| Batch 2 — Offering API + UI | ✅ done | d156460b |
| Batch 3 — Brands/Posts/Campaigns adaptation | ✅ done | b4e47415 |
| Batch 4 — Components + dashboard pages | ✅ done (minimum) | (current) |
| Batch 5 — Auto-reply subsystem | pending | — |
| Batch 6 — Meta / publisher / cron merge | pending | — |
| Batch 7 — Drop v2-only orphans + final cleanup | pending | — |
| .env.example update | pending | — |
| Final verify (typecheck + lint + test + migration SQL) | pending | — |

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

1. **Brand Creation Wizard** (`app/dashboard/brands/create/page.tsx`) — v2 ships unified `ScrapedOffering` shape + `CatalogDiscoveryStep.tsx` + Phase 5 marketability scoring. Monorepo's wizard still uses `ScrapedProduct` + `ScrapedService` client-side interfaces; works (POST /api/brands accepts both legacy and offerings[] shapes) but doesn't get v2's catalog discovery UX.
2. **Calendar / Campaigns / Content-Hub / Posts-Create / Settings pages** — large v2 deltas (likely Phase 2 unified-offering UI, marketability sorting, etc.). Functional today; cosmetically lag v2.
3. **`ScheduleModal.tsx` + `dashboard-layout.tsx`** — both exist in the monorepo at adapted state. v2's versions might have new features (post-now flow, etc.) worth diffing in the follow-up.

## Resume instructions if compacted

1. Read this file.
2. Find the migration plan in the compact summary or scroll back to Claude's "Step 2 — Migration plan" message.
3. Continue from the first `pending` batch in the table above.
