# CLAUDE.md — CrmExpress (living context)

> **HOW TO READ THIS FILE.** Facts are tagged by source and confidence:
> `[confirmed: <evidence>]` = backed by a commit hash, file path, or repo audit ·
> `[confirmed by Rishabh]` = stated firsthand by the owner · `[inferred]` = reasoned, not proven ·
> `[open]` = never verified, do not treat as fact.
> **Trust commit hashes, branch names, and file paths over product names in ANY summary — including this file and including Claude's own memory,** which is known to mislabel `quikcrm-frontend` work as "QuikCRM". When in doubt, re-run the read-only repo audit (see Verification section).

---

## ⚠️ CHECKOUT & IDENTITY GUARD — read before any "wrap up" write

- **This project is `CrmExpress` and lives at `C:\Projects\CrmExpress`.** Before writing to any file in `docs/claude-project/`, verify the filesystem connector is actually pointed at THIS path. The connector on this machine can reach four checkouts (QuikIT, QuikSocial, QuikSign, CrmExpress) and has reached the wrong one before. If you cannot confirm you are in `C:\Projects\CrmExpress`, do NOT write — tell Rishabh.
- **THE NAMING TRAP:** the repo is `quikcrm-frontend`, the DB schema is `app_quikcrm`, and the UAT URL is `uatquikcrm.quikit.ai`. **None of these is QuikCRM.** CrmExpress is a diverged client CRM that happens to share QuikCRM's schema lineage. MoreYeahs' own QuikCRM product is a SEPARATE codebase (`quikit1926`, `apps/quikcrm`). Never import QuikCRM decisions, specs, or facts into CrmExpress work. Surface-level schema similarity is NOT evidence that a fact belongs to CrmExpress.

---

## What CrmExpress is
CrmExpress CRM is a multi-tenant Next.js CRM built for the client **CrmExpress** (an Indian fintech SaaS company, a MoreYeahs client). Its defining feature is telephony-integrated lead management with a configurable call-disposition **form-builder + rule engine ("FR-RE")**. Owned and solely developed by Rishabh at MoreYeahs. Client stakeholder: **Dev**.

## Repo & environment [confirmed: CC repo audit 2026-07-06]
- **Repo:** `quikcrm-frontend` (GitHub: akhileshgandhi/quikcrm-frontend). Cloned at `C:\Projects\CrmExpress`. Working branch **`new_Merge_code_19June`** — clean, level with origin.
- **Layout — repo-at-root, NOT a nested monorepo.** App files (`app/`, `components/`, `lib/`) at root; shared packages at **`./packages/`** (auth, database, redis, shared, ui). `apps/` does NOT exist. Anything referencing `../../packages` is wrong for this layout (see Tailwind gotcha).
- **Stack:** Next.js **14.0.4** (exact pin; known-vulnerable — see blockers), React, TypeScript, Prisma, PostgreSQL 18, Tailwind, Vitest. Package `quikcrm@0.1.0`.
- **Dev server:** `next dev -p 3017` → **localhost:3017**.
- **Database:** local PG18, DB **`first_db_crm`** — shared multi-app DB, 12 schemas; CrmExpress's schema is **`app_quikcrm`**. Full 12-schema DB kept intact [confirmed by Rishabh: sibling schemas inert to CrmExpress, trimming risks unknown breakage].
- **Auth:** shared `auth` schema; working login `crmexpress@example.com`. Passwords bcrypt-hashed.
- **`.env.local`** at repo root, gitignored, single copy — never commit or reproduce. `DATABASE_URL` password is URL-encoded (`%40` = `@`).

## Deployment [needs reconciliation]
- **Running client deployment: IIS at `https://uatquikcrm.quikit.ai` (UAT)** [confirmed by Rishabh, firsthand — has seen the client app running there]. Despite the hostname, this is CrmExpress, not QuikCRM.
- **Repo contains `vercel.json`** at root (main-branch deploy enabled) [confirmed: CC audit]. No `web.config`, no Dockerfile, no k8s manifests in-repo.
- **These two facts are unreconciled:** the repo's build config targets Vercel while the live deployment is IIS. The `vercel.json` may be vestigial or a parallel path. Do not state "deploys to Vercel" as the deployment story. Future prod target is GKE-or-TBD [open].

## Core feature: FR-RE (disposition form-builder + rule engine)
The agent logs a call by selecting ONE thing — **Status** (the "Option Y" model); disposition is the act of logging, not a separate picker. Stage = pipeline position; Status = state after an action. A configurable rule engine (conditions → actions) drives visibility and side-effects. FR-RE Stages 1–4 have LANDED on `new_Merge_code_19June` [confirmed: all 8 stage commits present in git history — see Decisions]. A clean FR-RE view runs gated on a live form runtime; the legacy view is retained as fallback until Stage 5.

## Codebase map (FR-RE + telephony core) [confirmed: dump + fr-re-followups.md]
- `components/leads/call-disposition-modal.tsx` — hosts legacy + clean disposition views.
- `components/leads/disposition/clean-disposition-form.tsx` — clean FR-RE agent form (Stage 2b), gated on live `formRuntime`.
- `components/leads/disposition/disposition-field-groups.tsx` — shared field rendering (Stage 2a).
- `lib/services/forms/field-visibility.ts` — pure `fieldVisible`/`tabVisible`/`fieldRendered`; 13/13 unit tests.
- `lib/services/forms/form-rule-action.service.ts` — A7a status-integrity gate (see fr-re-followups.md §A7a).
- `lib/services/forms/disposition-statuses.service.ts` — canonical status source; holds the PLACEHOLDER stage→status seed.
- `lib/services/telephony/` — `disposition-engine.ts` (save wiring, Option A), `call-service.ts`, `webhook-handler.ts`, `india-voice.ts`.
- `lib/services/automation/disposition-rule-engine.ts` — FR-D3/D4/D5 automation (disposition-scoped, one-hop, no cascade).
- `scripts/seed-stage-status-mapping.ts` — PLACEHOLDER seed; real CrmExpress mapping owed from Dev.
- Rule-builder UI + Option-Y save path: commits `2f84d41`, `7b6a656`, `a141819`, `5ac451f`, `e5a5bb2`, `c08bfbd`, `9be1c1c`, `fea34b4`, `fe9be2d`, `68b04ec`, `621c0d8`.

## Data model notes [confirmed: dump restore counts]
Populated & real: `CrmLead` (146; 134 shown in main tenant, rest soft-deleted/other-tenant), `CrmActivity` (458), `CrmFormField` (94), `CrmFormRule`/`RuleAction`/`RuleCondition` (55 each), `CrmLeadStatus` (32), `CrmLeadSubStatus` (61), `CrmIndiaVoiceWebhookLog` (135), plus others.
**Empty scaffolding — NOT working features, do not build on assumptions:** `CrmAutomationRule`/`PendingStep`/`DistributionState`, `CrmSalesGroup*`/`CrmSalesTeam`, `CrmPermissionTemplate*`, `CrmSlaRule*`, `CrmWorkflowDefinition`/`CrmProcessDefinition`, quotes/products/orders stack, `CrmDocument*`, `CrmPaymentVerification` (0 rows BUT the PV flow is load-bearing in `createCallLog` — do not remove).
**Schema semantics differ from the QuikCRM spec:** `status`/`stage`/`substatus` are TEXT on the lead row (not FKs); `convertedAt` is a TIMESTAMP (not a boolean `converted`); `deletedAt` soft-delete; `dynamicFields` jsonb. Don't port QuikCRM-spec assumptions into queries.

## Root CLAUDE.md — inherited monorepo contract, partially diverged
The repo-root `CLAUDE.md` (and `AGENTS.md`) describe a QuikIT-monorepo integration contract: depend on immutable `@quikit/*` packages, integration-owner PR review, app moves to **Neon** on integration. Status:
- **The layout divergence is [confirmed: commit `77ffbf5` in-code comment]** — the code itself states it sits at repo root, "not ../../packages as a nested apps/<app> monorepo would require."
- Whether CrmExpress still follows that governance / syncs back to the monorepo, or is a permanent fork, is **[open]** — never established; confirm with Akhilesh (repo owner) or Pravin.
- **Neon deployment: [open]** — no evidence it ever happened; contradicted by the firsthand IIS fact. Treat Neon as historical/unverified.
- **Still honor the root file's CODING rules** (they're good discipline and enforced by review): `tenantId` filter on every DB query, `withTenantAuth` on DB-touching routes (except `/api/health`, `/api/auth/*`), no `as any`, `{success,data}`/`{success,error}` response shape, tests for 401 + tenant-isolation + happy-path, canonical file locations. See `CrmExpress-Engineering-Practices.md`.

## Commands (PowerShell, Windows)
```powershell
npm run dev            # localhost:3017
npm run typecheck; npm run lint; npm run test   # run before every commit (CI runs these too)
# PG binaries are NOT on PATH — call full paths:
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" ...
```

## Verification (how to re-establish ground truth)
Any time this file feels stale or suspect, re-run a read-only repo audit: `git branch --show-current`, `git log --oneline -15`, `git branch --contains <hash>`, inspect `package.json` / `tailwind.config.ts` / `vercel.json`, `npm audit`. Trust that output over any prose — including this file.

## Reference docs (in-repo, CrmExpress-authored — do not duplicate, cite)
- `docs/fr-re-followups.md` — authoritative FR-RE scoping/deferral doc (A7a gate, UI-library reconciliation, Option A→C save-wiring, legacy-menu migration, placeholder stage→status mapping, timezone task). Read it before FR-RE work.
- Living state: `docs/claude-project/QuikSign... ` → NO. CrmExpress living state is `docs/claude-project/SESSION_LOG.md` and `CrmExpress-Product-Status.md`.

## Standing corrections (binding — do not re-litigate)
- Never assume a status-subject rule ever fired in the LEGACY view: `status: null` predated Stages 2a/2b, so it could not have [confirmed: `a141819`].
- The disposition rule engine is **disposition-scoped** (one-hop, no cascade). General automation is a separate, unbuilt system (empty `CrmAutomation*` tables). Do not conflate.
