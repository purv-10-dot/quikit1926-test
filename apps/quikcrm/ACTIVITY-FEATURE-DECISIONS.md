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

- **Phase 3 "Add Meeting" quick-log preset: OPEN — blocks T-P3.3b (modal collapse).**
  Hard-gate grep (2026-06-23) of all 9 LogActivityModal call sites found ONE
  dependence on the Generic tab: `lead-dashboard-shell.tsx` "Add Meeting" quick
  action passes `initialGenericType="Meeting"` to pre-set a Generic activity.
  (No caller forces a tab; no other caller passes initialGenericType; no SMB
  forcing.) Collapsing Generic+Lead-log into the type-driven tab breaks this
  preset unless handled. Decision needed BEFORE removing any tab JSX:
    1. Keep a thin preset path for initialGenericType — preserves "Add Meeting"
       UX, least disruption; collapse = "Generic+Lead-log tabs → type-driven tab
       + a preset shim" (not total removal). [CC lean]
    2. Map the preset → a configured "Meeting" type if one exists, else the
       empty-state/CTA — purest, but a fresh org's "Add Meeting" leads to "ask
       your admin," which is odd for a built-in quick action.
    3. Drop the "Add Meeting" preset entirely — cleanest code, but REMOVES an
       existing user-facing feature (a product call, not just a refactor).
  Rishabh's product call; recording it here only stops it being lost — it does
  NOT resolve it. T-P3.3a (the per-type-fields endpoint) is independent and
  proceeds; T-P3.3b (modal wiring) is gated on this.

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

---

## WORKING DISCIPLINE (from the CredFlow build — these prevented real failures)

- **Failing-test-first:** RED test → Rishabh approves the red → build → verify → commit. One unit per commit.
- **Honest test labeling:** never dress a green contract-lock as RED; never claim "browser-verified by Rishabh" unless he actually did it; never invent a test seam. If the only RED is a compile/type error, say so.
- **Browser/DB is ground truth.** Code-reads have been wrong repeatedly. "It renders / it's reused / it's the right field" is an assumption until the screen or the DB row confirms it. Verify, don't infer.
- **Re-verify branch before every write.** Confirm `activity_disposition_rishabh`.
- **No push / no deploy without explicit Rishabh go-ahead.**
- **When context is thin or a fact is inferred, ASK — don't assert.** Tag confidence honestly.

---

## How this file is maintained

1. Lives in the repo; CC reads it fresh each session.
2. After each decision, CC supplies the EXACT append (dated) for Rishabh to paste.
3. When CC's context is thin or an answer isn't here, CC ASKS rather than reconstructing from memory.