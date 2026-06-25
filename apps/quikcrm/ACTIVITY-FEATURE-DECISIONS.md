# QuikCRM Activity-Logging Feature — Decision Log & Build Contract

> **Source of truth.** CC reads this fresh at the start of each session and does NOT rely on memory for anything here. When context is thin, stale, or inferred rather than confirmed, CC ASKS rather than asserting. Rishabh maintains this file in the repo; after each decision, CC supplies the exact append to paste.
>
> *Repo: quikit1926 · App: apps/quikcrm ONLY · Branch: activity_disposition_rishabh*
> *Last updated: 2026-06-23*

---

## What this feature is

A general, admin-configurable ACTIVITY-LOGGING system in apps/quikcrm. Admins create custom activity TYPES (Upwork Connect, LinkedIn DM, Pitch Call, etc.), each with admin-defined custom fields. Users log activities of those types, attached polymorphically to a lead/account/opportunity/contact. Purpose: management visibility — an RBAC-scoped admin dashboard + configurable digest emails of who did what.

**Relationship to disposition:** Disposition is the status/stage CHANGE that happens after enough activities move a lead. It is ONE special kind of activity. This feature is the GENERAL activity-logging that captures all the other work (emails, meetings, DMs) — plain activities that do NOT force a status change.

---

## SCOPE BOUNDARY (monorepo safety — non-negotiable)

- Work ONLY in `apps/quikcrm`. May READ shared `packages/` and `apps/auth`/`apps/admin` to understand shared infra it depends on.
- NEVER read, analyze, or touch the other product apps: quikhrms, quikinfra, quikit, quikscale, quiksocial, quiktrack, quikvc, _template. Other teams' code.
- The Prisma schema (`packages/database/prisma/schema.prisma`) is SHARED by all apps. Every new model/column is an all-apps-rebuild event. CRM models are `Crm*`-prefixed under the `app_quikcrm` schema namespace (additive, low blast radius), but every schema change is flagged and batched.

---

## LOCKED DECISIONS (do not re-litigate without explicit Rishabh sign-off)

1. **Storage = INDEXED key-value table, NOT JSON blob.** Activity custom-field values go in a dedicated `CrmActivityFieldValue` table with typed indexed columns (valueText / valueNumber / valueDate / valueBoolean, plus valueJson for MultiSelect — camelCase per the shipped schema/migration). Reason: the feature's PURPOSE is aggregation/filtering by custom-field value (dashboard + digests must count/sum/group-by). The lead/product JSON-blob pattern CANNOT do this without full scans. We are greenfield on activities, so indexed storage disturbs nothing; the lead/product JSON pattern stays untouched. **Resist any "match the existing lead/product JSON pattern" temptation — it would build a feature that cannot serve its own reporting purpose.**

2. **SMB is QUARANTINED, not absorbed.** The existing Log-Activity modal's three tabs (Generic / Lead-log / SMB) collapse into ONE dynamic type-driven surface — EXCEPT SMB. Generic + Lead-log are field-variation (absorbed cleanly; lead-score recalc already happens on lead-attached activities). SMB has a REAL side effect: a `$transaction` that writes country/followupPriority back to the parent lead — that is NOT field config. Keep `/api/activities/smb-outreach` (and its tab) as a LEGACY endpoint. Do NOT silently drop its write-back; do NOT try to absorb it into the new system in v1 (would require a "field→parent-column mapping" capability = out of scope).

3. **NO cascading/dependent fields (no `dependsOnKey`).** Ship FLAT Select fields. The only consumer of cascading options was SMB, which is quarantined — so building dependent-field infra now is speculative generality for a behavior we've decided not to bring in. If a REAL new activity type later needs cascades, add it then with an actual requirement. (Additive schema changes are cheap to add later; carrying unused complexity through the build is not.)

4. **Admin-gated config routes.** All activity-type / field-definition management routes use `requirePermission(user, "settings", "edit")` — NOT the looser `requireApiUser()` that the existing lead/product/disposition routes inherit. Admins configure types; users only log. The 403-without-settings:edit test LOCKS this.

5. **Migrations = real `prisma migrate`, NEVER `db push`.** In a shared-schema monorepo the migration is the source of truth for every app's DB. A `db push`'d-not-migrated column is exactly what nearly broke a UAT deploy on the CredFlow repo. Batch P1+P2 schema into ONE migration to pay the all-apps-rebuild once.

6. **No forced status change.** Plain activities record work; they do NOT mutate lead status/stage. (Disposition is the separate thing that does.)

### 2026-06-23 — Phase 1 sub-decisions locked

### 2026-06-23 — Phase 1 sub-decisions locked (7–11)

7. **No auto-seed of default activity types.** The config route does NOT seed a
   starter set (unlike the disposition route's `seedDefaultsIfEmpty`). Admins
   define their own types (Upwork Connect, LinkedIn DM, etc.). Empty-types UX is
   a Phase 3 concern (see Open Decisions).

8. **`FieldEditorModal` is ADAPTED via props, not forked.** Reuse the existing
   modal; pass props to hide the lead-specific `showInList` ("Show as column in
   leads list") and neutralize lead-only copy. Keep `showInList` repurposable —
   it may return in Phase 4 as a "show field as dashboard column" toggle. Do not
   create a near-duplicate component.

9. **Activity Types gets its OWN settings nav group** in `settings/layout.tsx`
   (`TAB_GROUPS` + `ALL_NAV_ITEMS`), not slotted into the Lead Pipeline or
   Products groups.

10. **Auth gating follows WORKING CODE, not the `withTenantAuth` CLAUDE.md rule.**
    New activity-type / field-definition routes use `requireApiUser()` +
    `requirePermission(user, "settings", <view|edit>)` — the pattern the settings
    module actually uses today (verified: company, teams, permission-templates,
    sales-groups, audit). The app `CLAUDE.md` "must use `withTenantAuth`" rule is
    treated as STALE relative to the settings module's real convention
    (`withTenantAuth` appears in only one route, `internal/provision-roles`).
    Tenant isolation is satisfied by stamping `orgId: user.orgId` on writes and
    filtering all reads by `orgId`. Do NOT retrofit `withTenantAuth` onto existing
    Quikit code; just keep matching this proven pattern in new routes.

11. **DB-verification debt (open until Phase-2 migration runs against a real DB).**
    `@@unique([orgId, code])` rejection (→ 409) and the field-definition
    `onDelete: Cascade` are proven ONLY at the mock/contract level so far (Prisma
    P2002 → 409 mapping; cascade declared in schema). There is no live Postgres in
    the dev checkout and the migration is deliberately deferred (batched with
    Phase 2's `CrmActivityFieldValue` into ONE real `prisma migrate`, never
    `db push`). The real DB-level proof of the unique constraint and the cascade
    lands when that batched migration is applied. Until then: contract-verified,
    not DB-verified.

    ### 2026-06-23 — P1 migration authored; first real-DB verification scheduled at the Phase-2 boundary

12. **P1 migration is hand-authored idempotent SQL** (not `prisma migrate dev`),
    matching the repo convention (QuikTrack custom-fields precedent: timestamped
    dir, CREATE TABLE/INDEX IF NOT EXISTS, app_<schema> qualification, FK to
    quikit."Org" with cascade, applied by hand — the build pipeline does not run
    `migrate deploy`). Same "follow the working code" principle as decision #10.
    File: packages/database/prisma/migrations/20260623120000_quikcrm_activity_types/migration.sql.
    Honors decision #5 (a real committed migration, NOT db push). The
    P1+P2-batch optimization (decision #5) is relaxed: P1 ships as its own
    migration; CrmActivityFieldValue (P2) is NOT pulled forward (not built/tested).

13. **First real-DB verification pass is scheduled at the PHASE-2 BOUNDARY,
    before Phase 3 starts.** Set up local Postgres, apply the P1 (and then P2)
    migration(s), and confirm against a real DB: the tables exist; the unique
    constraints actually reject duplicates (CrmActivityType.orgId+code,
    CrmActivityFieldDefinition.activityTypeId+key); the onDelete: Cascade
    actually removes field definitions when a type is deleted; and the write
    path works end-to-end. This CLOSES decision #11's mock/contract-level debt
    for P1. Do NOT let DB verification stretch to the end of the build — it
    happens at the P2 boundary, not later.

    **STATUS UPDATE (2026-06-23 — supersedes the "deferred/scheduled" framing in
    #5, #11, #13):** Foundation DB-verification is DONE. Both migrations —
    20260623120000_quikcrm_activity_types (P1) AND
    20260623130000_quikcrm_activity_field_values (P2) — were applied to a real
    local Postgres and verified live: all three tables exist; the unique
    constraint actually REJECTS a duplicate (CrmActivityType orgId+code, Postgres
    duplicate-key error); the onDelete: Cascade actually FIRES (delete type →
    field defs 1→0); the FK to quikit."Org" resolves. This CLOSES decision #11's
    mock/contract-level debt for the foundation (P1 + P2 schema).
    • Decision #5's "batch P1+P2 into ONE migration" was RELAXED — they shipped
      as TWO separate migrations (see #12); correctness rule (real migrate, never
      db push) was honored, only the batch optimization was dropped.
    • STILL DEFERRED to the Phase-3 CLOSE GATE (not done yet): browser
      render-verify of the UI + the end-to-end write path (activity + typed
      values persisting through the real app). Blocked by a corrupted dev-DB
      OAuth row (the quikcrm App is bound to a quikhrms/:3009 OAuthClient, so SSO
      login fails before a form renders). The close gate uses a FRESH clean DB
      (full migration history + clean seed + clean OAuth client), not a
      quikit_devs patch — see the Phase-3 close-gate plan.

---

## REUSE MAP (extend these — do NOT rebuild)

- **Activity model:** `CrmActivity` — polymorphic (relatedKind/relatedObjectId), `type` is a free string (new types need no migration). EXTEND.
- **Activity type config:** clone the `CrmCallDisposition` config-table pattern (real rows, per-org).
- **RBAC scope:** `buildActivityAclWhere(user)` ALREADY covers activities (own / in-scope / admin-org-wide). `buildRoleMetrics(user)` already counts activities per role. REUSE VERBATIM — do not rebuild RBAC.
- **Admin UI:** `FieldEditorModal` (apiBase-parameterized) + the call-dispositions split-pane / lead-fields page pattern. EXTEND (adapt lead-specific copy via props, don't fork).
- **Email/cron:** `sendTransactionalEmail` + `sendWithRetry` (shared) + Vercel-cron + CRON_SECRET + BullMQ. Digests clone the `tasks/daily` pattern.

---

## PHASES (foundation → visibility; each independently shippable)

1. **Activity TYPE config** — `CrmActivityType` + `CrmActivityFieldDefinition` models (🟥 shared schema), admin-gated CRUD routes, settings UI (own nav group). NO auto-seed; NO dependsOnKey.
2. **Indexed STORAGE** — `CrmActivityFieldValue` (🟥 shared schema, batched w/ P1), write-values service wired into `logActivity`.
3. **Logging UX** — unified type-picker → dynamic fields → log (reuse polymorphic create path + LogActivityModal). Handle empty-types state. NO status change.
4. **Dashboard** — extend `buildRoleMetrics` + `buildActivityAclWhere`, slice by type + custom-field value (Phase 2's indexed table pays off here). Reuse RBAC.
5. **Digests** — configurable frequency, per-admin RBAC-scoped, clone cron+email rails. (Verification tail is deploy-only: cron + real email only fire in deployed env — not a bug.)

---

## OPEN DECISIONS (flagged, not yet locked)

- **Phase 3 empty-types state: LOCKED — empty-state CTA, NOT seed-type fallback**
  (2026-06-23). A fresh/un-configured org's logging surface shows an empty-state
  ("No activity types configured — ask your admin") and NO type-picker. The
  logging flow stays purely type-driven: it lists ONLY real, isActive,
  admin-configured types — it does NOT synthesize built-in Note/Call/Email/
  Meeting/Task options. Rationale: consistency with decision #7 (no built-ins
  seeded at the config layer → none synthesized at the logging layer);
  synthesizing fieldless built-ins would need a separate non-activityTypeId
  code path and half-rebuild the old generic tab, blurring the feature's
  identity. If an org wants quick-note logging, an admin configures a "Note"
  type once. Bakes into T-P3.1 (endpoint returns only real types, empty list is
  valid), T-P3.2 (renderer handles only real field defs), T-P3.3 (empty list →
  CTA).
  
- **`showInList`:** hidden for now via prop (lead-specific), but kept repurposable for a possible Phase 4 "show field as dashboard column." (Decide at Phase 4.)

- **Phase 3 "Add Meeting" quick-log preset: RESOLVED (2026-06-23) — option 2 + label (a).**
  Decision: NO special Meeting handling. Configured types are logged via the
  type-picker like any other type (most #7-consistent — no type is special, the
  picker is the one path). Specifically:
    • Shell "Add Meeting" generic-preset wiring DROPPED from
      lead-dashboard-shell.tsx (onAddMeeting → setLogActivityPreset("Meeting"),
      logActivityPreset state, initialGenericType prop, GenericActivityType
      import all removed).
    • Palette "Add meeting" action KEPT (label + keywords unchanged, option-a)
      but repointed to OPEN the Activity logger — no Meeting preset, no
      magic-string type resolution.
    • Builder contract unchanged (build-lead-command-actions.ts onAddMeeting slot
      stays); ONLY the shell's onAddMeeting callback changes to the open-logger
      handler. No schema change.
    • Rejected: option 1 (shim — the two-path "half-rebuild the generic tab" blur
      we rejected for empty-types); magic-string `code==="meeting"` (fragile,
      Phone-by-label class of foot-gun); option 3 type-flag (over-scope for v1).
  command-palette.test.ts asserts the REAL post-repoint behavior ("Add meeting"
  present + runs the open-logger callback) — NO preset assertion. Unblocks
  T-P3.3b.


  - **FOLLOW-UP (P2, RESOLVED in T-P2.3):** `"Phone"` removed from the activity
  field-create route's Zod `FIELD_TYPES` enum in
  `apps/quikcrm/app/api/settings/activity-types/[id]/fields/route.ts`, so the
  admin UI can no longer create a Phone activity field (posting one → 400,
  test-locked). Phone is excluded in v1 (no use case; would couple the lead
  phone-object shape and is un-queryable by the per-value indexes). The
  reachable `writeActivityFieldValues` Phone rejection is a typed 400
  (ActivityFieldValidationError); the `routeToColumn` Phone branch is now an
  unreachable plain-Error exhaustiveness backstop. The live failure path
  (Phone field bricking a whole type) is closed.

  ### 2026-06-23 — Close-gate findings (recorded; both OWED to integration team / future session)

- **FINDING (a) — Migration history is NOT greenfield-applicable. ESCALATE to
  integration team.** `npm run db:migrate:deploy` against a FRESH empty DB
  (quikcrm_closegate) fails at migration `20260417134430_add_app_module_flags`:
  it FK-references `quikit."App"`, but no prior migration creates `App`. `App`
  (and the `quikit`/`app_*` multi-schema base) is created later
  (`20260502183000_v4_auth_quikit_schemas`) and/or out-of-band
  (`packages/database/migrations/move-to-multischema.sql` + prod-sync scripts).
  So the Prisma migration folder is an INCREMENTAL history that assumes a
  pre-provisioned base — it cannot build a DB from zero. `quikit_devs` only
  works because the real pipeline provisioned that base separately (consistent
  with the 3 unknown migrations seen on quikit_devs earlier). This is a real
  shared-`packages/` defect affecting anyone onboarding a fresh dev DB or new
  environment — NOT this feature's code, NOT ours to fix. Owner: integration
  team. They owe a from-zero provisioning path or a known-good base dump.

### 2026-06-24 — Close-gate UPDATE: c-3/c-4 DB-verified; c-1/c-2 still owed

- **c-3 + c-4 VERIFIED against real Postgres (quikit_devs).** Via the actual
  POST /api/activities route handler with ONLY getServerSession stubbed (real
  prisma, real logActivity, real writeActivityFieldValues, real route
  $transaction), run under a throwaway no-setup vitest config with two
  unfakeable pre-flight proofs (current_database()='quikit_devs' +
  closegate_org exact slug):
    • c-3: typed values landed in the right indexed columns — bid→valueNumber=250,
      notes→valueText='…', non-target columns null. Decision #1 proven on a live DB.
    • c-4: the REAL create-path $transaction rolls back ATOMICALLY. A mid-loop
      fault (thrown after the 1st value insert, before the 2nd, inside the real
      route's prisma.$transaction) left NEITHER the activity NOR the
      already-written value row — outcome A, the partial-write case the mocked
      $transaction in T-P2.3 could never prove. POST returned 500 with the
      injected fault (right-reason guard), beforeCount=0, survivingValues=[].
  HONEST SCOPE: route-handler invocation with stubbed session — HTTP/middleware/
  auth NOT exercised (auth covered by route unit tests). Throwaway fault was
  reverted (write-field-values.ts clean, T-P2.2 re-run green); throwaway test
  files + config deleted; .env.local restored; login/page.tsx never modified.

- **STILL OWED: c-1/c-2 (browser render of admin UI + logging UX).** Remain
  jsdom-verified only. The local credentials-login path needed to reach them in
  a browser is blocked: login/page.tsx hard-codes signIn("quikit") (would need a
  committed-code edit we declined), and the user's account resolves to MoreYeahs
  as 'member' (non-admin) with no quikcrm app-access. Real browser pass owed once
  the integration team provides a from-zero provisioning path / known-good base
  dump (finding a) AND an admin-capable login. NOT "close gate complete."

### Phase 5 digest — tasks-slice framing (Dev question) + activity sections are the core

**Locked 2026-06-24. Read-only investigation; no build.**

**Structure decision — the digest CORE is the activity "who did what" data; the
tasks slice is a SEPARABLE add-on, not on the critical path.**

- **CORE (proceeds now, blocked by nothing):** the activity sections — by-rep
  activity counts, by-type counts, per-rep custom-field aggregates. All
  retrospective, all already built (FR-4.2 `activitiesByType`, FR-4.3
  `getActivityFieldAggregates`), all queryable today from `CrmActivity` /
  `CrmActivityFieldValue`. The digest's stated purpose ("management visibility —
  who did what", decision-log line 12) IS this data. It does NOT depend on
  `CrmTask` completion at all.

- **TASKS SLICE (separable, Dev-gated, NOT a blocker):** whether the digest's
  task section should be retrospective ("tasks COMPLETED today") or forward
  ("tasks DUE / overdue") is a Dev/Minal requirement question — NOT knowable from
  code or this decision-log. It does not block the core; design/build the
  activity sections without it.

**`completedAt` gap resolution (the three options, ranked on CORRECTNESS for a
leadership-facing number):**
  - **A — `updatedAt` proxy: REJECTED.** `CrmTask.updatedAt` is `@updatedAt`
    (auto-bumps on ANY write). A task completed last week but edited today would
    count as "completed today" → a silently-wrong leadership metric. Do not ship.
  - **B — add a `completedAt` column: DEFERRED, Dev-gated.** Correct, but it's a
    🟥 shared-schema migration (integration-owner + hand-authored migration, same
    heavy path as the deferred `activityTypeId`) AND has a backfill gap (existing
    `Completed` rows have no `completedAt` → "completed today" under-counts until
    new completions accrue). Only earns its weight if Dev confirms leadership
    wants backward-looking completion.
  - **C — reframe to "due today / open / overdue": the DEFAULT-WHEN-BUILT.**
    Fully queryable now via `dueDate` + `status`, no schema change, no proxy, no
    backfill gap. DECISIVE evidence it's the established pattern: the deployed
    `tasks/daily` cron is ENTIRELY forward-looking — it filters
    `status notIn [Completed,Cancelled]` + `dueDate` windows and NEVER queries
    `status = Completed`. C extends the shipped convention; A/B invent a
    backward-looking notion the codebase has never had.

**Net: C is the sensible default IF/WHEN the tasks slice is built; B is a flagged
deferred enhancement gated on a Dev answer; A is rejected. Neither blocks the
activity-section core, which proceeds now.**

**Open Dev question (put to Dev, do not guess):** "For the daily digest's task
section, does leadership want 'tasks COMPLETED today' (retrospective) or 'tasks
DUE / overdue' (forward)? The activity 'who did what' data is retrospective
either way; this is only about the task slice. Forward-looking is buildable now
and matches the existing task reminders; 'completed today' needs a new schema
column with no history for existing tasks."

### Phase 5 digest — window-param: the ONE non-free part (net-new, re-touches shared functions)

**Locked 2026-06-24 (planning). Window approach = (i) optional range param.**

The digest's "yesterday" window is NET-NEW work — NOT free reuse. Verified by
reading signatures: buildRoleMetrics(user) and getActivityFieldAggregates(user,…)
take NO date param; both produce ALL-TIME org-scoped counts. The dashboard's
from/to range drives a DIFFERENT service (executive-metrics.ts, takes DateRange);
the RoleKpiGrid cards are intentionally all-time. So a daily digest cannot reuse
these as-is (would email all-time totals every day).

DECISION: approach (i) — add an OPTIONAL `range` param to BOTH services
(omitted = current all-time behavior; passed = windowed via occurredAt). Chosen
over (ii) digest-local windowed queries because (ii) duplicates the scope logic
→ two scope implementations that can drift + FR-4.3's leak-safety re-proven for
the copy. (i) keeps ONE scope implementation and its proven leak-safety; additive.

BUILD-TIME OBLIGATIONS (this is a shared-function edit — buildRoleMetrics +
getActivityFieldAggregates are pinned by FR-4.1/4.2/4.3/4.4; the standing gate
applies IN FULL):
  - Grep all tests exercising both functions; run the WHOLE dashboard suite.
  - PROVE "omitted range = identical where-clause" by FR-4.1/4.2 staying green
    (the empty-range path must produce the EXACT same where — this is the
    regression check that caught two prior shared-function regressions).
  - FR-4.3's $queryRaw gains a NEW parameterized clause (occurredAt BETWEEN in
    the WHERE). A mock can pin "range passed" but CANNOT prove the windowed raw
    query still scopes correctly. So the FR-4.3-style real-DB EXCLUSION gate is
    RE-RUN with a date dimension: rep-in/rep-out × in-window/out-of-window,
    asserting BOTH the out-of-scope rep AND the out-of-window activity are
    excluded.
  - VERIFICATION-PATH FLAG: that real-DB windowed gate does NOT need the login
    fix — it runs via the SAME seed-direct closegate harness that verified
    c-3/c-4 (throwaway no-setup vitest config, seeds quikit_devs directly,
    getServerSession stubbed, two pre-flight proofs). It is RUNNABLE AT BUILD
    TIME. Distinct from the "real type configured via the UI → digest meets live
    data" milestone, which DOES need login and stays in the c-1/c-2/FR-4.5 owed
    cluster.

This window-param edit is a BUILD UNIT with its own RED→GREEN + real-DB gate, not
a planning detail.

### Phase 5 digest — CONFIG write is admin-gated (requirement; no endpoint yet)

Registered 2026-06-24. REQUIREMENT on the future config surface — NOT built now,
noted so the gate is real when the endpoint lands (don't build a gate with nothing
to guard).

- CONFIGURING / enabling the digest (writing settings.digest on
  CrmOrgWorkspaceSettings) is ADMINISTRATOR-ONLY. When a config endpoint/UI is
  built, its WRITE path MUST be admin-permission-gated — assertModule(user,
  "settings", <action>) (or the equivalent requirePermission), the same gate as
  other org-workspace-settings writes.
- RECEIVING the digest is NOT admin-only. Recipients span leadership roles
  (Administrator + SalesManager) — e.g. Akhilesh = Administrator, Sanyukta =
  SalesManager — resolved via the recipientRoles / (pending) recipientUserIds
  allow-list, NOT via a single admin gate.
- CURRENT STATE: no config endpoint exists. Enablement is a direct pgAdmin write
  to settings.digest (Rishabh). So the admin gate becomes REAL only when the
  config endpoint/UI is built; until then there is no write path to guard.

### Phase 5 digest — allow-list: named-user-with-no-role silently skipped (v1)

Registered 2026-06-24 (commit e13ffb8f). SILENT-MISS class — same family as the
override-granted-leaders gap and the dead-team-tables gap; logged so it's a known
deferral, not a forgotten one.

listDigestRecipients resolves each recipient's REAL role from their CrmUserAppRole
row (needed for correct per-recipient scoping). CONSEQUENCE: a userId named in the
recipientUserIds allow-list but with NO resolvable CrmUserAppRole row is SILENTLY
SKIPPED — no error, no log — because we can't scope them safely. Akhilesh
(cmpgz28om002k96601zs3vn8e, Administrator) + Sanyukta (cmpgz25ju000896609m1gfxg1,
SalesManager) BOTH resolve (confirmed by read-only lookup), so the target case is
fine. Documented so a future "added to the list but not receiving the digest" has
a ready explanation: check the user has a CrmUserAppRole row in that org.




---

## WORKING DISCIPLINE (from the CredFlow build — these prevented real failures)

- **Failing-test-first:** RED test → Rishabh approves the red → build → verify → commit. One unit per commit.
- **Honest test labeling:** never dress a green contract-lock as RED; never claim "browser-verified by Rishabh" unless he actually did it; never invent a test seam. If the only RED is a compile/type error, say so.
- **Browser/DB is ground truth.** Code-reads have been wrong repeatedly. "It renders / it's reused / it's the right field" is an assumption until the screen or the DB row confirms it. Verify, don't infer.
- **Re-verify branch before every write.** Confirm `activity_disposition_rishabh`.
- **No push / no deploy without explicit Rishabh go-ahead.**
- **When context is thin or a fact is inferred, ASK — don't assert.** Tag confidence honestly.


## 2026-06-25 — Daily-Digest Recipient Feature + SMTP (Phase 5) — CONSOLIDATED

Admin-configurable digest recipients (Settings→Users toggle) + real SMTP delivery.
Built as 5 staged commits on `activity_disposition_rishabh`. Decisions below are
LOCKED — do not re-litigate.

### LOCKED DECISIONS

1. **Role source = `mapRole(UserAppAccess.role ?? OrgMember.role)`** — NOT raw
   membership (can't distinguish SalesManager from SalesUser), NOT CrmUserAppRole
   (the empty table that caused the silent-skip). The override fires only when the
   per-app UserAppAccess role is set AND ≠ "member". Extracted to ONE shared
   resolver `lib/auth/role-resolution.ts` (`mapRole` + `resolveCrmRole`); used by
   readSession (request-time session.role), the Settings→Users eligibility DTO,
   AND digest-run send-time resolution — so UI-eligible ⟺ send-time-eligible by
   construction. Verified vs live DB: Ashwin org_admin→Administrator,
   Akhilesh UserAppAccess admin→Administrator, Sanyukta sales-manager→SalesManager.

2. **Eligibility (`isDigestEligible`):** Administrator → eligible (org-wide scope);
   SalesManager who OWNS ≥1 group in the org → eligible (team scope); SalesManager
   with no group → ineligible "no-team"; all other roles → "not-eligible-role".
   The SalesManager group lookup MIRRORS resolveManagerTeam EXACTLY (same
   crmSalesGroupManager query + org-via-join filter group.orgId===user.orgId) so
   eligibility ⟺ a resolvable team (no "eligible but empty digest" gap). No
   CrmUserAppRole dependency.

3. **Auto-flip `enabled` BOTH directions** (setDigestRecipient): first recipient
   toggled on → enabled=true; last recipient toggled off → enabled=false
   (enabled = recipientUserIds.length > 0 after the toggle). Kills both footguns:
   recipients-but-disabled (silent nothing) AND enabled-but-empty (the
   digestCount:0 state). Makes "enabled + empty" unreachable.

4. **Eligibility asymmetry:** gates ADDING (toggle-on → 400 if target ineligible —
   eligibility checked on the TARGET, not the acting admin), NEVER REMOVING
   (toggle-off bypasses eligibility — cleanup must always be allowed, e.g. a
   SalesManager who lost their team must be removable, not stuck).

5. **recipientRoles fallback DELETED.** The UI owns settings.digest.recipientUserIds
   (REPLACE semantics); empty allow-list → nobody. The Stage-1 "empty → fall back to
   recipientRoles" plumbing default is gone — auto-flip makes enabled+empty
   unreachable, so there is no fallback case. (Earlier manual pgAdmin
   recipientUserIds entry is now just the UI's initial state; one source of truth.)

6. **Silent-skip ROOT FIX.** CrmUserAppRole removed from recipient resolution
   entirely (it was empty for Akhilesh/Sanyukta → both dropped → digestCount:0).
   `resolveDigestRecipients(orgId, recipientUserIds)` resolves each via
   OrgMember + appId-scoped UserAppAccess → resolveCrmRole → isDigestEligible, with
   a SEND-TIME eligibility re-check (drops anyone no longer eligible).
   listActiveDigestOrgs now sourced from digest-config presence
   (CrmOrgWorkspaceSettings settings.digest key), not CrmUserAppRole; digest-run
   still gates on getDigestConfig(org).enabled. Admin-gated write =
   requirePermission(user,"settings","edit").

7. **SMTP delivery.** sendTransactionalEmail gained an SMTP driver mirroring the
   proven send-report.ts nodemailer transport; dispatch precedence
   smtp → resend → console; SMTP selected when SMTP_HOST+USER+PASS are set, sending
   AS SMTP_FROM = support@quikit.ai (Office365). ALL callers route through it (digest,
   notifications, user invites, quote send) with zero caller change. A-FIX:
   buildScopeSql in activity-field-aggregates uses `user.role === "Administrator"`
   instead of getScope() — removed the dead CrmTeamManager (unshipped table)
   $queryRaw call (swallowed-but-noisy 42P01) from the digest scope path; mirrors
   getScope's own ADMIN_ROLES check, behavior-preserving (FR-4.1/4.2/4.3 untouched).

### COMMITS (5 recipient stages)
- 8e38d549 — Stage 2a: shared CRM role resolver (role-resolution.ts; require.ts re-import)
- a9479448 — Stage 1+2b: eligibility helper + Settings→Users digest DTO
- b554a6c8 — Stage 3: admin-gated digest-recipient toggle API + setDigestRecipient (auto-flip)
- dc6eb70b — Stage 4: Daily Digest toggle column (UI; jsdom-verified, browser-owed)
- deec15b6 — Stage 5: digest recipients via role+eligibility, drop CrmUserAppRole
(SMTP + A-fix: 6422415e. Settings-nav entry: bb7c9d91.)

### OWED (do NOT forget)
- **E2E verification (browser + SMTP):** toggle Akhilesh+Sanyukta ON in Settings→Users
  → PATCH persists; trigger GET/POST /api/notifications/digest/daily (+CRON_SECRET)
  → expect digestCount:2 → real SMTP send as support@quikit.ai. Data prereqs are set
  (Akhilesh=Admin, Sanyukta=SalesManager+owns group cmqt5ivyj…+Ashwin is a member).
  Discharges the Stage-4 browser-owed debt + Stage-5 + SMTP send in one pass.
- **vercel.json cron entry** — NOT added (deployed-fire bit, held for approval). The
  digest does not run on a schedule until this lands.
- **GO-LIVE coupling invariant** — wiring the built+verified window param into
  digest-run (yesterday's range) AND removing the DEMO banner must happen TOGETHER.
  Removing the banner alone makes §1/§2/§3 silently all-time under real headings.
- **§4 tasks section** — LOUD "not built" placeholder; tasks data is its own unit,
  and the completed-vs-due/overdue framing is the open Dev question.
- **Pre-existing 31-test branch cluster** — auth/permissions/api (account-acl,
  middleware-integration, delta-pill, etc.) fail on this branch independent of Phase 5
  (proven by baseline stash). TRIAGE before any merge to a shared branch.
- **Vitest harness gap** — @quikit/shared/sso-domain-server subpath export isn't
  resolved by the broad @quikit/shared alias in vitest.config.ts (mocked in-test).
  Real fix = one-line subpath alias; file for the vitest-config owner.
- **Redis fast-fail config (shared infra)** — @quikit/redis lacks connectTimeout +
  enableOfflineQueue:false, so a dead REDIS_URL blocks the session-check path (admin
  slowness) instead of failing fast. packages/redis change, integration-owned.

### 2026-06-25 — Org admin missing from QuikCRM users list — INVESTIGATED, NOT a bug (no fix)

Ashwin (org_admin) was missing from Settings→Users. Compared QuikCRM's listUsers
against quiktrack's /api/org/users (read-only investigation of quiktrack; nothing
touched there).

BOTH apps gate the users list on a per-app UserAppAccess row, by design:
- QuikCRM:  orgMember where user.appAccess.some{ appId, orgId }  (users.service.ts)
- quiktrack: userAppAccess.findMany{ orgId, appId } → orgMember where userId IN [ids]
  (app/api/org/users/route.ts GET)
Same convention, two implementations. Both EXCLUDE a membership-only org admin
(OrgMember.role=org_admin but no UserAppAccess row for that app).

This is INTENTIONAL: per-app provisioning means an org-level admin is NOT
implicitly an admin/user of every app — you appear in an app's user list only
once granted that app's UserAppAccess row. The other apps where Ashwin showed up
simply had his UserAppAccess row provisioned.

RESOLUTION = grant the UserAppAccess row (done for Ashwin via Statement-1:
quikit."UserAppAccess" role=admin for the quikcrm appId), NOT change the filter.
Changing QuikCRM's filter to union in membership-only admins would DIVERGE from
quiktrack's convention. Any "org admins auto-visible across all apps" want is a
PLATFORM-TEAM concern (org-admin auto-provisioning of per-app UserAppAccess rows),
not a quikcrm-local change.

NO CODE CHANGE WARRANTED. quiktrack read-only (untouched); quikcrm unchanged.


---

## How this file is maintained

1. Lives in the repo; CC reads it fresh each session.
2. After each decision, CC supplies the EXACT append (dated) for Rishabh to paste.
3. When CC's context is thin or an answer isn't here, CC ASKS rather than reconstructing from memory.