# QuikScale — RBAC, Permissions, Module Architecture & Data Visibility

**Author:** Rohit / Alok's Claude (compiled from codebase as of 2026-05-25, branch `features/quikscale-merge`)
**Audience:** Suyash / AI Runtime team
**Repo root:** `c:\Quikit\QuikIT` (QuikIT monorepo)
**Scope of this doc:** The QuikScale app only (`apps/quikscale/`). Platform-level concerns (auth service, OAuth, super-admin) covered only where they intersect with QuikScale.

> **Honesty note:** This report describes the **actual code shipped today**, not the planned end state. Where something is partially built, stubbed, or actively wrong-by-design, it is called out explicitly. See §8 for the consolidated gap list.

---

## SECTION 1 — RBAC: Roles & Access Control

### 1.1 Roles that exist

QuikScale has **two parallel role systems that are NOT auto-synced.** Both are live in prod.

#### A. Legacy `OrgMember.role` (string column)

Stored as a free-form string on [`OrgMember.role`](../../packages/database/prisma/schema.prisma). The codebase uses the `ROLE_HIERARCHY` map from `@quikit/shared` (admin tier ≥ 5).

Values observed in code: `"super_admin"`, `"org_admin"`, `"admin"`, `"manager"`, `"team_head"`, `"member"`.

**Today, in QuikScale specifically, new users are always created with `OrgMember.role = "member"`.** The legacy field is kept only so the `requireAdmin` dual-check still has a fast path for the (rare) user who is admin under the legacy field.

#### B. Dynamic Roles v2 (live, primary)

5 Prisma models in schema `app_quikscale`:

| Model | Purpose |
|---|---|
| `AppRole` | A named role, scoped to `(orgId, appId)`. `isSystem=true` for the seeded `admin` role; `isDefault=true` for the role new invitees join automatically. |
| `UserAppRole` | Many-to-many join: a user can hold multiple roles per org. Effective permissions = UNION of all roles + extras. |
| `RolePermission` | `(roleId, resource, action)` grants. Resources are dot-namespaced strings (e.g. `OPSP.History.EditFinalize`). |
| `RoleNavigation` | `(roleId, navKey)` sidebar whitelist. |
| `UserPermissionExtra` | Per-user additive grants. Can ONLY add — cannot subtract a role grant. |

**Custom roles per org:** YES. An org admin can create any number of `AppRole` rows via [`/api/org/roles`](../app/api/org/roles/route.ts).

**Hierarchical?** No. Permissions are flat sets — there is no inheritance between roles. The seeded `admin` role has every permission granted explicitly via `RolePermission` rows, not via a bypass.

**Seeded roles (per org, on first `/api/me/permissions` hit):**

- `admin` — `isSystem=true`. Gets every `(resource, action)` pair from the registry **except** `OPSP.History.EditFinalize:update` (intentionally opt-in destructive).
- `Member` — `isSystem=false, isDefault=true`. Gets `Dashboard:view` + full CRUD on `KPI`, `TeamKPI`, `Priority`, `WWW`. **Performance, OPSP, Org Setup, Client Meetings, Analytics are NOT granted by default — Members see nothing in those modules unless an admin adds the permission.**

#### CRUD matrix (default seeded roles)

| Module / Resource | admin (seeded) | Member (seeded) |
|---|---|---|
| `Dashboard` | view | view |
| `KPI`, `TeamKPI` | view/create/update/delete | view/create/update/delete |
| `Priority`, `WWW` | view/create/update/delete | view/create/update/delete |
| `OPSP.Create`, `OPSP.History`, `OPSP.Review`, `OPSP.Categories` | view/create/update/delete | ❌ none |
| `OPSP.History.EditFinalize:update` | ❌ excluded by default | ❌ none |
| `Team`, `User`, `Quarter` (org setup) | view/create/update/delete | ❌ none |
| `ClientMaster`, `ClientMember`, `DailyHuddle`, `WeeklyMeeting`, `ClientMeetings.Dashboard` | full | ❌ none |
| `Analytics.Scorecard`, `Analytics.Individual`, `Analytics.Teams`, `Analytics.Trends` | view | ❌ none |
| `People.Cycle`, `People.Goals`, `People.Self`, `People.Reviews`, `People.OneOnOne`, `People.Feedback`, `People.Talent` | full | ❌ none |

### 1.2 How role is checked on each route

There is a layered guard stack. Files: [`apps/quikscale/lib/api/withOrgAuth.ts`](../lib/api/withOrgAuth.ts), [`getOrgId.ts`](../lib/api/getOrgId.ts), [`requireAdmin.ts`](../lib/api/requireAdmin.ts), [`permissions.ts`](../lib/api/permissions.ts).

#### `withOrgAuth(handler, options)`

The standard wrapper. Returns `TenantAuthContext`:

```ts
interface TenantAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

interface WithTenantAuthOptions {
  fallbackErrorMessage?: string;
  moduleKey?: string;           // FF-1 module gate → 404 if disabled for this org
  permission?: { resource: Resource; action: Action };  // RBAC v2 → 403 if denied
}
```

Call sequence inside the wrapper:
1. Session check → `401` if no session
2. `getOrgId(session)` → `403` if no active membership
3. If `moduleKey` set → check `AppModuleFlag` → `404` if disabled
4. If `permission` set → check `userCan(userId, orgId, resource, action)` → `403` if denied
5. Run handler

**Note:** `withOrgAuth` returns ONLY `{ session, userId, orgId }`. It does NOT include role or permissions in the context — every route that needs role-aware filtering has to call `isOrgAdmin(userId, orgId)` again. (This is one of the things that should be cleaned up; see §8.)

#### `withOrgAuthForModule(moduleKey)`

Currying helper. Used when you want only the module-flag gate, no permission check:

```ts
export const GET = withOrgAuthForModule("clientMeetings.dailyHuddle")(async (req, ctx) => { ... });
```

#### `withOrgAuthForResource(moduleKey, resource)`

Currying helper that bundles both the module gate and the verb-specific permission check:

```ts
// Inside apps/quikscale/app/api/kpi/route.ts
export const GET = withOrgAuthForResource("kpi", "KPI").view(async (req, ctx) => { ... });
export const POST = withOrgAuthForResource("kpi", "KPI").create(async (req, ctx) => { ... });
```

`.view()` → `action: "view"`, `.create()` → `"create"`, `.update()` → `"update"`, `.delete()` → `"delete"`.

#### `withOrgAuthForModule(moduleKey)` — every module string in use

From `NAV_RESOURCE` map in [`permissionsRegistry.ts`](../lib/api/permissionsRegistry.ts) plus actual route imports:

```
dashboard
kpi  (and kpi.individual, kpi.teams variants for nav)
priority
www
opsp  (and opsp.create, opsp.history, opsp.review, opsp.categories)
orgSetup  (and orgSetup.teams, orgSetup.users, orgSetup.quarters)
clientMeetings  (and clientMeetings.dashboard, clientMeetings.clients,
                 clientMeetings.members, clientMeetings.dailyHuddle, clientMeetings.weeklyMeeting)
analytics.scorecard
analytics.individual
analytics.teams
analytics.trends
people.cycle
people.goals
people.self
people.reviews
people.oneOnOne
people.feedback
people.talent
```

#### Central config

Yes — [`apps/quikscale/lib/api/permissionsRegistry.ts`](../lib/api/permissionsRegistry.ts) is the single source of truth for resources, actions, navKeys, and the resource-tree shape consumed by the admin UI. It is **local to QuikScale** (NOT in `@quikit/shared`).

### 1.3 How the JWT carries permissions

**The JWT does NOT carry permissions.** It carries identity + org membership; permissions are resolved per-request from the DB.

Actual JWT payload shape (from [`packages/auth/types.ts`](../../../packages/auth/types.ts)):

```ts
{
  // identity
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;

  // org membership
  orgId?: string;                  // active org from OrgMember
  membershipRole?: string;         // legacy OrgMember.role
  membershipInvalid?: boolean;     // if membership was revoked since last check
  membershipCheckedAt?: number;    // last re-check (every 5min)

  // platform
  isSuperAdmin?: boolean;
  impersonating?: boolean;
  impersonatorUserId?: string;
  impersonatorEmail?: string;
  impersonationExpiresAt?: string;

  // session
  sessionId?: string;              // Redis-backed for soft revocation
  sessionTouchedAt?: number;

  // agent JWT only (see §1.5)
  actingAs?: "user" | "ai_agent" | "platform_service" | "scheduled_job";
  actingAgentId?: string;
}
```

**There is no `apps[].permissions[]` array in the JWT.** Permissions are checked at DB query time via `userCan(userId, orgId, resource, action)` which runs an EXISTS join across `UserAppRole → RolePermission` plus a fallback EXISTS on `UserPermissionExtra`.

**When a Member calls an admin-only endpoint:**
- If the route uses `requireAdmin()` → 403 with `{ success: false, error: "Forbidden" }`.
- If the route uses `withOrgAuthForResource("orgSetup", "User").update()` → 403 from the `userCan` check (because `User:update` is not in the Member role's grants).

**No JWT cache invalidation needed when permissions change.** Because permissions are read from DB on every request (with a 5-minute in-process cache for the client-side `loadMyPermissions` only — server-side `userCan` hits DB every time), an admin's permission edits take effect immediately for everyone.

### 1.4 Team-based access control

- **Team membership storage:** [`UserTeam`](../../../packages/database/prisma/schema.prisma) (many-to-many: `orgId + userId + teamId`) AND `OrgMember.teamId` (legacy primary team). The newer code is moving to `UserTeam`. A user can belong to **multiple teams**.
- **Team head:** `Team.headId` (single user). Used by `canEditKPI` for team-level KPIs and by `canManageTeamKPI` for team-KPI mutations.
- **Visibility rules** (from KPI list endpoint, [`apps/quikscale/app/api/kpi/route.ts`](../app/api/kpi/route.ts)):
  - Admins: see all KPIs in the org.
  - Non-admins requesting `kpiLevel=individual`: only their own (`owner === userId`).
  - Non-admins requesting `kpiLevel=team`: only KPIs whose `teamId` is in their `UserTeam` set.
  - Non-admins with no filter: `OR: [{owner: userId}, {teamId: {in: myTeams}}]`.
- **Multi-owner KPIs (`ownerIds[]`):** All owners have equal access **only by virtue of team membership**. Today, the list endpoint does NOT include `ownerIds.has(userId)` in the non-admin filter — only `owner` (single) and `teamId`. A KPI where User B is in `ownerIds[]` but not in the KPI's team would NOT show up for User B in the list. (This is a known gap — see §8.)
- **Cross-team visibility:** A team lead can only see their team's KPIs / Priorities / WWW. There is no "skip-level" or "parent team" visibility today, despite `Team.parentTeamId` existing in the schema.

### 1.5 Agent JWT / AI Runtime access

**Status:** Issuance is built, consumption in QuikScale routes is NOT.

- **Issuance:** `POST /api/auth/internal/issue-agent-jwt` ([apps/auth](../../auth/app/api/auth/internal/issue-agent-jwt/route.ts)) mints a short-lived JWT with `actingAs ∈ {"user","ai_agent","platform_service","scheduled_job"}` and an optional `actingAgentId`. TTL clamped to [60s, 900s]. Every issuance is logged to `AgentJwtIssuance` (success + failure).
- **Consumption in QuikScale:** **`actingAs` is not read by any QuikScale route today.** `withOrgAuth` does not surface `actingAs`. The audit log writes `actorId` and `actorRole` but **not `actingAs`**.

**Implication for the AI Runtime:**
- An AI-agent JWT presented to QuikScale today is treated **identically** to a human user's JWT for the same `userId`/`orgId`. It gets exactly the user's permissions — no more, no less.
- There is **no bypass and no extra restriction** for `actingAs: "ai_agent"`. The agent inherits the user's role.
- This means: if the AI is acting on behalf of a Member, it cannot see other users' performance reviews; if acting on behalf of an admin, it can see everything that admin can.

**Differentiating human vs. agent:** Today, you cannot from inside QuikScale. The token does carry `actingAs`/`actingAgentId`, but no QuikScale code path reads them. If you need this differentiation enforced server-side (e.g. PII-stripping for AI-only), it must be added as a new gate.

---

## SECTION 2 — Module Architecture & Relationships

### 2.1 Modules

| Module | URL prefix | Entity types | Reads/writes | Role gate | Activation |
|---|---|---|---|---|---|
| Dashboard | `/api/dashboard/*` | aggregates | KPI, Priority, WWWItem | `Dashboard:view` (module gate only) | always on |
| KPI | `/api/kpi/*` | KPI, KPIWeeklyValue, KPINote, KPILog | KPI* tables | `KPI` + `TeamKPI` (CRUD per verb) | `kpi` module flag |
| Priority | `/api/priority/*` | Priority, PriorityWeeklyStatus | Priority* | `Priority` (CRUD) | always on |
| WWW | `/api/www/*` | WWWItem, WWWRevisionLog | WWW* | `WWW` (CRUD) | always on |
| OPSP | `/api/opsp/*` | OPSPData, OPSPReviewEntry, OPSPDocument, OPSPSection, OPSPPlan | OPSP* + CategoryMaster | `OPSP.Create/.History/.Review/.Categories` | `opsp` flag |
| Performance | `/api/performance/*` | PerformanceReview, Goal, FeedbackEntry, TalentAssessment, OneOnOne | Performance + Goal + Feedback + Talent + OneOnOne | `People.*` + `Analytics.*` (module gates) | `people` + `analytics` flags |
| Client Meetings | `/api/client-meetings/*` | Client, ClientMember, ClientTeamMember, ClientDailyHuddle, ClientWeeklyMeeting, ClientWeeklyMemberScore | Client* | `ClientMaster`, `ClientMember`, `DailyHuddle`, `WeeklyMeeting`, `ClientMeetings.Dashboard` | `clientMeetings` flag |
| Org Setup | `/api/org/*` | Org, OrgMember, Team, UserTeam, AppRole, UserAppRole, RolePermission, UserPermissionExtra, QuarterSetting | Org models + role models | `Team`, `User`, `Quarter` (CRUD) — admin only in practice | `orgSetup` flag |
| Settings | `/api/settings/*` | User (preferences), Org (company) | User, Org | user-scoped (no permission gate) | always on |

**Activation:** Module visibility is controlled by `AppModuleFlag(orgId, appId, moduleKey, enabled)`. Sparse — a row exists only when a module is **disabled**; absence = enabled. There is also a hard gate `OrgAppAccess(orgId, appId, enabled)` that revokes the entire app.

### 2.2 Entity relationship map

```
User ─┬── OrgMember (orgId, userId, role string, teamId)
      ├── UserTeam (orgId, userId, teamId)            ← multi-team
      ├── UserAppAccess (orgId, appId)                ← which apps in launcher
      ├── UserAppRole (orgId, roleId)                 ← RBAC v2 role assignment
      └── UserPermissionExtra (orgId, resource, action) ← per-user additive grants

Org ──┬── Team ───┬── parentTeamId → Team (hierarchy)
      │          ├── headId → User
      │          └── members via OrgMember.teamId + UserTeam
      ├── AppRole (per appId, per orgId)
      └── OrgAppAccess (per appId)

KPI ──┬── orgId → Org
      ├── owner (single) → User
      ├── ownerIds[] (multi)             ← array column, NO FK
      ├── ownerContributions JSON        ← {userId: pct}
      ├── teamId → Team
      ├── parentKPIId → KPI (cascade)
      └── weeklyValues → KPIWeeklyValue (kpiId, userId, weekNumber, value)

Priority ─┬── orgId → Org
          ├── owner (single, required) → User
          ├── teamId → Team
          └── weeklyStatuses → PriorityWeeklyStatus

WWWItem ──┬── orgId → Org
          ├── who (single) → User
          ├── whoIds[] (multi)           ← array column, NO FK
          ├── linkedPriorityId → Priority (optional)
          ├── linkedKPIId → KPI (optional)
          └── revisionLogs → WWWRevisionLog

PerformanceReview ─┬── reviewerId → User
                   ├── revieweeId → User
                   └── quarter, year scope

Goal ─┬── ownerId → User
      └── parentGoalId → Goal (hierarchy)

FeedbackEntry ─┬── fromUserId → User
               ├── toUserId → User
               └── visibility: "private" (default) | "shared" | "anonymous"
                  (string field — NOT an enforced enum)

OneOnOne ─┬── managerId → User
          └── reportId → User

TalentAssessment ─┬── userId → User (subject)
                  ├── assessorId → User
                  └── @@unique([orgId, userId, quarter, year])

OPSPData ─┬── userId → User
          └── @@unique([orgId, userId, year, quarter])    ← one OPSP per user per quarter

OPSPReviewEntry ── opspId → OPSPData
OPSPPlan ────────── userId → User @@unique  ← personal long-term plan

Client ──┬── orgId → Org
         └── teamMembers ↔ ClientMember (via ClientTeamMember m:n)

ClientMember ── orgId → Org (external roster, NOT a User)

ClientDailyHuddle ─── clientId → Client
ClientWeeklyMeeting ── clientId → Client
ClientWeeklyMemberScore ── (meetingId, clientMemberId) unique
```

**Manager-report relationship:** There is **no explicit manager column** on User or OrgMember. The "manager" relationship in `OneOnOne` is whoever is set as `managerId` on the specific 1:1 record — it is per-record, not a global field. There is also no enforced rule that says `OneOnOne.managerId` must be a team head or a hierarchical superior; the API accepts any two users.

### 2.3 Cross-module data access

Today's actual behavior:

- **"Executive summary"** (i.e., `/api/dashboard/summary`): reads KPI, Priority, WWWItem — but **does NOT scope by role/team** (see §3 and §8). Both admins and Members get the org-wide payload.
- **OPSP data:** A user with `OPSP.History:view` sees ALL users' OPSP records, not just their own. This is a permission-gated leak — see §3.5 and §8.
- **Performance reviews:** No team-lead-specific scoping. Anyone with `People.Reviews:view` sees all reviews.
- **Feedback about themselves:** A user can always see feedback where `fromUserId === userId` OR `toUserId === userId`. Other people's feedback is filtered to `visibility = "shared"` only.
- **9-box talent grid:** Any user with `People.Talent:view` sees the entire org's grid. (Default Member role does NOT have this — but if an admin grants it, the grant is org-wide, not team-wide.)
- **Org-level dashboard rollup:** No role distinction.

### 2.4 Module activation / feature flags

Two separate systems live in the schema:

- **`AppModuleFlag(orgId, appId, moduleKey, enabled)`** — controls module visibility within an app (the FF-1 gate). Sparse storage: rows exist only for disabled modules. Used by `withOrgAuth*`'s `moduleKey` check.
- **`FeatureFlag(orgId, key, enabled, value, rolloutPercent)`** — generic per-tenant flags. Currently used for:
  - `opsp_threshold_days` — drives OPSP Finalize banner (5-day default; Mode A/B).
  - `opsp_review_threshold_days` — drives OPSP Review reminder banner (no default, banner silent if unset).
- **`OrgAppAccess(orgId, appId, enabled)`** — hard gate. If disabled, the entire app is unreachable; super-admin only.

Org admins can toggle `AppModuleFlag` via Org Setup UI; `FeatureFlag` is platform-managed today (no UI in QuikScale).

---

## SECTION 3 — Data Visibility Rules (actual)

### 3.1 KPI visibility

From [`app/api/kpi/route.ts`](../app/api/kpi/route.ts):

```ts
const where: any = { orgId, deletedAt: null /* or {not:null} if includeDeleted */ };
if (!(await isOrgAdmin(userId, orgId))) {
  if (kpiLevel === "individual") {
    where.owner = userId;
  } else if (kpiLevel === "team") {
    const myTeams = await getMyTeamIds(userId, orgId);
    where.teamId = myTeams.length ? { in: myTeams } : "__no_team_membership__";
  } else {
    const myTeams = await getMyTeamIds(userId, orgId);
    where.OR = [{ owner: userId }, ...(myTeams.length ? [{ teamId: { in: myTeams } }] : [])];
  }
}
```

Answers:
- **Non-owner member, same team, team-level KPI:** YES, can see.
- **Non-owner member, another team's KPI:** NO.
- **Admin:** YES, sees everything.
- **`kpiLevel: "company"`:** the column allows the string but is treated as "fall-through" — non-admins only see it if they own it OR are on its team. There is no special company-wide visibility today.
- **`ownerContributions`:** does NOT affect visibility (display-only field).
- **⚠ Bug:** `ownerIds[].has(userId)` is **not** included in the non-admin filter. A user listed in `ownerIds[]` but not in the KPI's team will not see the KPI in their list. Detail endpoint loads by id and only checks orgId, so once you have an id you can read it.

### 3.2 Priority visibility

From [`app/api/priority/route.ts`](../app/api/priority/route.ts):

```ts
const where: Record<string, unknown> = { orgId, deletedAt: null, ...(year?{year}:{}), ...(quarter?{quarter}:{}) };
if (!(await isOrgAdmin(userId, orgId))) {
  where.owner = userId;
}
```

- **Non-owner member:** NO. Only sees Priorities they own.
- **Team lead, looking at team's Priorities they don't own:** NO. (There is no team-scoped filter for Priorities — it's owner-only OR admin.)
- **Admin:** YES, sees everything.

### 3.3 WWW visibility

From [`app/api/www/route.ts`](../app/api/www/route.ts):

```ts
const where: Record<string, unknown> = { orgId, deletedAt: null };
if (!(await isOrgAdmin(userId, orgId))) {
  where.who = userId;
}
```

- Same shape as Priority. **`whoIds[]` is NOT used in the non-admin filter** — multi-assignee secondary owners do not see the WWW in their list.
- Detail (`GET /api/www/[id]`) only checks `orgId === orgId`.

### 3.4 Performance data visibility

| Endpoint | Visibility |
|---|---|
| `/api/performance/individual?userId=X` | Module-gated (`analytics.individual`). **No `userId` scoping.** Anyone with the permission sees the whole org's individual metrics. |
| `/api/performance/feedback` (GET) | Default: `OR: [{fromUserId: me}, {toUserId: me}]`. Explicit `toUserId=X`/`fromUserId=X` queries: caller must be involved OR `visibility="shared"` is forced. Note: `visibility` is a string field, not an enforced enum — `"anonymous"` is allowed but the API does not strip the `fromUserId` from the payload, so anonymity is display-only. |
| `/api/performance/feedback/[id]` | Caller must be sender, receiver, OR admin. |
| `/api/performance/goals` | Module-gated, no user scoping. Returns all goals in the org. Owner emails included. |
| `/api/performance/reviews` | Module-gated. No reviewer/reviewee scoping. Returns all reviews. |
| `/api/performance/talent` (9-box) | Module-gated. Returns all talent assessments + assessee email + flightRisk + successionReady. **Anyone with `People.Talent:view` sees the entire org's 9-box.** |
| `/api/performance/one-on-one` | Default: `OR: [{managerId: me}, {reportId: me}]`. Explicit query for someone else: not blocked at code level — caller must use `managerId=`/`reportId=` filter, no admin check enforced. |
| `/api/performance/one-on-one/[id]` | Strict: only manager or report on the record. |
| `/api/performance/scorecard` | Aggregate-only, no PII. |
| `/api/performance/teams` | All teams' metrics. |
| `/api/performance/trends` | Org-wide trends. |

### 3.5 OPSP visibility

| Endpoint | Visibility |
|---|---|
| `GET /api/opsp` | Scoped by `{ orgId, userId: me, year, quarter }`. Returns only the caller's own OPSP. |
| `GET /api/opsp/history` | Module-gated by `OPSP.History:view`, then returns `{ orgId }` — **all users' OPSP records**. Includes `bhag`, targets, goals. **This is the biggest cross-user OPSP exposure today.** |
| `GET /api/opsp/review` | `requireAdmin()` + module flag. Admin-only. Scoped to the OPSP being reviewed. |
| `GET /api/opsp/config` | User-scoped. |
| `OPSPPlan` (personal 90d/1yr/long horizons) | `@@unique([orgId, userId])` — no current API exposes other users' plans. |

Answers:
- **User A see User B's OPSP?** Only via `OPSP.History:view` (which by default only admins have). If granted to Members, ALL members can read all OPSPs.
- **Admin sees everyone's OPSP?** YES.
- **Org-level OPSP combining all users:** Not in code today. The `OPSPDocument`/`OPSPSection` models exist for that but are not actively used by API routes.

### 3.6 Client meeting visibility

- `GET /api/client-meetings/daily-huddles` and `/weekly-meetings`: module-gated, no user/team scoping → all org meetings returned. Includes `createdBy` names, absent member lists, `ClientMember.email` for client-side members.
- Dashboard rollup: same — org-wide, no role split.

### 3.7 Full-summary endpoint

**Does not exist.** There is no `/api/users/[id]/full-summary` or equivalent route in the current codebase. The closest is `/api/performance/individual?userId=X`, which (today) returns org-wide data ignoring the `userId` filter as a scope.

If the AI Runtime needs a full-summary endpoint, it must be added — and given the current visibility-rule gaps, it would need to enforce: caller is `userId` themselves OR admin OR (future) their manager.

---

## SECTION 4 — Data Filtering by Role: Actual Query Patterns

### KPI list — actual code

```ts
// apps/quikscale/app/api/kpi/route.ts (GET handler, summarized)
const where: any = { orgId, deletedAt: null };
if (!(await isOrgAdmin(userId, orgId))) {
  if (kpiLevel === "individual")  where.owner = userId;
  else if (kpiLevel === "team")   where.teamId = { in: await getMyTeamIds(userId, orgId) };
  else                            where.OR = [{ owner: userId }, { teamId: { in: myTeams } }];
}
```

### Priority list

```ts
const where = { orgId, deletedAt: null };
if (!(await isOrgAdmin(userId, orgId))) where.owner = userId;
```

### WWW list

```ts
const where = { orgId, deletedAt: null };
if (!(await isOrgAdmin(userId, orgId))) where.who = userId;
```

### Performance/individual

```ts
const where = { orgId };   // ⚠ no role-based scoping
```

### Performance/feedback

```ts
const where = { orgId };
if (!explicitToUser && !explicitFromUser) {
  where.OR = [{ fromUserId: userId }, { toUserId: userId }];
} else if (callerIsNotInvolved) {
  where.visibility = "shared";
}
```

### Performance/teams, /scorecard, /trends, /talent

```ts
const where = { orgId };   // ⚠ no role scoping; all module-gated only
```

### Goals

```ts
const where = { orgId, ...filters };   // ⚠ no role scoping
```

### Meetings (daily + weekly)

```ts
const where = { orgId, ...optional filters };   // ⚠ no role scoping
```

### Dashboard summary

```ts
const where = { orgId };   // ⚠ no role scoping for KPI/Priority/WWW aggregation
```

### Full-summary

(Not implemented.)

### 4.2 PII handling

There is **no central PII filter**. PII is included or excluded per-endpoint, ad-hoc:

- `/api/org/users` returns `email`, `lastSignInAt`, `firstName`, `lastName`, `avatar`, role name to any caller with `orgSetup.users` access.
- `/api/performance/individual` returns `email` for every org member.
- `/api/performance/feedback` returns `fromUser.email` and `toUser.email`.
- `/api/performance/talent` returns `email` plus `potential`, `flightRisk`, `successionReady`.
- `/api/client-meetings/clients` and `/members` return `email`.
- **For AI-agent callers (`actingAs: "ai_agent"`):** **no special PII stripping happens today.** The agent receives the exact same payload as the user it acts on behalf of.
- Password hashes (`User.password`) are never selected in any route handler. OAuth tokens are stored in `Account` and are never selected by QuikScale routes.

---

## SECTION 5 — Multi-Owner / Multi-Team Scenarios

### 5.1 Multi-owner KPIs

- A KPI with `ownerIds: ["A","B","C"]` and `ownerContributions: {A:40, B:35, C:25}`:
  - **Display per user:** All owners see the same KPI row. There is no per-user "your portion is 40%" view.
  - **Weekly value submission:** `KPIWeeklyValue` has `userId` — so each owner submits THEIR contribution for the week. The team-KPI roll-up = sum of owner values for that week (computed in `kpiService.ts` / `kpiHelpers.ts`).
  - **List endpoint:** As noted in §3.1, the non-admin filter only checks `owner` (single) and `teamId`. A user listed in `ownerIds[]` but on a different team **cannot find the KPI via the list endpoint** (bug).
  - **`full-summary`:** N/A (doesn't exist).

### 5.2 Cross-team visibility

- **User on Team A, listed in Team B's KPI's `ownerIds[]`:** Currently cannot see it via list (bug); can see it via detail-by-id if they have the id.
- **Team A's lead seeing Team B's Priorities:** NO. Priority visibility is owner-only OR admin.
- **Dashboard rollup:** Aggregates org-wide regardless of caller.

### 5.3 Manager-report relationship

- **No explicit manager column.** The "manager" is whoever is set as `managerId` on a specific `OneOnOne` record.
- 1:1 prep relies on the record's `managerId` / `reportId` fields.
- **Skip-level manager:** Not a concept in code today.

---

## SECTION 6 — API Response Shape per Role

### `GET /api/kpi/[id]`

Same shape for admin, owner, and AI-agent calling on their behalf. Returns full KPI object including `ownerIds`, `weeklyTargets`, `weeklyValues`, owner_user (id, firstName, lastName — NOT email), team (id, name, color, headId).

Non-owner Member: 403 if not in the KPI's `where` clause (i.e. not owner / not in team).

### `GET /api/performance/individual?userId=X`

Today, **same shape for every caller** with `analytics.individual` access. Returns array of per-user metrics including `email` for all org members. The `userId` query param does NOT scope the response.

This needs to be fixed before AI Runtime can rely on the param to mean "scope to this user."

### `GET /api/performance/feedback?toUserId=X`

- **Admin or caller==X**: all rows including `visibility="private"` and `visibility="anonymous"`.
- **Other Member**: only `visibility="shared"` rows.
- `fromUserId` is returned even for `visibility="anonymous"` — current code does not strip it.

### `GET /api/users/{userId}/full-summary`

Does not exist. Must be designed if AI Runtime needs it.

### `GET /api/dashboard/summary?view=rollup`

Same response for all roles. No `?view=rollup` parameter is currently parsed differently from `?view=personal`.

---

## SECTION 7 — Schema Reference

Source: [`packages/database/prisma/schema.prisma`](../../../packages/database/prisma/schema.prisma). Schemas: `auth`, `quikit`, `public`, `app_quikscale`.

### Users / Org / Teams

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  firstName     String
  lastName      String
  password      String?
  isSuperAdmin  Boolean  @default(false)
  // ... preferences, theme, table column prefs
  memberships   OrgMember[]
  appAccess     UserAppAccess[]
  userTeams     UserTeam[]
  appRoles      UserAppRole[]
  permissionExtras UserPermissionExtra[]
  @@schema("auth")
}

model OrgMember {
  id           String   @id @default(cuid())
  orgId        String
  userId       String
  role         String                       // legacy string: "admin"|"member"|...
  teamId       String?                      // legacy primary team
  status       String   @default("active")
  inviteMethod String?                      // "sso" | "native"
  @@unique([orgId, userId])
  @@schema("quikit")
}

model Team {
  id           String   @id @default(cuid())
  orgId        String
  name         String
  slug         String
  parentTeamId String?
  headId       String?
  deletedAt    DateTime?
  @@unique([orgId, slug])
  @@schema("public")
}

model UserTeam {
  id     String @id @default(cuid())
  orgId  String
  userId String
  teamId String
  @@unique([orgId, userId, teamId])
  @@schema("public")
}
```

### Dynamic Roles v2

```prisma
model AppRole {
  id        String @id @default(cuid())
  orgId     String
  appId     String
  name      String
  isSystem  Boolean @default(false)         // only protects rename/delete; NOT a bypass
  isDefault Boolean @default(false)
  @@unique([orgId, appId, name])
  @@schema("app_quikscale")
}

model UserAppRole {
  id     String @id @default(cuid())
  userId String
  orgId  String
  roleId String
  @@unique([userId, orgId, roleId])
  @@schema("app_quikscale")
}

model RolePermission {
  id       String @id @default(cuid())
  roleId   String
  resource String
  action   String
  @@unique([roleId, resource, action])
  @@schema("app_quikscale")
}

model RoleNavigation {
  id     String @id @default(cuid())
  roleId String
  navKey String
  @@unique([roleId, navKey])
  @@schema("app_quikscale")
}

model UserPermissionExtra {
  id       String @id @default(cuid())
  orgId    String
  userId   String
  resource String
  action   String
  @@unique([orgId, userId, resource, action])
  @@schema("app_quikscale")
}
```

### KPI / Priority / WWW (visibility-relevant fields)

```prisma
model KPI {
  id                 String   @id @default(cuid())
  orgId              String
  kpiLevel           String   @default("individual")  // "individual" | "team" | "company"
  owner              String?                          // single user FK
  ownerIds           String[] @default([])             // ← multi, no FK constraint
  ownerContributions Json?                            // {userId: percent}
  teamId             String?
  parentKPIId        String?
  quarter            String   @default("Q1")
  year               Int
  // ... metric fields
  @@schema("app_quikscale")
}

model Priority {
  id      String @id @default(cuid())
  orgId   String
  owner   String                       // required single owner
  teamId  String?
  quarter String
  year    Int
  @@schema("app_quikscale")
}

model WWWItem {
  id               String   @id @default(cuid())
  orgId            String
  who              String                       // single assignee
  whoIds           String[] @default([])         // multi, no FK
  what             String
  when             DateTime
  linkedKPIId      String?
  linkedPriorityId String?
  @@schema("app_quikscale")
}
```

### Performance

```prisma
model PerformanceReview {
  id          String @id @default(cuid())
  orgId       String
  reviewerId  String
  revieweeId  String
  quarter     String
  year        Int
  status      String @default("draft")    // no explicit visibility field
  @@schema("app_quikscale")
}

model Goal {
  id           String @id @default(cuid())
  orgId        String
  ownerId      String
  parentGoalId String?
  quarter      String?
  year         Int
  @@schema("app_quikscale")
}

model FeedbackEntry {
  id         String @id @default(cuid())
  orgId      String
  fromUserId String
  toUserId   String
  visibility String @default("private")    // free-form string; expected values: "private"|"shared"|"anonymous"
  category   String
  @@schema("app_quikscale")
}

model TalentAssessment {
  id              String @id @default(cuid())
  orgId           String
  userId          String        // subject
  assessorId      String
  potential       String @default("medium")
  flightRisk      String @default("low")
  successionReady String @default("not-ready")
  quarter         String
  year            Int
  @@unique([orgId, userId, quarter, year])
  @@schema("app_quikscale")
}

model OneOnOne {
  id          String @id @default(cuid())
  orgId       String
  managerId   String
  reportId    String
  scheduledAt DateTime
  @@schema("app_quikscale")
}
```

### OPSP

```prisma
model OPSPData {
  id      String @id @default(cuid())
  orgId   String
  userId  String
  year    Int
  quarter String
  status  String @default("draft")
  @@unique([orgId, userId, year, quarter])
  @@schema("app_quikscale")
}

model OPSPReviewEntry {
  id       String @id @default(cuid())
  orgId    String
  opspId   String
  userId   String
  horizon  String
  rowIndex Int
  category String
  period   String
  @@unique([orgId, opspId, horizon, rowIndex, period])
  @@schema("app_quikscale")
}

model OPSPPlan {
  id     String @id @default(cuid())
  orgId  String
  userId String @unique
  // relationships_long/1yr/90d, achievements_*, rituals_*, wealth_*
  @@unique([orgId, userId])
  @@schema("app_quikscale")
}
```

### Feature flags / module activation

```prisma
model AppModuleFlag {
  id        String  @id @default(cuid())
  orgId     String
  appId     String
  moduleKey String
  enabled   Boolean @default(false)
  @@unique([orgId, appId, moduleKey])
  @@schema("public")
}

model OrgAppAccess {
  id      String  @id @default(cuid())
  orgId   String
  appId   String
  enabled Boolean @default(true)
  @@unique([orgId, appId])
  @@schema("quikit")
}

model FeatureFlag {
  id      String  @id @default(cuid())
  orgId   String
  key     String
  enabled Boolean @default(false)
  value   String?
  @@unique([orgId, key])
  @@schema("public")
}
```

### Agent JWT audit

```prisma
model AgentJwtIssuance {
  id                String   @id @default(cuid())
  requestingService String
  userId            String
  orgId             String
  agentId           String?
  reason            String
  ttlSeconds        Int
  actingAs          String       // "user"|"ai_agent"|"platform_service"|"scheduled_job"
  status            String       // "success" | "failure"
  errorCode         String?
  issuedAt          DateTime @default(now())
  @@schema("auth")
}
```

---

## SECTION 8 — Known Gaps & Incomplete Areas

Honest list. AI Runtime should NOT assume these work as documented above.

### Critical security gaps (data over-exposure)

1. **`/api/dashboard/summary`** returns org-wide KPI / Priority / WWW with NO role-based scoping. A non-admin Member gets the same payload as an admin.
2. **`/api/opsp/history`** returns ALL users' OPSPData (including `bhag`, strategic targets) to anyone with `OPSP.History:view`. By default only admins have this — but the permission is grantable per-role, so if granted to Members the leak is org-wide. Should be scoped to `userId = me` + admin-bypass.
3. **`/api/performance/talent`** (9-box) returns the whole org's talent grid + `flightRisk` + `successionReady` + email to anyone with `People.Talent:view`. Should be admin-only or HR-only.
4. **`/api/performance/individual`** ignores the `?userId=X` query param's intent — returns all org members' metrics, including email, to anyone with `analytics.individual` access.
5. **`/api/performance/goals`, `/reviews`, `/teams`, `/trends`, `/cycle`** all return org-wide data with no caller scoping beyond the module gate.
6. **`/api/client-meetings/*`** list endpoints return all org meetings + ClientMember emails with no team/user scoping.

### Permission-model bugs

7. **KPI list non-admin filter ignores `ownerIds[]`** — a multi-owner KPI does not show up in the list for owners who aren't the primary `owner` AND aren't on the KPI's team.
8. **WWW list non-admin filter ignores `whoIds[]`** — same shape.
9. **`OneOnOne` list** accepts arbitrary `managerId=`/`reportId=` query filters without verifying the caller is one of those parties. Strict ownership check only kicks in on the no-filter default path. Detail-by-id is correctly scoped.
10. **`FeedbackEntry.visibility = "anonymous"`** does not strip `fromUserId` from the response payload — anonymity is display-only and breaks if the AI Runtime forwards the raw payload to an LLM.

### Dual-role-system fragility

11. **Legacy `OrgMember.role` is not synced with `UserAppRole`.** Promoting a user to admin via the v2 UI does NOT bump their legacy role. Any route still using bare `requireAdmin` from `@quikit/auth` (without the QuikScale dual-check wrapper) will 403 them. The wrapper at [`apps/quikscale/lib/api/requireAdmin.ts`](../lib/api/requireAdmin.ts) is in place for QuikScale's own routes — but new routes that forget to use the QuikScale wrapper will silently break.
12. Per-resource permission helpers (`canEditKPI`, `canEditPriority`, `canEditWWW`, `canManageTeamKPI`, `canEditKPIOwnerWeekly`) still check legacy `OrgMember.role >= admin` via `ROLE_HIERARCHY`. If a user is admin in v2 but Member in legacy, these helpers will deny.

### Acting-as / AI agent

13. **`actingAs` and `actingAgentId` from the agent JWT are not read by any QuikScale route.** AI-agent calls today receive the same response as a human user — same permissions, same PII, same payloads.
14. The audit log (`AuditLog` table) records `actorId` and `actorRole` but NOT `actingAs`, so retrospective forensics on "did an AI agent do this?" is not possible from QuikScale logs (only from `AgentJwtIssuance` in the auth service).

### Missing endpoints

15. **No `/api/users/[id]/full-summary` endpoint** exists. Must be designed if AI Runtime depends on it.
16. **No org-level OPSP rollup endpoint** — `OPSPDocument` model exists but no GET route consumes it.
17. **No "skip-level manager" or hierarchical team visibility** — `Team.parentTeamId` exists but is not used for visibility cascades.

### Hardcoded vs. configurable

18. The dot-namespaced resource strings in `PERMISSION_TREE` are **open strings** in the DB — there is no DB enum or FK enforcing that `RolePermission.resource` matches a registry entry. Adding a new resource is purely a code change to `permissionsRegistry.ts`. This is convenient but also means a typo in a route's `withOrgAuthForResource("kpi", "Kpi").view()` (lowercase `pi`) will silently 403 every caller because the resource doesn't exist in the registry.
19. `ADMIN_DEFAULT_EXCLUSIONS = { "OPSP.History.EditFinalize:update" }` is a hardcoded constant in [`seedAdminAppRole.ts`](../lib/api/seedAdminAppRole.ts).

---

## Recommendations for AI Runtime

Given the gaps above, before relying on QuikScale for permission enforcement:

1. **Don't trust `/api/dashboard/summary` or `/api/performance/*` (except `/feedback`, `/one-on-one/[id]`) to scope by caller.** Filter client-side based on the caller's role until those endpoints add proper `where` clauses.
2. **For AI-acting-as-user calls, treat them as the user**, full stop. No agent-specific scoping exists. If you need agent-only restrictions, surface `actingAs` to a new gate that you control.
3. **Strip `email` and `fromUserId` (for anonymous feedback) at your runtime layer** — QuikScale doesn't strip them.
4. **Use `loadMyPermissions(userId, orgId)` semantics** (i.e. `/api/me/permissions`) to know what the caller can do, but **always re-verify at the data layer** — there are endpoints that should but don't honor those permissions.
5. **Listen for the gaps to be closed.** The priority order suggested:
   - Fix `/api/opsp/history` (biggest leak).
   - Fix `/api/performance/talent`, `/api/performance/individual`.
   - Fix list endpoint filters to include `ownerIds[]` / `whoIds[]`.
   - Add `/api/users/[id]/full-summary`.
   - Surface `actingAs` to QuikScale audit log.
