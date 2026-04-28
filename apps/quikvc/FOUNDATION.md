# QuikVC — Sprint 1 Foundation

This document tracks what landed in the Sprint 1 scaffold and what's next. Read this when you sit down to extend QuikVC for the first time.

For the full architecture (~30 models, 5 sprints, end-to-end design): `_internal/architecture-notes/quikvc-architecture-v1.md`.

---

## What's in this app today

### Code structure
```
apps/quikvc/
├── manifest.ts                       App contract registered with the launcher
├── middleware.ts                     SSO middleware via @quikit/auth
├── next.config.js                    Port 3008, transpile @quikit/* packages
├── tailwind.config.ts                Extends @quikit/ui/tailwind-config
├── tsconfig.json                     Path aliases for @quikit/*
├── vitest.config.ts                  Test runner aliases
├── vercel.json                       main-only deploy gating
├── package.json                      name="quikvc", port 3008
├── CLAUDE.md                         Strict app-level rules
├── README.md                         Per-app readme
├── FOUNDATION.md                     this file
│
├── app/
│   ├── layout.tsx                    Root layout + Providers
│   ├── page.tsx                      Role → portal redirect (dev: ?role=)
│   ├── globals.css                   imports @quikit/ui/styles
│   ├── login/page.tsx                Auto-redirect to QuikIT SSO
│   │
│   ├── (vc)/                         VC / Fund portal — Analyst/Partner/Fund Admin/IC Member
│   │   ├── layout.tsx                Slim left rail + top context bar
│   │   └── home/page.tsx             Command Center (Sprint 1 placeholder)
│   │
│   ├── (founder)/                    Startup portal — Founders only
│   │   ├── layout.tsx                Mobile-first header + tab nav
│   │   └── dashboard/page.tsx        Founder home (Sprint 1 placeholder)
│   │
│   ├── (investor)/                   Investor portal — LP/HNI/Angel
│   │   ├── layout.tsx                Desktop dashboard nav
│   │   └── dashboard/page.tsx        Capital summary (Sprint 1 placeholder)
│   │
│   └── api/
│       ├── auth/[...nextauth]/route.ts   NextAuth via shared options factory
│       └── health/route.ts                Liveness probe
│
├── components/
│   └── providers.tsx                 SessionProvider → QueryClient → ThemeProvider
│
├── lib/
│   ├── auth.ts                       authOptions (OAuth client mode + fallback)
│   ├── db.ts                         re-exports @quikit/database client
│   ├── roles.ts                      QuikVCRole + QuikVCPortal mapping
│   ├── utils.ts                      re-exports cn() from @quikit/ui
│   └── api/
│       ├── errors.ts                 toErrorMessage helper
│       ├── getTenantId.ts            tenant-id extractor from session
│       └── withTenantAuth.ts         API route wrapper (factory)
│
└── __tests__/
    ├── setup.ts                       Global Vitest setup
    └── unit/utils.test.ts             Sample test (cn() smoke)
```

### Database — `app_quikvc` schema (6 models)

| Model | Sprint | Purpose |
|---|---|---|
| `VCFundProfile` | 1 | Per-tenant VC settings (fund name, currency, IC mode, thesis, daily brief hour) |
| `VCVertical` | 1 | Per-tenant verticals (default seed: 7) |
| `VCScoringCriterion` | 1 | Per-vertical scoring criterion with weight |
| `VCApplication` | 1 | Founder-submitted application |
| `VCDeal` | 1 | Core deal record — drives 9-stage pipeline |
| `VCTimelineEvent` | 1 | Append-only event log per deal |

**Sprint 2+ adds**: `VCDealScore`, `VCDealFinancials`, `VCDealSignal`, `VCDealDocument`, `VCMeeting`, `VCMeetingTranscript`, `VCICMemo` (+versions), `VCICVote`, `VCInvestor`, `VCCommitment`, `VCCapitalCall`, `VCDealAllocation`, `VCRepaymentSchedule`, `VCTermSheet`, `VCSourcedOpportunity`, `VCComparableCompany`, `VCNotificationItem` etc. — see architecture brief §4.

### Module registration
`packages/shared/lib/moduleRegistry.ts` — `appSlug: "quikvc"` with 14 module entries. Drives the VC portal sidebar.

### Tenant relations
`Tenant` model gained 6 back-relations: `vcFundProfile`, `vcVerticals`, `vcScoringCriteria`, `vcApplications`, `vcDeals`, `vcTimelineEvents`.

---

## How to run it locally

```bash
# From repo root
DATABASE_URL_DIRECT="postgresql://user@localhost:5432/quikscale_dev" \
DATABASE_URL="postgresql://user@localhost:5432/quikscale_dev" \
npm run db:generate

# In apps/quikvc/
npm run dev          # http://localhost:3008
```

Dev hatch — preview each portal without auth wired:
- `http://localhost:3008/?role=analyst`   → VC portal
- `http://localhost:3008/?role=founder`   → Founder portal
- `http://localhost:3008/?role=fund_admin` → VC portal as Fund Admin

(Investor portal: route directly to `/dashboard` once you've picked a role; portals are server-routed by `app/page.tsx`.)

---

## Sprint plan (from architecture brief §10)

| Sprint | Weeks | Status |
|---|---|---|
| **Sprint 1 — Foundation** | 1–2 | ✅ **Done** (this commit) |
| Sprint 2 — VC core (Pipeline, Workbench skeleton, Application wizard, Documents, Founder dashboard) | 3–4 | Pending |
| Sprint 3 — Evaluation + AI (Scorecard, Risk register, Comparables, Meetings, Memo Builder, Daily Summary) | 5–6 | Pending |
| Sprint 4 — Decision + Capital (Partner Review, IC Review + voting, Term Sheet, Allocation, Investor Mgmt, Repayments, Investor Portal) | 7 | Pending |
| Sprint 5 — Sourcing + admin + polish (Sourcing dashboard, Underwriting Setup admin, Notifications, Mobile QA, Production deploy) | 8 | Pending |

---

## What Sprint 2 picks up next

In rough order:

1. **Wire real NextAuth session** — replace the `?role=` dev hatch in `app/page.tsx` with `getServerSession()` + `session.user.membershipRole`.
2. **Register `quikvc` in the App table** — seed script to insert App row + grant ValleyNXT TenantAppAccess.
3. **Migration + seed** — run `npx prisma migrate dev --name quikvc-foundation`; seed 1 demo tenant + 7 verticals + their scoring criteria + 3 founder accounts + 5 demo deals across the 9 stages.
4. **Pipeline view** — `(vc)/deals/page.tsx`: read `VCDeal` filtered by `tenantId`, render Kanban (6 columns grouping the 9 stages).
5. **Deal Overview** — `(vc)/deals/[id]/page.tsx`: header + `InvestmentPulseCard` placeholder + stage timeline.
6. **5-step Application Wizard** — `(founder)/application/new/page.tsx`: Steps 1–5 from BRD §4.2.1, server-side submission creates `VCApplication` + auto-creates `VCDeal` at intake stage.
7. **Document upload** — `(founder)/documents/page.tsx`: file picker, `VCDealDocument` model (Sprint 2 schema add), Vercel Blob storage.
8. **Q&A thread** — `(founder)/questions/page.tsx` + analyst-side equivalent in workbench.

Each new feature follows the patterns in `docs/03-api-patterns.md`, `docs/04-db-patterns.md`, and `docs/05-frontend-patterns.md`.

---

## Important conventions for QuikVC

In addition to the rules in `apps/quikvc/CLAUDE.md` (which apply to every QuikIT app):

1. **Model prefixes**: every QuikVC Prisma model is prefixed `VC` (e.g., `VCDeal`, `VCInvestor`). Distinguishes from QuikScale's models in import statements.
2. **Schema namespace**: every QuikVC model has `@@schema("app_quikvc")`. Don't add models in `public` unless they're cross-app (none are today).
3. **Tenant isolation**: every QuikVC query filters by `tenantId`. The `VCFundProfile` is the only QuikVC-specific tenant config; check it for fund-level settings (IC mode, currency, daily brief hour).
4. **9 stages, 6 Kanban columns**: see architecture brief §6 for the canonical mapping. Don't bake a different stage list into UI.
5. **5 internal roles, 3 portals**: see `lib/roles.ts`. Founder → Founder portal; Analyst/Partner/Fund Admin/IC Member → VC portal; Investor (LP/HNI/Angel) → Investor portal.
6. **AI calls go through `lib/ai/claude.ts`** (Sprint 3 — file doesn't exist yet). Don't call the SDK directly from route handlers.
7. **Audit log**: every mutation that crosses a stage or changes capital writes a `VCTimelineEvent` row with appropriate `visibility`.
8. **Verification stubs**: any GST/PAN/MCA/CIBIL verification calls go through `lib/verification/` (Sprint 2 add) returning mock-verified with a clear stub indicator. Real APIs swap in later.

---

## Known temporary code (remove before Sprint 2 ends)

| File | Temporary thing | Remove when |
|---|---|---|
| `app/page.tsx` | `?role=` query-param hatch | Real auth wiring lands |
| `(vc)/layout.tsx` | "Sprint 1 shell — auth wiring in Sprint 2" footer text | Sprint 2 |
| `(vc)/home/page.tsx` | Static Sprint 2/3/4 placeholders | As real data wires in |
| `(founder)/dashboard/page.tsx` | "Application not started" hardcoded | When VCApplication query lands |
| `(investor)/dashboard/page.tsx` | "—" placeholders | When Investor model + queries land in Sprint 4 |

---

## Open questions for Sprint 2 kickoff

1. **File storage** — Vercel Blob (recommended) or UploadThing? Decision still open from architecture brief §16.
2. **Vercel Cron** — confirm we're using Vercel's native cron for the daily AI summary, not a self-hosted scheduler?
3. **Email templates** — react-email library (recommended) or plain HTML strings?

---

## Commit log

- **Sprint 1 (this commit)**: scaffold + 6 models + 3 portal layouts + 3 home screens + auth scaffolding + module registry + tenant back-relations + typecheck green across all 4 apps.
