# QuikIT CRM — Quotes Feature: Realistic Implementation Estimate

**Date:** 2026-05-11
**Context:** The attached spec proposes a 12-task, 37-day (5–6 week) build for a Microsoft Dynamics 365–style Quotes module in `apps/quikcrm/`. The spec was written without inspecting the actual codebase. This report grounds the estimate in what's already there.

**Headline:** The spec is **~40% optimistic**. Realistic single-engineer effort is **8–14 weeks** depending on PDF/email infrastructure pain. The codebase has excellent CRUD/auth/audit foundations, but **PDF, email, and storage are greenfield** and that's where the spec systematically under-counts.

---

## A. Codebase Inventory Findings (Phase 1)

### Database (`packages/database/prisma/schema.prisma`)
- **None of the target models exist:** `CrmProduct`, `CrmPriceList`, `CrmPriceListItem`, `CrmQuote`, `CrmQuoteLine`, `CrmOrder`, `CrmInvoice` — all greenfield.
- **Referenced parent models all exist & are healthy:**
  - `CrmAccount` ([schema.prisma:5546-5616](packages/database/prisma/schema.prisma#L5546-L5616))
  - `CrmContact` ([schema.prisma:5618-5645](packages/database/prisma/schema.prisma#L5618-L5645)) — note: missing `deletedAt`
  - `CrmOpportunity` ([schema.prisma:5774-5825](packages/database/prisma/schema.prisma#L5774-L5825)) with `amount Decimal @db.Decimal(18,2)` and `currency String @default("INR")`
  - `CrmOpportunityProduct` (already has line items pattern — useful reference)
  - `CrmAuditLog` ([schema.prisma:6530-6545](packages/database/prisma/schema.prisma#L6530-L6545))
- **Schema namespace:** All CRM models use `@@schema("app_quikcrm")` (multi-schema enabled).
- **Soft delete:** Middleware at [packages/database/index.ts:8-119](packages/database/index.ts#L8-L119) auto-injects `deletedAt: null` for registered models. Quote models will need to be added to `SOFT_DELETE_MODELS`.
- **Tenancy:** `tenantId` on every CRM model, but **no automatic filtering** — queries must opt in via `where: { tenantId }`.
- **Money convention:** `Decimal @db.Decimal(18, 2)` everywhere. Spec calls for `Decimal(15,2)` — recommend conforming to the existing 18,2 standard.
- **Auto-numbering:** ❌ **Does not exist.** No `leadNumber`/`opportunityNumber` pattern, no sequence table. Spec's `QT-2026-001` numbering is net-new infrastructure.
- **Migration cadence:** 28 migrations, 1–3 per day, comfortable with frequent schema changes.

### API patterns (`apps/quikcrm/app/api/`)
- **Auth & permission:** `requireApiUser()` → `SessionUser`, then `assertModule(user, module, action)` and `assertAccountAccess(user, accountId)`. Pattern is mature.
- **Validators:** Zod schemas in `apps/quikcrm/lib/validators/*.ts`.
- **Response envelope:** `ok(data)` and `fail(error, fieldErrors?)` helpers — `{ success: true|false, data|error }`.
- **Pagination:** Standardized via `lib/validators/pagination.ts` — page sizes `[10, 25, 50, 100]`, skip/take Prisma pattern.
- **Audit & activity:**
  - `audit({ tenantId, userId, module, action, resourceId, before, after, metadata })` at `lib/services/audit.ts:25-38` with `diffShallow()` helper.
  - `logActivity()` at `lib/services/activities/log-activity.ts` for the activity feed, with idempotency on `(tenantId, sourceSystem, externalId)`.
- **State machine precedent (critical for Q8):** `lib/services/opportunities/transition-service.ts` defines `TRANSITIONS[stage] → allowed[]`, `validateTransition()`, `recordTransition(tx, args)` writing both `CrmOpportunityStageTransition` and `CrmActivity` rows. This is **directly cloneable for Quotes**.

### UI patterns (`apps/quikcrm/`)
- **List page template:** `app/(dashboard)/contacts/page.tsx` + `components/contacts/contacts-list-client.tsx` (524 lines) — server page reads perms, client component handles search/filter/pagination with custom `<Table>` from `components/ui/table` and `<Pagination>`. Not AG Grid or TanStack — own components.
- **Modal:** Local `components/ui/modal.tsx` (69 lines) — they recently *dropped* `@quikit/ui` Modal and ship their own. Use this.
- **Form pattern:** `react-hook-form` is installed but most forms use **manual `useState` + inline validation** (see `create-opportunity-modal.tsx`, `convert-lead-modal.tsx`). No formal form library being used.
- **Convert-flow precedent (critical for Q12):** `app/api/leads/[id]/convert/route.ts` does Lead → Account + Contact + Opportunity in a `prisma.$transaction`, relinks Activities/Tasks/Notes/CallLogs, writes audit row `lead_convert_relink`. This is the **Quote → Order template**.

### Infrastructure libraries (root + workspace `package.json`s)
| Need | Status |
|---|---|
| PDF generation | ❌ **None** — no puppeteer, react-pdf, pdfkit, jsPDF |
| Email | ❌ **None** — no @sendgrid/mail, nodemailer, resend, SES |
| File storage | ❌ **None** — no S3, Azure Blob, uploadthing |
| CSV/Excel | ✅ `xlsx` (0.18.5) installed; `lib/services/reports/export-helper.ts` + `components/reports/export-button.tsx` already work; routes accept `?format=csv\|xlsx` |
| Decimal math | ✅ via Prisma's `Decimal` |
| Number-to-words (Indian) | ❌ Not installed |

### Testing (`apps/quikcrm/__tests__/`)
- `__tests__/api/{module}/*.test.ts`, `__tests__/components/*.dom.test.tsx`, `__tests__/permissions/`, `__tests__/unit/`.
- `__tests__/helpers/mockDb.ts` provides `mockDb()` + `setSession()`. Pattern is `vi.mock("@quikit/database")` + `vi.mock("@/lib/auth/require")`.
- Typical API test ≈ 120–180 lines; covers 401, happy path, tenant isolation, validation.

---

## B. Per-Task Estimates (Phase 2)

| # | Task | Spec | My est. | Why |
|---|---|---|---|---|
| Q1 | Product Master schema + CRUD + tests | 3d | **3–4d** | Schema is straightforward; CRUD pattern is well-templated; `CrmOpportunityProduct` is a partial reference. ~5 routes + 4–5 test files. |
| Q2 | Product Master UI + add/edit modal + CSV import | 3d | **4–6d** | List page clones contacts-list-client. Modal clones create-opportunity-modal. **CSV import is new work for products** — leads import is the only precedent and it's queue-based, not the simple inline upload the spec implies. |
| Q3 | Price List schema + CRUD + tests | 2d | **2–3d** | Two models (`CrmPriceList`, `CrmPriceListItem`) but pattern is standard. |
| Q4 | Price List UI + detail page | 3d | **3–5d** | List page easy. Detail page has inline add/remove products with custom price + discount slabs — no precedent for inline-editable child rows. |
| Q5 | Quote schema (CrmQuote + CrmQuoteLine) + **auto-numbering** | 2d | **3–4d** | Models themselves are 1–2 days, but **`QT-2026-001` numbering is greenfield**. Need a `CrmSequence` table or transactional counter — not 0 work. Many fields (~25 on CrmQuote, ~15 on CrmQuoteLine). |
| Q6 | Quote Builder UI — header + line items | 5d | **7–9d** | Largest UI task. Header section ≈ contact form. Line items table needs **product picker modal**, inline qty/price/discount editing, live recalculation on every change, row reordering. None of the existing tables in quikcrm are inline-editable — this is a new component. |
| Q7 | GST/Tax engine + totals | 3d | **3–4d** | Pure logic: CGST/SGST/IGST split, mixed rates, inclusive vs exclusive, round-off. Heavy unit testing. Add `number-to-words` (or write Indian-numbering converter — Lakh/Crore is non-trivial). |
| Q8 | Quote status workflow + state machine | 2d | **3–5d** | **State machine alone is ~2d** (clone `transition-service.ts`). But the **approval workflow above threshold is greenfield** — manager notification, approve/reject UI, blocking activation. Spec under-counts. |
| Q9 | **PDF generation (Puppeteer + template)** | 5d | **8–12d** | **Highest risk.** Zero PDF infrastructure today. Puppeteer on Vercel serverless is painful (Chromium binary, cold-start memory limits — typically `@sparticuz/chromium` + tuning). Template work (header band, GST-compliant table, totals, signature block, footer pagination) is real layout effort. Plus storage decision (S3/Azure not set up either). |
| Q10 | Email integration | 3d | **5–7d** | Zero email infrastructure. Need to: pick provider, set up domain auth (SPF/DKIM), build composer modal, attachments, template editing, sent-at audit, error handling for bounces. Spec misses domain-auth + template management time. |
| Q11 | Quote versioning (revise → V2…) | 3d | **3–4d** | `parentQuoteId` chain + clone-line-items + status flip. Display history. No major surprises. |
| Q12 | Convert Quote → Order + Order skeleton | 3d | **3–5d** | Lead→Opportunity convert pattern is the template. But the spec wants an Order *skeleton* without specifying scope — easy to scope-creep into "Order CRUD too." Tightly scope this. |

**Totals:**
- Spec low-end: 37 days
- My low-end: **47 days**
- My midpoint: **57 days**
- My high-end: **68 days**

---

## C. Total Rollup (Phase 3)

### 1. Comparison vs spec
My midpoint (**57d**) is **+54%** vs the spec's 37d. Drivers:
- **Q9 PDF** alone adds 3–7 days (no infra today).
- **Q10 Email** adds 2–4 days (no infra today).
- **Q6 Quote Builder** adds 2–4 days (no inline-edit table precedent).
- **Q5 auto-numbering** adds 1–2 days (greenfield).
- **Q8 approval workflow** adds 1–3 days (greenfield).

### 2. Calendar time (apply review/bug/integration buffer)
| Scenario | Dev-days | × Buffer | Calendar |
|---|---|---|---|
| **Optimistic** (single eng, smooth) | 47 | × 1.4 | ~13 weeks |
| **Realistic** (single eng, normal hiccups) | 57 | × 1.6 | ~18 weeks |
| **Pessimistic** (single eng, PDF/email pain) | 68 | × 2.0 | ~27 weeks |

With **2 engineers** working the dependency-friendly chunks in parallel, divide by ~1.6 (not 2 — coordination overhead is real): roughly **8 / 11 / 17 weeks** for the same three scenarios.

### 3. Sequencing (single-engineer optimal order)
1. **Foundation (Q1 → Q2 → Q3 → Q4)** — products + price lists. Admin can configure catalog before any quote code exists.
2. **Schema + numbering (Q5)** — unblocks everything else.
3. **Calc engine first (Q7 before Q6)** — flip the spec's order. Build the totals/GST service with unit tests, then wire it into the UI. Avoids re-doing UI when math changes.
4. **Builder UI (Q6)**.
5. **State machine (Q8)**.
6. **PDF (Q9)** — start procurement/spike on the Puppeteer-on-Vercel question **in week 1**, don't wait until week 5.
7. **Email (Q10)** — similarly, start the DKIM/SPF DNS dance **in week 1** because lead time on DNS is real.
8. **Versioning (Q11)**, **Convert (Q12)** — wrap-up.

### 4. Parallelism with 2 engineers
- Eng A: Q1 → Q2 → Q5 → Q6 → Q11
- Eng B: Q3 → Q4 → Q7 → Q8 → Q12
- Either engineer (in parallel with main thread): **Q9** and **Q10** as standalone infrastructure spikes starting in week 1.

### 5. Critical path
**Q5 → Q6 → Q8 → Q9 → Q10** is the longest dependent chain (~27–37d). Everything else is leaf work. PDF (Q9) lives on the critical path because Email (Q10) needs an attachment.

### 6. Three biggest risks
1. **Puppeteer on Vercel serverless** — this is the classic "works on my laptop, fails in prod" trap. Cold-start memory, binary packaging, font availability for ₹/₹ rupee glyph, page-break behavior on long line-item tables. Spike this **in week 1** or switch to `@react-pdf/renderer`.
2. **Email deliverability** — SendGrid/Resend account setup, DKIM/SPF DNS on the customer's domain, suppression lists. None of this exists today. Easily a 1–2 week tail of "why are emails going to spam."
3. **GST edge cases** — inclusive vs exclusive pricing, mixed rates across line items, round-off rules, place-of-supply detection from billing state. Compliance bugs are very embarrassing in this market.

### 7. Three things that could go FASTER
1. **Convert-flow precedent.** `app/api/leads/[id]/convert/route.ts` is a near-copy template for Q12. Saves ~1d.
2. **State machine precedent.** `lib/services/opportunities/transition-service.ts` saves ~1–1.5d on Q8.
3. **CSV export already works.** `xlsx` + `ExportButton` shave ~0.5d off Q2's export side (import is still new).

---

## D. Build vs Buy (Phase 4)

### Q9 — PDF generation
**Recommendation: `@react-pdf/renderer` (pure JS), not Puppeteer.**

| Option | Pros | Cons | Fit |
|---|---|---|---|
| Puppeteer | Pixel-perfect HTML/CSS | Chrome binary on Vercel = `@sparticuz/chromium` config, cold-start memory pain, fonts/glyphs require explicit packaging | ❌ Wrong for serverless |
| **`@react-pdf/renderer`** | **No headless Chrome, runs on Node anywhere, React-component DSL the team already knows, predictable bundle size** | Limited CSS (no flex gaps, custom font registration), but covers everything in the spec's sample PDF | ✅ **Recommended** |
| `pdfkit` | Smallest, fastest | Imperative drawing API — slow to build a branded layout | Skip |
| DocRaptor / PDFShift (API) | Zero infra | Per-quote cost (~$0.05+), data leaves the tenant, latency, vendor lock-in | Skip for a GST-compliant doc |

The spec leaves the decision "deferred to dev phase" — make it **now**: `@react-pdf/renderer`. Vercel-friendly, no Chromium, and the React DSL plays well with the existing stack. The "limited CSS" cost is real but the sample PDF in Appendix A is well within its capability.

### Q10 — Email
**Recommendation: Resend.**

No email utility exists today, so this is greenfield. Quick comparison:
- **SendGrid** — what the spec says. Solid, but heaviest setup (account, IP warm-up if dedicated, DNS).
- **Resend** ⭐ — modern API, dev-friendly, React-Email integration if you want HTML templates as React components (which dovetails with the `@react-pdf/renderer` recommendation), small per-tenant DNS dance, similar pricing.
- **AWS SES** — cheapest at volume, but production-access approval delay (24–72h) is a real schedule risk.
- **SMTP / Nodemailer** — only if a tenant insists on bring-your-own-SMTP.

Build a thin `lib/services/email/send.ts` abstraction so the provider is a config switch. Start with Resend; SES later if cost matters.

---

## E. Final Realistic Timeline

| Scenario | Single engineer | Two engineers |
|---|---|---|
| **Optimistic** (PDF works first try, email DNS smooth, no scope creep) | **~13 weeks** | **~8 weeks** |
| **Realistic** (one PDF rewrite, ~1 week of email deliverability triage, normal review cycle) | **~18 weeks** | **~11 weeks** |
| **Pessimistic** (Vercel + Puppeteer dead end → switch to react-pdf mid-build, GST compliance rework, approval workflow scope creep) | **~27 weeks** | **~17 weeks** |

The spec's "5–6 weeks" is **only achievable** if you (a) skip PDF, (b) skip email, (c) skip approval workflow, (d) have a senior dev who has done all this before, and (e) accept zero buffer for review/bugs. In other words — it's not a realistic plan for production-grade delivery on this codebase.

---

## F. Top 5 Recommendations Before Starting

1. **Spike PDF and Email in week 0.** Don't wait until Q9 and Q10. A 2-day proof-of-concept of `@react-pdf/renderer` rendering the Appendix A sample on Vercel — and a Resend test send with DKIM — de-risks 5+ weeks of downstream work. If the PDF spike fails, you find out in week 1, not week 5.
2. **Build the totals/GST engine (Q7) before the Quote Builder UI (Q6).** Flip the spec's sequence. The math is the contract; the UI just renders it. Unit-tested calculation service first → UI calls it → no rework when GST edge case #14 surfaces.
3. **Standardize on `Decimal(18,2)` (not the spec's `15,2`) and add `CrmSequence` to the schema early.** Auto-numbering is a foundation, not a Q5 sub-task — putting it in the same migration as `CrmQuote` keeps the constraint simple.
4. **Scope-fence the "Order skeleton" (Q12) explicitly.** Write down "Order = id, quoteId, status, line items, totals; no fulfillment, no shipping, no invoicing." Otherwise Q12 quietly becomes Q12–Q15.
5. **Negotiate the spec's "5–6 weeks" with stakeholders now.** Walk into the conversation with this document. Show the 3 scenarios. Get explicit agreement on which scope-vs-time tradeoffs are acceptable — for example, "phase-1 ships without approval workflow and inbound email parsing, phase-2 adds them" cuts ~2 weeks. Better to negotiate scope on day 1 than slip in week 6.

---

## Verification

This is an estimation document, not an implementation plan. The way to validate the numbers is:

1. **Week-1 PDF spike** — render Appendix A's sample quote with `@react-pdf/renderer`, deploy to a Vercel preview, time the cold-start + warm-start render. If render > 3s warm or fails to deploy, re-estimate Q9 upward.
2. **Week-1 Email spike** — send a test email via Resend with DKIM configured against a sandbox subdomain. If DKIM verification > 48h or deliverability < 90%, re-estimate Q10 upward.
3. **Week-2 schema review** — propose the `CrmProduct` + `CrmQuote` + `CrmSequence` migration as a draft PR; have a senior reviewer pressure-test field choices before any UI is built.

If those three checkpoints pass cleanly, the **Realistic (18-week single-engineer)** number is honest. If any of them slip, move to the **Pessimistic** column without renegotiating midway.
