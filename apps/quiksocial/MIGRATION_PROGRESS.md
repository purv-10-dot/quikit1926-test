# QuikSocial v2 → Monorepo Port — Progress

Feature branch: `feature/quiksocial-v2-port` (off `quiksocial-latest`)

## Status

| Batch | Status | Commit |
| --- | --- | --- |
| Phase A — Schema | ✅ done | e22320a1 |
| Batch 1 — Lib utilities | ✅ done | eeba2a3c |
| Batch 2 — Offering API + UI | ✅ done | (current) |
| Batch 3 — Brands/Posts/Campaigns adaptation | ⏳ next | — |
| Batch 4 — Components + dashboard pages | pending | — |
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

## Deviations from plan

None.

## Next: Batch 3 — Brands/Posts/Campaigns adaptation

Will:
1. Rewrite `app/api/brands/route.ts` POST to write unified Offering rows (drop Product/Service branches; accept v2's `body.offerings[]` array with optional legacy `body.products[]` / `body.services[]` migration mapping).
2. Rewrite `app/api/campaigns/{route,[id]/clone,generate}.ts` — replace `productIds`/`serviceIds` with `offeringIds`; `attachedProduct`/`attachedService` with `attachedOffering`; replace `db.product`/`db.service` reads with `db.offering`.
3. Rewrite `app/api/posts/route.ts` to use `attachedOffering` + `selectedOfferingIds`.
4. Decide on `app/api/admin/fix-product-images/route.ts` — port to Offering or delete (admin-only utility).
5. Update `scripts/seed-dummy.ts` to seed Offering rows.
6. Port any missing v2 routes for Brand/Post/Campaign that the monorepo doesn't have yet (e.g. `app/api/posts/[id]/publish-now/route.ts`).

## Resume instructions if compacted

1. Read this file.
2. Find the migration plan in the compact summary or scroll back to Claude's "Step 2 — Migration plan" message.
3. Continue from the first `pending` batch in the table above.
