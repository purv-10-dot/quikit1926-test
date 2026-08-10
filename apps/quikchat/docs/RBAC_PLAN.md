# QuikChat — RBAC & Permissions Implementation Plan (v2)

Grounded in the live platform RBAC code (packages/auth/*) and QuikScale's actual RBAC-v2 (apps/quikscale/lib/api/{permissions,permissionsRegistry,seedAdminAppRole,requireAdmin}.ts) — the canonical pattern to mirror. Four decisions locked (§6).

## 1. Problem
QuikChat has channel-level roles (QcChannelMember.role admin/member) but NO app-level RBAC, and is invisible to platform RBAC-v2 (app_quikchat has none of the RBAC-v2 tables). Any org member with UserAppAccess to quikchat can do everything.

## 2. Canonical model to adopt (QuikScale — verified)
Four tables in app_<slug>:
- AppRole { id, orgId, appId, name, description, isSystem, isDefault } — isSystem protects rename/delete (not a bypass); isDefault auto-assigned to invitees.
- UserAppRole { id, userId, orgId, roleId, assignedBy?, assignedAt } — one role per (user,org,app).
- RolePermission { roleId, resource, action } — @@unique([roleId,resource,action]).
- UserPermissionExtra { userId, orgId, resource, action } — per-user additive grants.
Code-side permission tree (in-app): modules→leaves {resource,label,actions[]}, actions view|create|update|delete. DB stores flat (resource,action); tree lives in code, drives the admin matrix UI + validates writes.
userCan(userId,orgId,resource,action) = role grants ∪ user extras. No admin bypass. isOrgAdmin ignores extras. loadMyPermissions powers /api/me/permissions.
Seeders idempotent, run from layout.tsx (5-min/org cache): admin (isSystem, all pairs), default role (isDefault, curated set), backfill on tree growth.
Admin bridge: createRequireAdmin(authOptions,{extraAdminCheck}) resolving v2 UserAppRole→AppRole(isSystem,name:"admin").
Feature gating (separate axis): AppModuleFlag + gateModuleApi/gateModuleRoute + OrgAppAccess hard gate; tree filtered by enabled modules.
Copy helpers: collapseToLatestRole (assignAppRoles is INSERT-only → stale rows), preventAdminLockout.

## 3. Roles (four — DECISION 1)
Admin (isSystem, all grants), Moderator, Member (isDefault), Guest. Channel role stays intra-channel; app roles are a superset; Guest is a participate-only floor.

## 4. Permission tree (resource:action)
- Channel: view/create/update/delete
- Channel.Public: create        (DECISION 2 — matrix cell org_admin ticks)
- Channel.DM: create
- Channel.Moderate: update/delete (DECISION 4 — matrix cell)
- Channel.InviteExternal: create
- Call: create ; Call.Group: create
- Assistant: view/create
- Assistant.IngestPrivate: create
- Assistant.IngestOrg: create    (DECISION 3 — Admin only)
- Assistant.Configure: update    (Admin only)
- App.Modules: update            (Admin only)

Default grants:
- Admin (isSystem): all pairs.
- Member (isDefault): Channel:view/create, Channel.DM:create, Call:create, Call.Group:create, Assistant:view/create, Assistant.IngestPrivate:create. NOT Channel.Public, Channel.Moderate, IngestOrg, config/settings.
- Moderator: Member + Channel.Moderate:update/delete.
- Guest: Channel:view only.
Decisions 2 & 4 = matrix cells an admin ticks; RolePermission IS the policy store (no QcOrgPolicy table).

## 5. Phases
Phase 1 — substrate (NO enforcement): four models in app_quikchat (mirror QuikScale's exact Prisma syntax), permission-tree registry, permissions.ts (userCan/isOrgAdmin/loadMyPermissions), idempotent seeders (Admin/Moderator/Member/Guest) run from layout.tsx, wire assignAppRoles (auto-detects the table). Roles exist+assignable+Admin-Portal-visible; zero user-facing change.
Phase 2 — enforcement: extraAdminCheck admin bridge; userCan gates on channel-create/public/DM/calls/assistant/ingest(private vs Admin-only org)/configure/moderation; Guest floor; /api/me/permissions + client gate.
Phase 3 — feature gating + admin UI: register modules (AppModuleFlag), permission-matrix UI (decisions 2&4 operable) + role management, requireAppAccess/gateTenantAppRoute.
Phase 4 (future) — align with platform AppPermission/ceiling model.

## 6. Locked decisions
1. Admin+Moderator+Member+Guest (all four, v1); Guest = participate-only floor.
2. Public-channel creation: org_admin decides → Channel.Public:create matrix cell (default Member off).
3. Assistant.IngestOrg: Admin only.
4. Moderation: org_admin decides → Channel.Moderate matrix cell (default Moderator+Admin).

## 7. Invariants
Adopt QuikScale's four-table + code-tree + userCan verbatim. Additive on top of tenant isolation, never a replacement; org-scoped queries always. Channel role = intra-channel; app roles = superset; Guest = floor. Source of truth UserAppRole→AppRole+RolePermission; UserAppAccess.role is the mirror. One role per (user,org) with collapseToLatestRole self-repair. Enforcement order: OrgAppAccess → AppModuleFlag → userCan → channel role → org-scoped query. Fail CLOSED on userCan.

## 8. Open before Phase 1
- Read QuikScale's exact AppRole/UserAppRole/RolePermission/UserPermissionExtra Prisma model blocks in schema.prisma (migration must copy exact syntax/indexes/relations).
- Confirm matrix-UI + MEMBER_DEFAULT_GRANTS file locations for Phase 3.
- Existing-org migration: default Member for current members; initial Admin — auto-promote OrgMember.role=org_admin, or explicit?