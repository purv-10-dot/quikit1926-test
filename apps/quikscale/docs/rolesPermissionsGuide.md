# QuikScale — Roles & Permissions: Complete Flow Guide

> A single guide that walks you through QuikScale's Roles & Permissions system
> end-to-end. **Part 1** is written for end users (org admins) who manage roles
> from the UI. **Part 2** is the technical reference for developers touching the
> code.

**Document date:** 2026-05-18
**Applies to:** QuikScale app (apps/quikscale) on the QuikIT monorepo
**System version:** Dynamic Roles & Permissions v2 (live since 2026-05-12)

---

## Table of Contents

- [Part 1 — End-User Guide](#part-1)
  - [What is a Role? What is a Permission?](#concepts)
  - [The big picture (one diagram)](#big-picture)
  - [The two default roles you get out of the box](#default-roles)
  - [Where you do everything: Org Setup → Users](#org-setup-users)
  - [Flow A — Inviting a new user](#flow-invite)
  - [Flow B — Creating a custom role](#flow-create-role)
  - [Flow C — Editing a role's permissions (the Matrix)](#flow-edit-role)
  - [Flow D — Assigning a role to a user](#flow-assign-role)
  - [Flow E — Giving one user an extra permission (User Extras)](#flow-extras)
  - [Flow F — Deleting a role](#flow-delete-role)
  - [Safety nets you should know about](#safety-nets)
  - [Common questions](#common-questions)
- [Part 2 — Developer Reference](#part-2)
  - [Architecture overview](#architecture)
  - [The dual role system — why two exist](#dual-system)
  - [Database schema (5 models)](#schema)
  - [Permission registry — single source of truth](#registry)
  - [Server-side checks: userCan, requireAdmin, forbidden](#server-checks)
  - [Client-side checks: useMyPermissions hook](#client-checks)
  - [Seeding — what happens on the first request](#seeding)
  - [Admin lockout guard](#lockout-guard)
  - [Full request-time flow (sequence diagram)](#sequence-diagram)
  - [API surface — every route at a glance](#api-surface)
  - [How to add a new permission resource](#add-resource)
  - [Files & locations cheat-sheet](#files-cheat-sheet)
  - [Gotchas the next engineer will hit](#gotchas)

---

<a id="part-1"></a>

# Part 1 — End-User Guide

This part is for org admins who manage roles and permissions from inside the
app. No code. No database. Just the screens you click and what each thing does.

---

<a id="concepts"></a>

## What is a Role? What is a Permission?

Think of QuikScale as a building with many rooms (KPI, Priority, WWW, OPSP,
Analytics, People, etc.).

- **A Permission is a key.** Each key opens one door and lets you do one thing
  behind it — *view* the room, *create* a new item, *update* an existing one,
  or *delete* it. A permission is always a pair: **what** (the resource) and
  **how** (the action).
- **A Role is a key-ring.** A role holds a bunch of keys grouped together so
  you can hand the whole bundle to a user instead of giving keys one at a time.
- **A User is a person.** You attach one (or more) roles to a person, and they
  inherit every key on every role they hold.
- **A User Extra is a single bonus key.** Sometimes you want one specific
  person to have one specific extra permission that isn't on their role. You
  add it as an "extra" without touching the role.

That's the whole model. Everything below is just plumbing for those four ideas.

---

<a id="big-picture"></a>

## The big picture (one diagram)

```
                ┌──────────────────────────────────────────┐
                │           Your Organization              │
                │  (e.g. "Acme Corp" in QuikScale)         │
                └────────────────────┬─────────────────────┘
                                     │ owns
                ┌────────────────────┴─────────────────────┐
                │                                          │
                ▼                                          ▼
        ┌───────────────┐                          ┌───────────────┐
        │     Users     │                          │    Roles      │
        │ (Alice, Bob,  │  ◄──── assigned to ────► │ (admin,       │
        │  Carol, ...)  │                          │  Member,      │
        └───────┬───────┘                          │  Manager, ...)│
                │                                  └───────┬───────┘
                │ may also have                            │ contains
                │                                          │
                ▼                                          ▼
        ┌───────────────┐                          ┌───────────────┐
        │  User Extras  │                          │ Permissions   │
        │ (one-off keys │                          │ (resource +   │
        │  per person)  │                          │  action pairs)│
        └───────────────┘                          └───────────────┘

                  Effective access for any user =
                  (every permission on every role they hold)
                                  +
                  (every extra granted directly to them)
```

**Read it like this:** *Alice has the Manager role, which grants update on
KPI, Priority, and WWW. Alice also has a personal extra: delete on OPSP.History.
So Alice can update KPI/Priority/WWW (via her role) AND delete OPSP history
entries (via her extra) — no one else with Manager can do that last one.*

---

<a id="default-roles"></a>

## The two default roles you get out of the box

When your organization first opens QuikScale, the app **automatically creates
two roles** for you — you do not have to set them up.

| Role | Who's on it | What they can do | Protected? |
|---|---|---|---|
| **admin** | The org's administrators | Everything — every checkbox in the permission matrix is ticked on day one. | Rename/delete protected. Permissions are editable. |
| **Member** | Every new invitee, by default | Sees the Dashboard. Full **view/create/update/delete** on the four day-to-day tools: **Individual KPI, Team KPI, Priority, WWW**. No access to Org Setup, OPSP, Analytics, People, Meeting Rhythm by default. | Renamable, deletable. Marked as the **default role** — new invitees land here. |

**Two important nuances:**

1. **Admin is editable.** Yes, even though admin is a "system role", you can
   untick boxes on it. The system never silently bypasses the admin's
   permission grid — if admin doesn't have a checkbox ticked, admin doesn't
   have that key. The only thing you cannot do is rename or delete the admin
   role itself.
2. **You can never accidentally lock everyone out.** If you try to demote the
   only remaining admin user, or empty the admin role, the system refuses
   with a clear error. See [Safety nets](#safety-nets) below.

---

<a id="org-setup-users"></a>

## Where you do everything: Org Setup → Users

Everything role-related happens on **one screen**: `Org Setup → Users`.

The page has two tabs across the top:

```
┌───────────────────────────────────────────────────────────────────┐
│  Org Setup  ▸  Users                                              │
│  ┌──────────────┬─────────────────────┐                           │
│  │   Users      │   User Management   │                           │
│  └──────────────┴─────────────────────┘                           │
│                                                                   │
│  [content for whichever tab is active]                            │
└───────────────────────────────────────────────────────────────────┘
```

- **Users tab** — the list of people in your org. Click any row to expand it
  inline and see/edit *that person's* permissions (their role grants + their
  personal extras).
- **User Management tab** — manage the roles themselves. A two-pane layout:
  - **Left pane (260 px)** — the list of roles, with a `+` button to add a new
    role and a trash icon (appears on hover) to delete one.
  - **Right pane** — the **Permission Matrix** for whichever role is selected.
    Has two sub-tabs (`Entities` and `Navigation`).

> Tip: every flow in the rest of Part 1 starts from one of these two tabs.

---

<a id="flow-invite"></a>

## Flow A — Inviting a new user

```
   You click                                      System
   ─────────                                      ──────
   "Invite User" in Users tab    ───────────────► creates the user
   (enter email + name)                            in the database
                                                          │
                                                          ▼
                                                   auto-assigns
                                                   the org's
                                                   DEFAULT role
                                                   (Member, out of the box)
                                                          │
                                                          ▼
                                                   sends invite email
                                                          │
                                                          ▼
                                                   user accepts,
                                                   sets a password,
                                                   logs in
                                                          │
                                                          ▼
                                                   sees the sidebar
                                                   trimmed to what
                                                   Member can view
```

**What the user sees after first login:** a sidebar showing only the modules
their role grants `view` on. With the default `Member` role that's *Dashboard,
Individual KPI, Team KPI, Priority, WWW*. They cannot even see *Org Setup* in
their sidebar — it's hidden, not just disabled.

> **Want a different default role?** On the User Management tab, open any role
> and toggle its **"Set as default"** flag. Only one role can be the default
> at a time — the system automatically unsets the previous default.

---

<a id="flow-create-role"></a>

## Flow B — Creating a custom role

Use this when "Member" is too narrow but "admin" is too broad — for example,
a *Manager* role that can read everything but only edit KPI/Priority.

```
   1. Go to Org Setup → Users → User Management tab
   2. In the LEFT pane, click the [+] button next to "Roles"
   3. Enter a name (e.g. "Manager")
   4. Press Enter — a new empty row appears in the left list
   5. The RIGHT pane now shows an empty permission matrix
      (every checkbox unchecked) ready for you to tick
```

A freshly-created role has **zero permissions**. Until you tick boxes and
**Save**, anyone assigned to this role can't see anything except the login
page after they log in. This is intentional — you build access up, you don't
take it away.

---

<a id="flow-edit-role"></a>

## Flow C — Editing a role's permissions (the Matrix)

This is the core flow. The permission matrix lives in the right pane of the
User Management tab.

```
┌─ Module ──────────────┬─ view ─┬─ create ─┬─ update ─┬─ delete ─┐
│ ▼ Dashboard           │   ☑    │    —     │    —     │    —     │
│ ▼ KPI                 │   ☑    │    ☑     │    ☑     │    ☑     │
│   • Individual KPI    │   ☑    │    ☑     │    ☑     │    ☑     │
│   • Team KPI          │   ☑    │    ☑     │    ☑     │    ☑     │
│ ▼ Priority            │   ☑    │    ☐     │    ☑     │    ☐     │   ← tristate
│ ▼ Org Setup           │   ☐    │    ☐     │    ☐     │    ☐     │
│   • Teams             │   ☐    │    ☐     │    ☐     │    ☐     │
│   • Users             │   ☐    │    ☐     │    ☐     │    ☐     │
│   • Quarter Settings  │   ☐    │    ☐     │    ☐     │    ☐     │
│ ▼ OPSP                │   ◐    │    ◐     │    ◐     │    ◐     │   ← partial
│   ▶ Create OPSP       │   ☑    │    ☑     │    ☑     │    ☑     │
│   ▶ OPSP History      │   ☑    │    ☐     │    ☑     │    ☐     │
│     • Edit after      │        │          │    ☑     │          │   ← binary
│       Finalize        │        │          │          │          │
│   ▶ OPSP Review       │   ☑    │    ☑     │    ☑     │    ☐     │
│   ▶ Category Mgmt     │   ☐    │    ☐     │    ☐     │    ☐     │
│ ▼ Analytics           │   ◐    │    —     │    —     │    —     │   ← view-only
│   • Scorecard         │   ☑    │    —     │    —     │    —     │
│   • Individual        │   ☐    │    —     │    —     │    —     │
│   • Teams             │   ☑    │    —     │    —     │    —     │
│   • Trends            │   ☐    │    —     │    —     │    —     │
└───────────────────────┴────────┴──────────┴──────────┴──────────┘

  ☑ = granted     ☐ = not granted     ◐ = some children granted (tristate)
  — = action not applicable to this resource (Analytics is view-only;
      "Edit after Finalize" only supports update)
```

**Three things to know about the matrix:**

1. **Tristate header rows.** Click a checkbox on a header row (Module or
   Submodule) and it toggles every leaf below it. The display has three states:
   all-on (☑), all-off (☐), partial (◐).
2. **Some leaves are binary.** *Edit after Finalize* (under OPSP → History)
   only declares the `update` action. The other three cells are blanked out —
   the server would reject grants in those columns anyway.
3. **The sub-tab Navigation** controls only sidebar visibility. In v2 you
   normally don't touch it — sidebar items are derived from the entity `view`
   grants automatically. Override only if you have a very specific
   "can view the page but I want to hide it from sidebar" requirement.

### Saving and discarding

```
   [you tick / untick boxes]
              │
              ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Sticky bottom bar appears the moment the matrix is dirty:           │
   │                                                                     │
   │   "12 changes: +5 grants, −7 grants"                                │
   │                                          [ Discard ]   [ Save ]     │
   └─────────────────────────────────────────────────────────────────────┘
```

- **Save** sends the whole new permission set to the server in one call. The
  server validates every `(resource, action)` pair against the registry and
  rejects garbage (e.g. `delete` on Analytics, which is view-only).
- **Discard** throws away your unsaved changes and reverts the matrix to the
  last-saved state. Safe to click — nothing is persisted until you Save.

> Browser refresh while there are unsaved changes will lose them. There is
> no autosave.

---

<a id="flow-assign-role"></a>

## Flow D — Assigning a role to a user

Two ways:

### Option 1 — Per-user (Users tab → expand row)

```
   Users tab → click Alice's row to expand it
                            │
                            ▼
   The row expands inline showing Alice's panel:
   ┌──────────────────────────────────────────────────┐
   │  Alice  •  alice@acme.com                        │
   │  Role: [ Member  ▼ ]   ← single-role dropdown    │
   │                                                  │
   │  Permissions for Alice                           │
   │  (matrix of her role grants + her extras)        │
   └──────────────────────────────────────────────────┘
                            │
                            ▼
   Change the dropdown → confirms → role swap persisted
```

This is the everyday move: pick a person, pick a role.

### Option 2 — Per-role (User Management → Members tab)

```
   User Management tab → click "Manager" in left pane
                            │
                            ▼
   Right pane shows tabs: [Entities] [Navigation] [Members]
                            │
                            ▼
   Members tab: a list of all org users with a checkbox
   next to each. Tick / untick to reconcile the role's
   membership in one save.
```

Use this when you're bulk-onboarding a team to the same role.

> Both routes go through the same admin lockout guard — neither can leave
> the admin role with zero members. See [Safety nets](#safety-nets).

---

<a id="flow-extras"></a>

## Flow E — Giving one user an extra permission (User Extras)

Sometimes a single person needs one extra capability that's not on their
role. Don't carve out a one-person role — use an **Extra**.

```
   Users tab → click Bob's row to expand → his permission panel:

   ┌───────────────────┬─ view ─┬─ create ─┬─ update ─┬─ delete ─┐
   │ • Individual KPI  │  🔒    │   🔒     │   🔒     │   ☐      │
   │ • Team KPI        │  🔒    │   🔒     │   🔒     │   ☐      │
   │ • Priority        │  🔒    │   ☐      │   🔒     │   ☐      │
   │ • OPSP.History    │  🔒    │   ☐      │   ☐      │  ☑ ●    │  ← extra
   └───────────────────┴────────┴──────────┴──────────┴──────────┘

   🔒 = granted by Bob's role (locked, gray, you can't untick here)
   ●  = granted as a USER EXTRA (amber dot, only present for Bob)
   ☐  = ungranted (clickable to add as an extra)
```

**Rules of Extras:**

- Extras can **only add** permissions — they cannot subtract a role grant.
  If you want Bob to NOT have something his role grants, take it off the role
  or move Bob to a different role.
- Extras are scoped to *Bob in this org* — they don't leak to anyone else.
- Save behavior: same sticky bottom bar. The server replaces Bob's entire
  extras set atomically.

> "Locked cells with 🔒 are inherited from the role. Amber-dotted cells are
> personal extras. Anything else is a plain ungranted cell you can click to
> grant as an extra."

---

<a id="flow-delete-role"></a>

## Flow F — Deleting a role

```
   User Management → hover the role's row in the left pane
                            │
                            ▼
   A trash icon appears.   Click it.
                            │
                            ▼
   ┌─ confirmation modal ───────────────────────────────┐
   │  Delete "Manager"?                                 │
   │  3 users currently hold this role. Deleting will   │
   │  remove the role; those users will lose any access │
   │  it granted. They will NOT be deleted.             │
   │                                                    │
   │                          [ Cancel ]   [ Delete ]   │
   └────────────────────────────────────────────────────┘
```

The system **blocks** delete if the role is a system role (admin). For any
non-system role, it tells you the member count up front so you don't pull
the rug out from under live users by accident.

---

<a id="safety-nets"></a>

## Safety nets you should know about

The system actively refuses operations that would leave the org unmanageable:

| Action you tried | What happens |
|---|---|
| Demote the only admin user to a non-admin role | **Refused.** Error: *"Cannot remove the last administrator. Assign another user to the admin role first."* |
| Reconcile the admin role's member list to an empty array | **Refused.** Same error family. |
| Delete the admin role (rename, also) | **Refused.** Admin is a system role — protected. |
| Untick every checkbox on the admin role | **Allowed**, but the admin role then grants nothing. The UI shows a warning. (You can always re-tick later — the role still exists.) |
| Pass a `(resource, action)` pair the registry doesn't allow | **Refused** at save time. E.g. `delete` on Analytics (view-only). |

> **There is no "force" override.** These guards live on the server. The UI
> cannot bypass them, and neither can a hand-crafted API call.

---

<a id="common-questions"></a>

## Common questions

**Q: I added a new module to QuikScale. Will it appear in the matrix?**
A: Yes — as soon as a developer registers the new resource in the permission
tree, the matrix UI re-renders and shows it. You then tick the boxes you want
on each role. No DB migration, no redeploy required for the UI side.

**Q: Why did my user lose access after I unticked something on admin?**
A: Because admin permissions in v2 are real — they're not a bypass. Re-tick
the box and Save.

**Q: Can a user have two roles?**
A: At the schema level, yes — the database join table is many-to-many.
**The UI today exposes single-role assignment** via the Users-tab dropdown
(simplest mental model). Use **Extras** for the one-off bonus case. If you
need multi-role assignment, talk to the dev team — the data model supports it.

**Q: Does deleting a user clean up their roles?**
A: Yes — the `UserAppRole` join rows cascade with the user record.

**Q: I changed permissions on a role. Do users have to log out and back in?**
A: No. The next request to the server reads fresh grants. The client-side
sidebar refreshes within seconds via the `/api/me/permissions` cache.

---

<a id="part-2"></a>

# Part 2 — Developer Reference

This part is for engineers extending or debugging the system. It assumes you
have read Part 1 so you know what the UI does.

---

<a id="architecture"></a>

## Architecture overview

```
   ┌────────────────────────────────────────────────────────────────┐
   │  Browser                                                       │
   │  ┌──────────────────────────────────────────────────────────┐  │
   │  │  React UI (app/(dashboard)/org-setup/users/components)   │  │
   │  │   - RolesTab          - RolePermissionMatrix             │  │
   │  │   - UserPermissionsPanel                                 │  │
   │  └──────────────────────────────────────────────────────────┘  │
   │  ┌──────────────────────────────────────────────────────────┐  │
   │  │  useMyPermissions()  → calls GET /api/me/permissions     │  │
   │  │  Sidebar uses .has() to filter NAV_ITEMS                 │  │
   │  └──────────────────────────────────────────────────────────┘  │
   └──────────────────────────────┬─────────────────────────────────┘
                                  │  HTTPS
                                  ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  Next.js Route Handlers (apps/quikscale/app/api)               │
   │                                                                │
   │  /api/org/roles/...        — role CRUD                         │
   │  /api/org/roles/[id]/permissions  — matrix PUT                 │
   │  /api/org/roles/[id]/members      — bulk reconcile             │
   │  /api/org/users/[id]/role         — single-role assignment     │
   │  /api/org/users/[id]/permissions  — per-user extras            │
   │  /api/me/permissions              — effective set + seeding    │
   │                                                                │
   │  Each handler:                                                 │
   │   1. requireAdmin / getTenantId  (auth)                        │
   │   2. Zod validate body                                         │
   │   3. userCan(...) where needed                                 │
   │   4. preventAdminLockout guards on mutating routes             │
   │   5. Prisma write                                              │
   │   6. NextResponse { success, data | error }                    │
   └──────────────────────────────┬─────────────────────────────────┘
                                  │
                                  ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  Prisma → Postgres (schema "app_quikscale")                    │
   │                                                                │
   │   AppRole                  — roles per (org, app)              │
   │   UserAppRole              — user ↔ role join                  │
   │   RolePermission           — role's (resource, action) grants  │
   │   UserPermissionExtra      — per-user additive grants          │
   │   (plus shared App / Org / User tables in "quikit" schema)     │
   └────────────────────────────────────────────────────────────────┘
```

**Single source of truth for the permission shape** is
[apps/quikscale/lib/api/permissionsRegistry.ts](apps/quikscale/lib/api/permissionsRegistry.ts) — every UI tree, server
validator, and seeder reads from there. Adding a new resource means editing
that one file.

---

<a id="dual-system"></a>

## The dual role system — why two exist

⚠️ **The single most important thing in this doc.** QuikScale runs **two
parallel role models** that are not auto-synced:

| | Legacy | Dynamic v2 |
|---|---|---|
| Storage | `OrgMember.role` (string column on the membership row) | `UserAppRole` → `AppRole` |
| Values | `"admin"`, `"manager"`, `"member"`, ... (a small fixed set) | Any name; CRUDV grants per resource |
| Used by | `ROLE_HIERARCHY` (admin tier ≥ 5), the **shared** `requireAdmin()` factory | `userCan()`, the entire Roles & Permissions UI, the sidebar visibility logic |
| Edited by | Legacy invite path, some org-setup tooling | `PATCH /api/org/users/[id]/role` (which **does NOT touch the legacy column**) |

**The trap:** if you promote Carol to admin in the v2 UI, her
`OrgMember.role` stays at `"member"`. Every shared-factory `requireAdmin()`
gate would then 403 her even though she's "admin" in v2.

**The fix in place since 2026-05-18:**
[apps/quikscale/lib/api/requireAdmin.ts](apps/quikscale/lib/api/requireAdmin.ts) — a thin wrapper that injects an
`extraAdminCheck` into the shared factory. It passes if **either** the legacy
tier is admin-grade **OR** the user holds an active v2 system-admin grant
for this org's QuikScale app.

```ts
export const requireAdmin = createRequireAdmin(authOptions, {
  async extraAdminCheck({ userId, orgId }) {
    const appId = await getQuikScaleAppId();
    if (!appId) return false;
    const v2Admin = await db.userAppRole.findFirst({
      where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
      select: { id: true },
    });
    return !!v2Admin;
  },
});
```

**Rule:** in QuikScale routes, **always import `requireAdmin` from
`@/lib/api/requireAdmin`**, never directly from `@quikit/auth/require-admin`.
If you ever rewrite the role-assignment flow to also sync `OrgMember.role`,
the wrapper can be simplified back to the bare factory.

---

<a id="schema"></a>

## Database schema (5 models)

All in the Postgres schema `app_quikscale`. Migration:
`packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql`
(uses `CREATE TABLE IF NOT EXISTS` — idempotent).

```
   ┌──────────────────────────────────────────────────────────┐
   │ AppRole                                                  │
   │  id           uuid (pk)                                  │
   │  orgId        fk → quikit.Organization                   │
   │  appId        fk → quikit.App                            │
   │  name         text         "admin", "Member", ...        │
   │  description  text                                       │
   │  isSystem     bool         protects rename/delete only   │
   │  isDefault    bool         new invitees auto-assigned    │
   │  createdAt    timestamptz                                │
   │  UNIQUE (orgId, appId, name)                             │
   └────────────────────┬─────────────────────────────────────┘
                        │ 1:N
                        ▼
   ┌──────────────────────────────────────────────────────────┐
   │ RolePermission                                           │
   │  id           uuid (pk)                                  │
   │  roleId       fk → AppRole                               │
   │  resource     text          e.g. "OPSP.History"          │
   │  action       text          "view"|"create"|"update"|... │
   │  UNIQUE (roleId, resource, action)                       │
   └──────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │ UserAppRole       (the "user has role" join)             │
   │  id           uuid (pk)                                  │
   │  userId       fk → quikit.User                           │
   │  orgId        fk → quikit.Organization                   │
   │  roleId       fk → AppRole                               │
   │  assignedBy   nullable fk → User                         │
   │  assignedAt   timestamptz                                │
   │  UNIQUE (userId, orgId, roleId)                          │
   └──────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │ UserPermissionExtra   (per-user additive grants)         │
   │  id           uuid (pk)                                  │
   │  orgId        fk                                         │
   │  userId       fk                                         │
   │  resource     text                                       │
   │  action       text                                       │
   │  UNIQUE (orgId, userId, resource, action)                │
   └──────────────────────────────────────────────────────────┘
```

The 5th model historically referenced — `RoleNavigation` — has been **removed**.
Sidebar visibility is now derived from entity `view` grants via the
`NAV_RESOURCE` map in the registry.

---

<a id="registry"></a>

## Permission registry — single source of truth

File: [apps/quikscale/lib/api/permissionsRegistry.ts](apps/quikscale/lib/api/permissionsRegistry.ts)

**Why local (not in `@quikit/shared`):** scope constraint — quikscale-only
changes. See `[[feedback-quikscale-only]]`.

```
   PERMISSION_TREE: PermissionModule[]
     │
     ├── { key: "Dashboard",  leaves: [...] }
     ├── { key: "KPI",        leaves: [Individual KPI, Team KPI] }
     ├── { key: "Priority",   leaves: [...] }
     ├── { key: "OrgSetup",   leaves: [Teams, Users, Quarter] }
     ├── { key: "WWW",        leaves: [...] }
     ├── { key: "ClientMeetings", leaves: [Dashboard, Master, Member, Daily, Weekly] }
     ├── { key: "OPSP",       subModules: [
     │       { Create,  leaves: [OPSP.Create] },
     │       { History, leaves: [OPSP.History],
     │                  subModules: [{ EditFinalize, leaves: [OPSP.History.EditFinalize] }] },
     │       { Review,  leaves: [OPSP.Review] },
     │       { Categories, leaves: [OPSP.Categories] },
     │     ] }
     ├── { key: "Analytics",  leaves: [Scorecard, Individual, Teams, Trends] }
     └── { key: "People",     leaves: [Cycle, Goals, Self, Reviews, OneOnOne, Feedback, Talent] }
```

**Exports (use these, do not reinvent):**

| Export | Purpose |
|---|---|
| `ACTIONS` | `["view", "create", "update", "delete"]` |
| `PERMISSION_TREE` | Drives the matrix UI |
| `NAV_RESOURCE` | `{ "kpi.individual": "KPI", ... }` — sidebar key → resource |
| `walkLeaves()` | Generator over every leaf in the tree |
| `allPermissionPairs()` | Flat list of every valid `(resource, action)` |
| `isResource`, `isAction` | Type-guard predicates |
| `isValidPermissionPair(resource, action)` | What the PUT endpoint uses to reject garbage |
| `LEGACY_RESOURCE_BACKFILL` | Maps old flat keys to new dot-namespaced ones |

**Special leaves:**

- **`OPSP.History.EditFinalize`** — declares `actions: ["update"]` only. When
  granted, the OPSP History page's Edit button stays enabled even on
  finalized/reviewed OPSPs, and the editor's `isLocked` predicate flips so
  the form is editable.

---

<a id="server-checks"></a>

## Server-side checks: `userCan`, `requireAdmin`, `forbidden`

File: [apps/quikscale/lib/api/permissions.ts](apps/quikscale/lib/api/permissions.ts)

```ts
import { userCan, forbidden } from "@/lib/api/permissions";

export async function POST(req: NextRequest) {
  const { userId, orgId } = await getTenantId();      // shared @quikit/auth
  if (!(await userCan(userId, orgId, "KPI", "create"))) return forbidden();
  // ... happy path
}
```

**Decision logic of `userCan`:**

```
   userCan(userId, orgId, resource, action)
        │
        ├─ Validate inputs via isResource / isAction       ──► false on bad input
        │
        ├─ Resolve the QuikScale appId (cached for the
        │  lifetime of the process)
        │
        ├─ Query 1: RolePermission where
        │    resource = X AND action = Y AND
        │    role.appId = quikscaleAppId AND
        │    role.members ANY (userId, orgId)
        │  → exists?  ───► return TRUE
        │
        └─ Query 2: UserPermissionExtra (userId, orgId, resource, action)
              exists? ───► return TRUE  else FALSE
```

**No admin bypass.** Admin gets access because admin's `RolePermission` rows
are seeded with every pair from the registry — not because of an `if isAdmin`
shortcut.

**`requireAdmin`** is the wrapper described in [Dual system](#dual-system).
Use it for route-level admin gating on top of or instead of `userCan` checks
when the route is "admin only, full stop."

**`loadMyPermissions(userId, orgId)`** computes the effective set for the
client (powers `useMyPermissions`). Returns
`{ isAdmin, roleId, roleName, permissions[], extras[] }`. Triggered by
`GET /api/me/permissions`, which also kicks off [seeding](#seeding).

---

<a id="client-checks"></a>

## Client-side checks: `useMyPermissions` hook

File: [apps/quikscale/lib/hooks/useMyPermissions.ts](apps/quikscale/lib/hooks/useMyPermissions.ts)

```tsx
const { has, isAdmin, isLoading } = useMyPermissions();

if (isLoading) return <Skeleton />;
return (
  <>
    {has("KPI", "create") && <button>+ New KPI</button>}
    {isAdmin && <AdminPanel />}
  </>
);
```

- Hits `GET /api/me/permissions` once on mount, cached via TanStack Query.
- `has(resource, action)` is a pure lookup against the loaded permission set.
- The sidebar uses this hook to filter `NAV_ITEMS` — items without a `view`
  grant on their mapped `NAV_RESOURCE` are not rendered.

> **Client-side checks are UX, not security.** A user who tampers with the
> client cache cannot bypass the server's `userCan`. Always gate the actual
> mutation server-side.

---

<a id="seeding"></a>

## Seeding — what happens on the first request

File: [apps/quikscale/lib/api/seedAdminAppRole.ts](apps/quikscale/lib/api/seedAdminAppRole.ts)

Triggered by `GET /api/me/permissions` on every authenticated request. An
in-process map caches "I already seeded this org" for **5 minutes** per process
to keep the real DB work to once per cold cache.

```
   seedAllDefaultRoles(orgId)
            │
            ├─ Cache hit?  ─► fetch admin + member role ids, return
            │
            ├─ migrateUserToMember(orgId)
            │     (one-time rename: any "User" row → "Member"
            │      on existing orgs from before the rename)
            │
            ├─ seedAdminAppRole(orgId)
            │     - upsert AppRole(name="admin", isSystem=true)
            │     - if RolePermission count = 0:
            │         insert every pair from allPermissionPairs()
            │     - returns adminRoleId
            │
            ├─ seedMemberAppRole(orgId)
            │     - upsert AppRole(name="Member", isSystem=false, isDefault=true)
            │     - demote any other isDefault role to false first
            │     - if RolePermission count = 0:
            │         insert MEMBER_DEFAULT_GRANTS
            │           (Dashboard:view + KPI/TeamKPI/Priority/WWW: full CRUDV)
            │     - returns memberRoleId
            │
            ├─ backfillLegacyResources(orgId)
            │     - find RolePermission rows with old flat keys ("OPSP", "Individual")
            │     - for each, upsert equivalents in the new dot-namespaced keys
            │     - delete the legacy rows
            │     - transactional, idempotent
            │
            ├─ backfillAdminPermissions(orgId)
            │     - find pairs in registry NOT on admin role
            │     - insert them
            │       (so admins of long-lived orgs gain access to NEW resources)
            │
            ├─ backfillMemberPermissions(orgId)
            │     - same, against MEMBER_DEFAULT_GRANTS
            │
            └─ cache this orgId for 5 minutes; return ids
```

**Guarantees:**
- Idempotent. Re-running does not re-grant already-existing pairs (`skipDuplicates: true`).
- Does not overwrite admin un-checks. Backfill only ADDS; it never removes.
- One default role at a time. Setting a new default demotes the previous one.

---

<a id="lockout-guard"></a>

## Admin lockout guard

File: [apps/quikscale/lib/api/preventAdminLockout.ts](apps/quikscale/lib/api/preventAdminLockout.ts)

The v2 model removes the admin bypass, so a careless admin can revoke
themselves. Three exported guards stand in the way:

| Guard | Wired into | What it refuses |
|---|---|---|
| `assertWouldNotEmptyAdmin({orgId, userId})` | `PATCH /api/org/users/[id]/role` (admin demotion path) | Demoting the only remaining admin |
| `assertReconcileLeavesAdminPopulated({orgId, roleId, nextUserIds})` | `PUT /api/org/roles/[id]/members` | Reconciling the admin role's member list to `[]` |
| `assertRoleDeletable({orgId, roleId})` | `DELETE /api/org/roles/[id]` | Deleting a system role; returns the member count for a "X users will lose access" confirm |

All three throw `AdminLockoutError` — route handlers catch and return **409**
+ the message.

**Mitigation for case (a) — fully blank admin permissions:** not enforced by
the guard. The matrix UI surfaces a warning, and the user can re-tick at any
time. `userCan` naturally returns `false` for an empty role.

---

<a id="sequence-diagram"></a>

## Full request-time flow (sequence diagram)

```
   User clicks "+ New KPI" in the KPI page
           │
           ▼
   Client: useMyPermissions().has("KPI", "create")
           │  ─── cached from earlier GET /api/me/permissions
           ▼
   Button rendered (or hidden if false) — UX gate only
           │
           ▼
   User clicks. Client POSTs /api/kpi  { name, owner, ... }
           │
           ▼
   ┌─── route handler ───────────────────────────────────────┐
   │  1. await getTenantId()             // shared @quikit/auth
   │       resolves { userId, orgId } from JWT/session       │
   │                                                          │
   │  2. await Zod.parseAsync(body)      // schema validation │
   │                                                          │
   │  3. if (!await userCan(userId, orgId, "KPI", "create"))  │
   │       return forbidden()            // 403, single line  │
   │                                                          │
   │  4. await db.kpi.create({ data: ..., tenantId: orgId })  │
   │                                                          │
   │  5. return NextResponse.json({ success: true, data }, 201)│
   └──────────────────────────────────────────────────────────┘
           │
           ▼
   Server reaches userCan ──► Postgres
   ┌─ RolePermission JOIN UserAppRole WHERE userId,orgId,resource=KPI,action=create
   │   EXISTS?  ─► true  → handler proceeds
   │   no?      ─► UserPermissionExtra WHERE userId,orgId,KPI,create
   │                EXISTS? ─► true → proceeds
   │                no?     ─► forbidden()
   └──
           │
           ▼
   Response to client → optimistic update / refetch
```

For comparison, the **role-management mutation flow** (admin changing a role):

```
   Admin ticks a checkbox in RolePermissionMatrix → clicks Save
           │
           ▼
   PUT /api/org/roles/{roleId}/permissions  { permissions: [{resource, action}, ...] }
           │
           ▼
   ┌─── route handler ───────────────────────────────────────┐
   │  1. requireAdmin(req)               // QuikScale wrapper │
   │     → checks legacy tier OR v2 system-admin grant        │
   │  2. Validate each pair via isValidPermissionPair         │
   │     → 400 if any pair is rejected                        │
   │  3. db.$transaction:                                     │
   │       deleteMany({ roleId })                             │
   │       createMany({ data: permissions.map(...) })         │
   │  4. NextResponse.json({ success: true, data: ... })      │
   └──────────────────────────────────────────────────────────┘
           │
           ▼
   Next request from any user on this role sees fresh grants.
   /api/me/permissions cache refresh on the affected users
   happens within seconds via TanStack Query stale-time.
```

---

<a id="api-surface"></a>

## API surface — every route at a glance

All routes live under `apps/quikscale/app/api/org/...` and follow the
[CLAUDE.md API Route Pattern](CLAUDE.md) (auth → Zod → DB → `{success, data|error}`).

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/org/roles` | List roles + member counts |
| POST | `/api/org/roles` | Create role |
| GET | `/api/org/roles/[id]` | Role detail |
| PATCH | `/api/org/roles/[id]` | Rename / set default (isSystem rename blocked) |
| DELETE | `/api/org/roles/[id]` | Delete role (system + lockout protected) |
| GET | `/api/org/roles/[id]/permissions` | Current matrix state |
| PUT | `/api/org/roles/[id]/permissions` | Replace matrix; validates every pair |
| GET | `/api/org/roles/[id]/navigation` | Nav whitelist (rarely edited) |
| PUT | `/api/org/roles/[id]/navigation` | Replace nav whitelist |
| GET | `/api/org/roles/[id]/members` | Members on this role |
| PUT | `/api/org/roles/[id]/members` | Reconcile members; lockout-guarded for admin |
| GET | `/api/org/users/[id]/permissions` | A user's role grants + extras |
| POST | `/api/org/users/[id]/permissions` | Replace that user's extras atomically |
| PATCH | `/api/org/users/[id]/role` | Single-role swap; lockout-guarded |
| GET | `/api/me/permissions` | Effective set for the current user + seed orchestrator |

All mutating routes use `requireAdmin` from `@/lib/api/requireAdmin`. All
read routes use `getTenantId` and filter by `orgId`.

---

<a id="add-resource"></a>

## How to add a new permission resource

The whole point of v2 is that this is **one file**.

1. Open [apps/quikscale/lib/api/permissionsRegistry.ts](apps/quikscale/lib/api/permissionsRegistry.ts).
2. Find the module that owns the new resource (or add a new module).
3. Add a leaf:

   ```ts
   { resource: "Goals.Backlog", label: "Goals Backlog", actions: ACTIONS }
   ```

4. If the new resource is also a sidebar item, add an entry to `NAV_RESOURCE`:

   ```ts
   "goals.backlog": "Goals.Backlog",
   ```

   and add the matching `moduleKey` to the sidebar navigation constant in
   `components/dashboard/sidebar.tsx`.

5. Gate the API route(s) with `userCan(userId, orgId, "Goals.Backlog", "view")` etc.

That's it. Behavior on the next request:

- The matrix UI renders the new resource automatically.
- `seedAdminAppRole` is a no-op for THIS role since admin already has rows; but
  `backfillAdminPermissions` runs on every seed pass and inserts the new pair.
- The Member role won't get the new grant by default — admins tick it explicitly.

**You do not need a DB migration.** Resources are open strings in
`RolePermission.resource`. No enum, no constraint to update.

---

<a id="files-cheat-sheet"></a>

## Files & locations cheat-sheet

| Concern | File |
|---|---|
| Schema | `packages/database/prisma/schema.prisma` (look in `@@schema("app_quikscale")` block, around line 911–1020) |
| Migration | `packages/database/prisma/migrations/20260512130000_dynamic_roles_v2/migration.sql` |
| Registry | [apps/quikscale/lib/api/permissionsRegistry.ts](apps/quikscale/lib/api/permissionsRegistry.ts) |
| Server checks | [apps/quikscale/lib/api/permissions.ts](apps/quikscale/lib/api/permissions.ts) |
| `requireAdmin` bridge | [apps/quikscale/lib/api/requireAdmin.ts](apps/quikscale/lib/api/requireAdmin.ts) |
| Seeding | [apps/quikscale/lib/api/seedAdminAppRole.ts](apps/quikscale/lib/api/seedAdminAppRole.ts) |
| Lockout guard | [apps/quikscale/lib/api/preventAdminLockout.ts](apps/quikscale/lib/api/preventAdminLockout.ts) |
| Client hook | [apps/quikscale/lib/hooks/useMyPermissions.ts](apps/quikscale/lib/hooks/useMyPermissions.ts) |
| UI components | [apps/quikscale/app/(dashboard)/org-setup/users/components/](apps/quikscale/app/(dashboard)/org-setup/users/components/) (`RolesTab`, `RolePermissionMatrix`, `UserPermissionsPanel`) |
| OPSP `EditFinalize` gates | [apps/quikscale/app/(dashboard)/opsp/history/page.tsx](apps/quikscale/app/(dashboard)/opsp/history/page.tsx) (Edit button), [apps/quikscale/app/(dashboard)/opsp/page.tsx](apps/quikscale/app/(dashboard)/opsp/page.tsx) (`isLocked`) |

---

<a id="gotchas"></a>

## Gotchas the next engineer will hit

1. **Don't import `requireAdmin` from `@quikit/auth/require-admin` directly.**
   It bypasses the v2 admin bridge — any user promoted via the v2 UI will 403.
   Always import from `@/lib/api/requireAdmin`.

2. **Don't put resource constants in `@quikit/shared`.** Scoped out by the
   quikscale-only rule (`[[feedback-quikscale-only]]`). The registry lives
   inside the app on purpose.

3. **Don't reintroduce an admin bypass in `userCan`.** Admin permissions are
   intentionally real and editable. If a route needs "admin only, full stop"
   semantics, gate it with `requireAdmin`, not with a `userCan` shortcut on
   a forged action.

4. **Sidebar permission for a new nav item needs BOTH ends:** an entry in
   `NAV_RESOURCE` (registry) **and** the matching `moduleKey` in
   `components/dashboard/sidebar.tsx`. Missing either side and the item is
   either always-visible or always-hidden.

5. **`RoleNavigation` is gone.** Old notes mention it; don't bring it back.
   Nav visibility derives from entity `view` grants.

6. **Backfill is additive only.** `backfillAdminPermissions` and
   `backfillMemberPermissions` only ADD missing rows. They never overwrite
   admin un-checks — that's a deliberate property, not a bug.

7. **The "User" → "Member" rename** is handled by `migrateUserToMember` and
   runs on every seed pass for existing orgs. Don't add a second migration
   for the same thing.

8. **OPSP `isLocked` predicate depends on `OPSP.History.EditFinalize`.** When
   gating Edit on finalized OPSPs, check **both** the user's permission AND
   the OPSP's status — see `app/(dashboard)/opsp/page.tsx`.

9. **`/api/me/permissions` does real DB work on the first request per
   process per org** (the seeding orchestrator). The 5-minute in-process
   cache makes this OK; don't move the seed call out unless you replace
   the cache with something equivalent.

10. **Tenant isolation is non-negotiable.** Every Prisma query in this system
    filters by `orgId`. Cross-org reads in this code path have been a real
    bug class — keep the filter on every new query.

---

*End of guide.*
