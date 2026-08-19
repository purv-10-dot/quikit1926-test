# QuikTrack Workflows — Documentation

This folder documents the **Workflows** feature against the source spec
`Jira_Clone_Workflows_Epic.pdf` (stories WF-1 … WF-10), audited against the real
codebase on **2026-07-29**.

## Index

- [**00_CHECKLIST.md**](./00_CHECKLIST.md) — the master checklist. Every WF
  sub-task + a Jira-UI-parity section, each marked ✅ Done / 🟡 Partial / ❌ Missing,
  plus a prioritised "remaining work" rollup. **Start here.**

Per-story detail (goal · what's done · what's missing · how to test):

| Story | File | One-line status |
|-------|------|-----------------|
| WF-1 Data model | [WF-01_data_model.md](./WF-01_data_model.md) | ✅ mostly — status is per-project & category is a String, not a global enum |
| WF-2 Status catalog | [WF-02_status_catalog.md](./WF-02_status_catalog.md) | 🟡 per-project CRUD; no workflow-in-use delete guard, no needsCategoryReview |
| WF-3 Config API + validation | [WF-03_config_and_validation.md](./WF-03_config_and_validation.md) | 🟡 draft/publish + full graph validation; no per-transition REST endpoints |
| WF-4 Execution engine | [WF-04_execution_engine.md](./WF-04_execution_engine.md) | 🟡 pipeline wired everywhere; not wrapped in one DB transaction |
| WF-5 Conditions | [WF-05_conditions.md](./WF-05_conditions.md) | 🟡 registry + grouping done; `in_group` missing |
| WF-6 Validators | [WF-06_validators.md](./WF-06_validators.md) | 🟡 aggregation done; `field_regex` missing |
| WF-7 Post-functions + resolution | [WF-07_postfunctions_resolution.md](./WF-07_postfunctions_resolution.md) | 🟡 core effects done; no comment/event/stuck-report |
| WF-8 Schemes + migration | [WF-08_schemes_and_migration.md](./WF-08_schemes_and_migration.md) | ✅ scheme CRUD, resolver, and status migration all present |
| WF-9 Editor UI | [WF-09_editor_ui.md](./WF-09_editor_ui.md) | 🟡 diagram+text+publish; not Jira-parity (no click-edge/tabs/reorder/event) |
| WF-10 Testing | [WF-10_testing.md](./WF-10_testing.md) | 🟡 unit+API green; security (403/409) API tests missing |

## Key architecture facts (as built, may differ from the PDF)

- **Statuses are per-project**, not a global catalog (`QtIssueStatus.projectId`). Category is a
  **String** (`BACKLOG` / `IN_PROGRESS` / `DONE`), not a Prisma enum. The spec's `TODO` = our `BACKLOG`.
- **Rules live in ONE table** `QtWorkflowRule` with a `kind` discriminator (CONDITION / VALIDATOR /
  POSTFUNCTION), not three tables. Equivalent behaviour.
- **Workflows are edited as a DRAFT** stored on `QtWorkflowScheme.draftJson` (+ `hasDraft`), then
  materialised on **publish** — there are no per-transition REST endpoints; the whole graph is
  rebuilt in the publish transaction.
- **The rule engine is pure** (`lib/services/workflow/rules/engine.ts`, no DB). It computes a field
  **patch**; the API route applies it. ⚠️ The status write, patch, and audit-log write are currently
  **not** wrapped in a single DB transaction (see WF-4).
- **Two movers** both run the full pipeline: `PATCH /api/issues/[id]/move` and
  `PATCH /api/issues/[id]`. The board uses the latter.

## How to run the checks

```bash
cd apps/quiktrack
npm run typecheck
npx vitest run __tests__/unit/workflow-*.test.ts __tests__/api/workflow-*.test.ts __tests__/api/issue-*.test.ts
npm run lint
```
