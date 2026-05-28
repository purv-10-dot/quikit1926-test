# QuikSocial v2 → Monorepo Port — Progress

Feature branch: `feature/quiksocial-v2-port` (off `quiksocial-latest`)

## Status

| Batch | Status | Commit |
| --- | --- | --- |
| Phase A — Schema | ✅ done | e22320a1 |
| Batch 1 — Lib utilities | ✅ done | (current) |
| Batch 2 — Offering API + UI | ⏳ next | — |
| Batch 3 — Brands/Posts/Campaigns adaptation | pending | — |
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

### Batch 1 (this commit)
- **New**: `apps/quiksocial/lib/offerings/labels.ts` (offering type → human label mapping; new file).
- **No-op**: `lib/utils/{currency,email,parse-name-from-email,timezone}.ts` and `lib/constants/{background-images,campaign-templates,holidays,timezones}.ts` confirmed byte-identical to v2 (CRLF differences only — git normalizes).
- **No-op**: `lib/oauth/state.ts` already ported in monorepo (default port set to 3007 with proper TODO).

## Deviations from plan

None.

## Next: Batch 2 — Offering API + UI

Will:
1. Delete `app/api/products/`, `app/api/services/`, `app/dashboard/products/`, `app/dashboard/services/`.
2. Port v2's `app/api/offerings/{route,[id]/route,explore-category/route}.ts` + `app/api/internal/offerings/[id]/enrich/route.ts` — wrap each in `withOrgAuth`, rename `tenantId` → `orgId`, return `{ success, data }`.
3. Port v2's `app/dashboard/catalog/page.tsx` — strip `src/` from imports, use monorepo's `useActiveBrandId` hook.

## Resume instructions if compacted

1. Read this file.
2. Find the migration plan in the compact summary or scroll back to Claude's "Step 2 — Migration plan" message.
3. Continue from the first `pending` batch in the table above.
