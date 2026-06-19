# QuikHRMS — Change Inventory

Complete list of changes made to QuikHRMS, verified against the current code
(filesystem checks, greps, a clean production build, and `tsc --noEmit`).

All changes are **HRMS-only** except the one approved cross-app domain rename (§L).

---

## A. BullMQ + Pub/Sub fully removed
**Deleted** (confirmed absent): `worker/`, `lib/queue/`, `instrumentation.ts`,
`app/api/v1/hrms/realtime/` (SSE route), `lib/hooks/use-realtime.ts`,
`components/hrms/realtime-provider.tsx`, `components/hrms/realtime-toast.tsx`,
`components/hrms/connection-status.tsx`.

- `package.json`: removed deps `bullmq`, `@bull-board/api`, `@bull-board/express`, `ioredis`; removed `worker` + `worker:dev` scripts.
- `lib/services/realtime.ts` → no-op stubs, **no ioredis** (`publishEvent`, `publishNotification`, `publishPayrollProgress`, `publishBulkImportProgress`, `publishAssetUpdate`, `publishTicketUpdate`; `createSubscriber` removed).
- Removed the realtime test block from `__tests__/api/session-sync.test.ts`.

## B. Email → inline (matches QuikScale / QuikTrack / QuikInfra)
- `lib/services/mailer.ts`: `queueEmail()` now `await sendMail(input)` inline (no enqueue). `readRawEnv()` reads `.env.local` then `.env` (fixes `$`-mangled `SMTP_PASS`). Office365 transport.
- `lib/services/invitation.ts`: `dispatchInvitationEmail`, `queueInvitationEmail`, `inviteSingleEmployee`, `inviteImportedEmployees` all send inline.

## C. Heavy ops → in-process background + DB status + polling
- **New** `lib/run-background.ts` — `runBackground(label, fn, onError?)` fire-and-forget for the long-lived GKE Node server.
- **New** `lib/jobs/run-bulk-import.ts`, `lib/jobs/run-payroll-compute.ts`, `lib/jobs/run-payslip-release.ts` — de-queued processors that update Postgres status records (no Redis, no publish).
- **New** `lib/org-chart-rebuild.ts` — no-op `scheduleOrgChartRebuild` (org chart computed live on read); 6 employee routes repointed from `@/lib/queue/helpers`.
- Routes converted to `runBackground` + HTTP 202: `employees/bulk-import`, `payroll/runs/[id]/compute`, `.../adjust-days`, `.../adjust-tds`, `.../release`; `.../resend-email` now inline.

## D. Realtime → polling
- `components/hrms/layout/sidebar.tsx`: unread-count uses `refetchInterval: 60_000`; removed `useRealtimeEvents`.
- `components/providers.tsx`: removed `RealtimeProvider`. `app/(dashboard)/layout.tsx`: removed toast listener + connection status.

## E. Session & cache (restored to match QuikScale)
- `lib/with-auth.ts`: `resolveIdentity` uses `verifyJWT(req)` (`getToken` + `isAuthSessionActive` → Redis `auth:session` check); `invalidateUserAuthCaches` is a no-op.
- `lib/services/cache.ts`: `UNCACHED_PREFIXES = ["perms:", "employee-me:", "notif-unread:"]` bypass cache; everything else routes through `@quikit/auth/cache`.
- `lib/rbac/central-sync.ts`: `syncCentralMembership` / `centralSyncCacheKey` removed; `applyCentralState` / `centralSyncConfigured` kept.
- `lib/services/leave-policy-engine.ts`: reads DB directly; `invalidateLeavePolicyCache` no-op.

## F. Redis surface after the work
Only **common platform** usage remains: `auth:session:*` (shared SSO session store) + `@quikit/auth/cache`. The `admin/redis-health` diagnostic route remains. No `bull:*`, no `realtime:*`.

## G. Bug fixes
- `components/hrms/employees/employee-select.tsx`: added `enabled: !disabled` → fixes Help Desk **New Ticket** "departmentId is required".
- `lib/validations/tickets.ts`: `fileUrl` → `z.string().refine(http(s) || startsWith("/"))` → fixes ticket **attachment** "Valid URL required" (uploads return relative proxy paths).
- `lib/services/analytics-cache.ts`: schema-qualified all raw tables `"app_quikhrms"."…"` → fixes **compensation analytics 500** (`relation does not exist` on Neon pooler + multiSchema).
- `app/api/v1/hrms/expenses/reports/route.ts`: same fix for `"app_quikhrms"."ExpenseClaim"`.
- `app/(dashboard)/engage/social-wall/page.tsx`: import path `../../_home/…` → `../../dashboard/_home/…` → fixes **Docker/CI build failure** (Module not found).

## H. Build config alignment (`next.config.js`)
- Added `transpilePackages: ["@quikit/ui","@quikit/auth","@quikit/shared","@quikit/database","@quikit/redis"]`.
- Moved `outputFileTracingRoot` into `experimental:` (top-level was silently ignored on Next 14).
- Removed `devIndicators: false`, `allowedDevOrigins`, `turbopack` (Next-15-only keys → warnings) and the stale embedded-worker comment.
- Kept `output: "standalone"`, `basePath` / `assetPrefix`, the lucide `webpack` alias (hydration fix).

## I. Docker (`Dockerfile` rewritten)
- Now matches the canonical QuikScale / QuikTrack / QuikInfra pattern: `node:20-alpine`, `builder` (`turbo prune quikit-hrms`) → `installer` (`npm ci --ignore-scripts` + `prisma generate` + `turbo build`) → `runner` (standalone, non-root).
- Port `3009`; bakes `NEXT_PUBLIC_QUIKIT_URL / AUTH_URL / QUIKHRMS_URL / APP_URL / BASE_PATH`; keeps the `--max-old-space-size=4096` heap bump; removed all BullMQ / instrumentation references.

## J. Health API (NEW — was missing)
- **New** `app/api/health/route.ts` — liveness probe (200, no deps).
- **New** `app/api/health/ready/route.ts` — readiness probe: Postgres (`SELECT 1`) + Redis (`isRedisAvailable`, optional), returns 200/503, details gated by `HEALTH_TOKEN`. Mirrors QuikScale; public (middleware matcher excludes `api/`).

## K. Environment file (`.env.local`)
- Removed the `BULLMQ / WORKER` block (`DISABLE_EMBEDDED_WORKER`, `BULL_BOARD_PORT/USER/PASS`).
- Updated the `REDIS_URL` comment (session/cache only; no job queue).

## L. Cross-app domain rename (approved, not HRMS-only)
- `hrms.quikit.ai` → `people.quikit.ai` in `apps/auth/app/api/post-login/route.ts`, `packages/auth/index.ts` (shared allow-lists), and the `apps/quikhrms/Dockerfile` comment.

## M. Prisma-related
- **No `schema.prisma` model changes.** The only Prisma-related change is schema-qualifying raw `$queryRaw` table names (see §G: analytics-cache, expenses/reports).

## N. Invitation / provisioning robustness
- `lib/auth/provision-member-remote.ts`: added `tempPassword?` to the result; central provisioning made best-effort.
- `app/api/v1/hrms/invitations/route.ts` + `.../bulk/route.ts`: provisioning best-effort (warn, no 503); pending invite → resend inline.
- `app/(dashboard)/settings/users/page.tsx`: bulk-result labels "Invited / Sent / Skipped".

## O. Docs / non-code
- **New** `docs/app_quikhrms-schema.md` — full `app_quikhrms` schema documentation (137 tables, 147 enums, indexes / constraints / FKs) generated from the live Neon DB; structure only, no data.
- **New** `docs/CHANGES.md` — this file.

## P. Known leftovers (not yet cleaned)
- `package.json` still lists `express` `^5.2.1` + `@types/express` — now **unused** after the `@bull-board/express` removal (dead deps; safe to drop later).

---

## Verification
- `grep` of `package.json` → no `bullmq` / `@bull-board` / `ioredis`, no `worker` scripts.
- Filesystem → `worker/`, `lib/queue/`, `instrumentation.ts`, `realtime/` SSE, realtime hook/components all **absent**; new `lib/jobs/*`, `run-background.ts`, health routes, Dockerfile, schema doc all **present**.
- `grep` confirmed: `realtime.ts` has no ioredis; `mailer.queueEmail` awaits `sendMail`; analytics-cache has schema-qualified raw SQL; tickets `fileUrl.refine`; employee-select `enabled: !disabled`; social-wall import corrected; `with-auth` imports `verifyJWT`; `next.config.js` has `transpilePackages` + `experimental.outputFileTracingRoot`; `.env.local` has no BullMQ keys.
- Production `next build` → exit 0, 327 routes. `tsc --noEmit` → 28 pre-existing errors (down from 30 after the social-wall import fix), **zero** new errors.
