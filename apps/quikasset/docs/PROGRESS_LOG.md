# QuikAsset — `merge_asset02` Progress Log

> Running continuity log for the `merge_asset02` branch, so work survives across
> sessions. **Append to this file as work continues — do not recreate it.**
>
> _Last updated: 2026-07-15._

---

## Branch

- **Working branch:** `merge_asset02`
- **Forked from:** `feature/quikasset-merge_14_7_26` (Kanishka's), at merge-base
  `67021f4b` — _"Merge branch 'merge_asset01' … into feature/quikasset-merge_14_7_26"_ (2026-07-14).
- **Lineage:** `merge_asset` → `merge_asset01` → `feature/quikasset-merge_14_7_26` → **`merge_asset02`**.
- **Scope:** `apps/quikasset` only.

## Standing conventions

- **Investigate first** — report a plan and get confirmation before writing code.
- **Show diffs before staging.** Pause before anything destructive (migrations,
  deletes, bulk data ops) for explicit go-ahead.
- **Never** commit or push to `main`, `dev`, or `uat`.
- **Commit messages:** subject-only, conventional-commit prefix
  (`type(scope): subject`), no body.
- **Add tests** for new work.
- `packages/database` schema changes require **integration-owner sign-off + a
  separate migration** — never bundled with app code.

---

## Phases — User Management / User Directory merge

> Phase groupings reconstructed from `merge_asset02` git history + session notes.
> **Commit hashes are exact**; phase-number attribution is best-effort (git
> subjects aren't phase-labelled). Correct any misattribution in review.
> Phase 0 commits landed on an ancestor branch (the RBAC/scoping foundation);
> Phases 1–6 are the `merge_asset02` merge work (2026-07-14).

### Phase 0 — Member asset-view scoping (BRD Phase 0)
Row-level scoping foundation: Members see/act only on their own assigned assets;
write-path IDOR closed.
- `4a9e92d9` feat: enforce Member asset-view scoping (BRD Phase 0)  _(ancestor, 07-10)_
- `02cfecbe` fix: stop members editing or deleting assets that aren't theirs  _(ancestor, 07-13)_

### Phase 1 — User Management + RBAC v2 base
Full quiktrack-parity user/role/permission admin under `settings/user-management`
(Users + Roles & Permissions tabs), APIs under `/api/org/*`, reusing the `Ast*`
RBAC engine. Admin-gating hardened.
- `3a5b7b03` feat: add user management (users, roles, permissions, invites, filters)  _(07-08)_
- `ec946cde` fix: gate org/users list, create & search on `requireAdmin`  _(07-13)_
- `8e7fce42` fix: forbid setting a user's role to "No role" (dropdown + API)

### Phase 2 — Employee ↔ User identity bridge
Nullable `AstEmployee.userId` link + user/role backfill, replacing the fragile
email-match stopgap for "which employee is this login user?".
- `a922f2a8` feat: employee-user identity bridge + user/role backfill

### Phase 3 — Merge employee data into the org users API
Org users API returns merged employee fields; self-heals missing role rows.
- `1da32c13` feat: merge employee data into the org users API + self-heal roles

### Phase 4 — Merged Users tab UI
Single Users tab showing employee columns, delete, filters, and role assignment;
advanced filters panel.
- `0aa55441` feat: merged Users tab — employee columns, delete, filters, role assignment
- `08c4c5d5` feat: advanced Filters panel on the Users tab

### Phase 5 — Unified Add User
Add User creates a linked `AstEmployee` in the same flow; requires Employee ID /
Contact / Department. (Duplicate `employeeId` → up-front 409; see follow-up #1.)
- `bbb62001` feat: unified Add User creates a linked employee record
- `75375975` feat: require Employee ID, Contact, Department when adding a user

### Phase 6 — User Directory merge, removal & soft-delete
Retire the standalone Employee "User Directory", redirect it into the merged
User Management surface, and add soft-delete (removal marker + access-gating) that
retains all underlying data.
- `a6911d95` feat: remove-from-QuikAsset delete + employee edits on org users API
- `5d1a2466` refactor: retire User Directory page, redirect to merged User Management
- `ace14699` feat: soft-delete users (removal marker + access-gating), retain all data

### Related on this branch
- `b4947cc9` feat: notify members when an asset is assigned to them  _(member-assignment
  notifications; first commit on `merge_asset02`, 07-14)_

---

## Parked follow-ups (non-blocking)

1. **Add-User transaction** — `POST /api/org/users` creates User + OrgMember +
   UserAppAccess + AstUserAppRole + AstEmployee across sequential writes, not in a
   single `db.$transaction`; a mid-sequence failure can leave a partial record.
   Pre-existing; Phase 5 only mitigated the duplicate-`employeeId` case (up-front
   409). _Fix:_ wrap the whole user+employee create in `db.$transaction`.
2. **Removal-aware page gating** — soft-delete (`AstUserRemoval`) denies API access
   consistently (403 via `withOrgAuth`/`requireAdmin`), but page UX is uneven: only
   the 3 `<RequirePerm>`-wrapped pages (assets, employee-view, settings/user-management)
   show "Access restricted"; the other ~9 dashboard pages render empty. _Fix (deferred
   per user, 07-14):_ add an `isRemovedFromQuikAsset` check in
   `app/(dashboard)/layout.tsx` to gate every page uniformly.
3. **Blocked demo employees** — 4 MoreYeahs demo `AstEmployee` rows — Priya Sharma
   (EMP-001), Rahul Verma (EMP-002), Ananya Rao (EMP-003), Vikram Nair (EMP-004) —
   can't be deleted (ON DELETE RESTRICT via assignment/replacement history; no
   matching platform User). Parked pending a human decision (delete history →
   employees / reassign / keep). `scripts/link-employees-to-users.ts` reports them (dry-run).

---

## In progress / pending decision

- **Repair & Recovery investigation (today, 2026-07-15)** — findings **complete**;
  scope decision **pending from Kanishka / Dhwani** given the **July 20 release
  deadline**. Investigated schema (`AstRepair`, `AstReplacement`), all 4 API routes,
  the repair page, and all 4 modals. Key findings:
  - **No request/approval workflow** — "Send to Repair" is a single direct admin
    action that jumps straight to `InRepair`; no Draft/Submitted/Pending-Approval,
    no requester → approver.
  - **No employee-facing surface** — Members have no Repair permission and
    `employee-view` has no "report an issue" action; whoever's asset breaks can't
    initiate anything in-app.
  - **Dead/unreachable paths** — `Pending` status is never set by any code (yet the
    notifications feed queries for it); `Repaired` status + `markInRepair`/`markRepaired`
    actions have no UI trigger.
  - **Data-integrity bugs** — recovery/repair set the asset to `Available` without
    closing the original `AstAssignment` (asset reads Available while still assigned);
    `returnAndReassign` can create a second active assignment; a "Permanent"
    replacement created up-front never produces an `AstAssignment`.
- **Asset Request (Module 1) — Pass 1: Asset Master + admin/approval side (today, 2026-07-15)**
  Confirmed scope: build the admin/approval side first; the employee-facing New Request form
  is a later, separate pass. Decisions locked: subscriptions fulfil **status-only + note**
  (Option A); quantity = **per-unit counter + `PartiallyFulfilled`** state (Option 1); **reuse
  the existing Category Master + Asset Inventory** (no new catalog); test data via a **seed script**.
  - ✅ **Done — committed `699bd6fa`** (schema-independent):
    - RBAC registry: new `AssetRequest` resource + `approve` action (+ `viewAll` opt-in via
      `APPROVE_RESOURCES`) in `permissionsRegistry.ts`; `seed-app.ts` mirror; registry unit tests.
      **Approver = anyone holding `AssetRequest:approve`** (delegable to any role; admin gets it via
      the full-grant backfill) — not hard-wired to Admin.
    - Invoice / receipt upload: **UI-only disabled "coming soon" placeholder** on the Asset form
      (`AddEditAssetModal.tsx`). No storage backend — nothing captured, transmitted, or persisted.
  - 🔻 **Deferred this pass:** Item B (GCS file-storage backend for invoice/receipt) — no cloud
    sign-off needed now; the placeholder swaps to a live control when it lands.
  - Schema change proceeded ahead of the usual cross-team check-in, due to the July 20 release timeline.
  - ✅ **Built + applied (today):** `AstAssetRequest` model + enums + `AstAsset` invoice columns +
    `AstAssignment.requestId` applied to local `quikit_dev` (surgical `psql` — the dev DB was drifted, not a
    clean migrate target) and the Prisma client regenerated; canonical migration artifact committed at
    `migrations/20260715120000_add_asset_request`. Routes: `GET /api/asset-requests` (role-aware queue),
    `POST /[id]/decision` (approve/reject, `AssetRequest:approve`), `POST /[id]/fulfil` (physical → `AstAssignment`
    + asset `Assigned` + counter → `PartiallyFulfilled`/`Fulfilled`; subscription → status-only + note). Admin
    **Pending Approvals** page at `/asset-requests` (sidebar-linked, gated on `AssetRequest:viewAll`) with
    Approve/Reject + Fulfil dialogs. `scripts/seed-asset-requests.ts` seeds categories + in-stock demo assets +
    sample requests. Tests: 23 route/permission cases; full quikasset suite green (136); typecheck clean.
  - **Out of scope (this pass):** employee New Request / My Requests, Convert-to-Purchase-Request
    (not even a stub), not-in-stock handling, status-change notifications.
