import { NextRequest, NextResponse } from "next/server";
import { db as dbCentral } from "@quikit/database";
import {
  findUserByIdCentral,
  updateUserCentral,
  softDeleteUserCentral,
} from "@/lib/users/central-repository";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikInfraAppId } from "@/lib/rbac/userCan";
import {
  MENU_CATALOG,
  MODULE_KEY_TO_MENU_MODULE,
  mergeModulesWithMatrix,
  type PermissionMatrix,
} from "@/lib/rbac/menu-catalog";
import {
  applyModuleRevokes,
  modulesFromRevokes,
} from "@/lib/rbac/applyModuleRevokes";
import {
  applyProjectAccess,
  loadProjectAccess,
} from "@/lib/rbac/applyProjectAccess";
import {
  matrixToRevokes,
  revokesToMatrix,
  managedPairs,
} from "@/lib/rbac/matrixV2Bridge";

const auth = withOrgAuthForResource("construction.users");

/**
 * Individual-user API: GET / PUT / PATCH / DELETE /api/settings/users/:id.
 *
 * Backed by Postgres (`cn_users` via Prisma) — matching the list endpoint.
 * The earlier implementation read from the in-memory demo-store which has
 * no overlap with the real DB IDs, so the permissions page always
 * failed with "Failed to load user". This version consults the same
 * repository as the list and the login flow.
 */

export const GET = auth.manage<{ id: string }>(async (authCtx, _req, { params }) => {
  const row = await findUserByIdCentral(authCtx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Phase 4+5: derive modulesAssigned + projectsAssigned from v2 tables.
  // Also override acceptedAt + lastLoginAt with the central sources so
  // the status badge reflects "Active" once the user accepts the invite
  // via the launcher (cn_users.acceptedAt is never updated by that flow).
  let derivedModules = row.modulesAssigned;
  let derivedProjects = row.projectsAssigned;
  let derivedAcceptedAt: string | null = row.acceptedAt ?? null;
  let derivedLastLoginAt: string | null = row.lastLoginAt ?? null;
  // Item 6: matrix now also derived from v2 revoke rows.
  let derivedMatrix: Record<string, Partial<Record<string, boolean>>> | null =
    row.permissionMatrix ?? null;
  try {
    const authUser = await (dbCentral as any).user.findUnique({
      where: { email: row.email },
      select: { id: true, lastSignInAt: true },
    });
    if (authUser) {
      const revokes = (await (dbCentral as any).cnUserPermissionExtra.findMany({
        where: { userId: authUser.id, orgId: authCtx.orgId, revoke: true },
        select: { resource: true, action: true },
      })) as Array<{ resource: string; action: string }>;
      derivedModules = modulesFromRevokes(revokes);
      derivedProjects = await loadProjectAccess(
        dbCentral as never,
        authUser.id,
        authCtx.orgId,
      );
      derivedMatrix = revokesToMatrix(revokes);
      derivedLastLoginAt = authUser.lastSignInAt
        ? (authUser.lastSignInAt as Date).toISOString()
        : derivedLastLoginAt;

      const orgMember = await (dbCentral as any).orgMember.findUnique({
        where: {
          orgId_userId: { orgId: authCtx.orgId, userId: authUser.id },
        },
        select: { acceptedAt: true },
      });
      derivedAcceptedAt = orgMember?.acceptedAt
        ? (orgMember.acceptedAt as Date).toISOString()
        : derivedAcceptedAt;
    }
  } catch {
    // Non-fatal — fall back to the legacy column values.
  }
  // Strip invite token before returning — never leak pending invite links.
  const { inviteToken: _t, ...safe } = row;
  return NextResponse.json({
    ...safe,
    modulesAssigned: derivedModules,
    projectsAssigned: derivedProjects,
    acceptedAt: derivedAcceptedAt,
    lastLoginAt: derivedLastLoginAt,
    permissionMatrix: derivedMatrix,
  });
});

interface UpdateAuthCtx { orgId: string; userId: string }

async function handleUpdate(req: NextRequest, id: string, ctx: UpdateAuthCtx) {
  const body = await req.json();

  // If the role is being changed, validate against the org's CnAppRole
  // catalog. Accepts both the legacy uppercase enum ("ADMIN") and the
  // new lowercase role names ("admin", "ho_user", "purchase_manager", …).
  let roleSwapTo: { id: string; name: string } | null = null;
  if (body.userType !== undefined || body.roleKey !== undefined) {
    const raw = typeof body.userType === "string" ? body.userType : body.roleKey;
    const lower = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    const normalised =
      lower === "super_admin" || lower === "company_admin" ? "admin" : lower;
    const appId = await getQuikInfraAppId();
    const role = appId
      ? await (dbCentral as any).cnAppRole.findFirst({
          where: { orgId: ctx.orgId, appId, name: normalised },
          select: { id: true, name: true },
        })
      : null;
    if (!role) {
      return NextResponse.json(
        { error: `Unknown role: ${raw}` },
        { status: 400 },
      );
    }
    // Normalise the field so downstream code (isAdminUserType check
    // below) sees the canonical lowercase role name. Keep the resolved
    // row around so the role swap is actually persisted on save.
    body.userType = normalised;
    roleSwapTo = role;
  }

  // Keep modulesAssigned in lock-step with permissionMatrix. The matrix is
  // the granular source of truth; modulesAssigned is a coarse cache the
  // sidebar uses for nav visibility. Whenever either one is being written:
  //
  //   - matrix only → derive modules from the matrix, load the user's
  //     current matrix if the payload didn't include one, so we never
  //     drop modules on a partial PATCH.
  //   - modules + matrix → union the explicit modules with whatever the
  //     matrix grants (admin ticking a row also auto-assigns that module).
  //   - modules only → union with the CURRENTLY-saved matrix so we don't
  //     silently drop modules the matrix still grants.
  //
  // Without this sync, the Edit User drawer shows stale module checkboxes
  // relative to what the permissions page just saved, and the sidebar
  // hides nav groups the user has effective rights on.
  let modulesAssigned: string[] | undefined = body.modulesAssigned;
  const matrixIncoming: PermissionMatrix | undefined =
    body.permissionMatrix && typeof body.permissionMatrix === "object"
      ? (body.permissionMatrix as PermissionMatrix)
      : undefined;
  const touchingMatrix = matrixIncoming !== undefined;
  const touchingModules = Array.isArray(modulesAssigned);
  let permissionMatrixToSave: PermissionMatrix | undefined = matrixIncoming;
  if (touchingMatrix || touchingModules) {
    // Resolve an effective matrix: the incoming patch if present, otherwise
    // the one already persisted. Same for modules. This keeps partial
    // PATCHes from clobbering the non-touched side.
    const current = touchingMatrix && touchingModules
      ? null
      : await findUserByIdCentral(ctx.orgId, id);
    const effectiveMatrix = matrixIncoming ??
      (current?.permissionMatrix as PermissionMatrix | null | undefined) ??
      null;
    const explicitModules = touchingModules
      ? (modulesAssigned as string[])
      : (current?.modulesAssigned ?? []);
    modulesAssigned = mergeModulesWithMatrix(explicitModules, effectiveMatrix);

    // Auto-grant the pages of any assigned module that currently has zero
    // rights in the matrix. Covers both the "module just ticked on Edit
    // User" case and the historical case where the module was assigned
    // earlier but its pages were never granted (matrix saved before the
    // module was added). Modules with even one row already granted are
    // left alone so admin tweaks are preserved. Removing a module never
    // revokes — admins use the Permissions page for that.
    if (touchingModules && !touchingMatrix && current) {
      const base = (current.permissionMatrix as PermissionMatrix | null) ?? {};
      const requestedModules = body.modulesAssigned as string[];
      const merged: PermissionMatrix = { ...base };
      let changed = false;
      for (const moduleKey of requestedModules) {
        const menuModule = MODULE_KEY_TO_MENU_MODULE[moduleKey];
        if (!menuModule) continue;
        const rows = MENU_CATALOG.filter((item) => item.module === menuModule);
        const hasAnyGrant = rows.some((item) => {
          const r = base[item.key];
          return r && (r.add || r.edit || r.delete || r.view);
        });
        if (hasAnyGrant) continue;
        for (const item of rows) {
          merged[item.key] = {
            add: item.supports.add,
            edit: item.supports.edit,
            delete: item.supports.delete,
            view: item.supports.view,
          };
          changed = true;
        }
      }
      if (changed) permissionMatrixToSave = merged;
    }
  }

  // Step E: writes flow to central tables (auth.User + User_profiles +
  // OrgMember). The legacy cn_users updateUser is no longer called.
  // Accept either body.fullName (legacy) or firstName+lastName (new).
  let firstName = body.firstName;
  let lastName = body.lastName;
  if (firstName === undefined && lastName === undefined && body.fullName) {
    const parts = String(body.fullName).trim().split(/\s+/).filter(Boolean);
    firstName = parts[0] ?? undefined;
    lastName = parts.slice(1).join(" ") || undefined;
  }
  const updated = await updateUserCentral(ctx.orgId, id, {
    firstName,
    lastName,
    mobile: body.mobile,
    department: body.department,
    mobileAccessEnabled: body.mobileAccessEnabled,
    // Phase 4 / 5 / Item 6: modulesAssigned / projectsAssigned /
    // permissionMatrix are reconciled below by the v2 sync blocks —
    // not passed to the repository.
    status: body.status,
    updatedBy: ctx.userId,
  });

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Phase 4: when the admin touches modules on Edit, reconcile the
  // revoke set against the new tick list. Skipped for the admin role
  // (admins see everything) and skipped when no modules were touched.
  const tickedModules: string[] = Array.isArray(modulesAssigned)
    ? modulesAssigned.filter(
        (m): m is string => typeof m === "string" && m.length > 0,
      )
    : [];
  // After normalisation `body.userType` is lowercase; `updated.userType`
  // (from central-repository) is still uppercase for the 4 system roles.
  // Accept either casing.
  const isAdminUserType =
    (body.userType ?? updated.userType ?? "").toString().toLowerCase() === "admin";
  // Look up auth.User.id once — role swap + module + project reconciliation
  // all need it, and we'd rather not run the lookup more than once.
  let authUserId: string | null = null;
  if (
    roleSwapTo ||
    touchingModules ||
    touchingMatrix ||
    Array.isArray(body.projectsAssigned)
  ) {
    try {
      const authUser = await (dbCentral as any).user.findUnique({
        where: { email: updated.email },
        select: { id: true },
      });
      authUserId = authUser?.id ?? null;
    } catch {
      // Non-fatal — sync skipped below.
    }
  }

  // Persist the chosen role into CnUserAppRole. One role per (user, org)
  // — delete any existing rows for this org's quikinfra app and create
  // the new one. Pre-existing CnUserPermissionExtra revokes survive (the
  // module + matrix sync blocks below will overwrite them if the admin
  // ticked anything new), so a role swap doesn't silently restore
  // permissions the admin previously took away.
  if (roleSwapTo && authUserId) {
    try {
      const appId = await getQuikInfraAppId();
      if (appId) {
        await (dbCentral as any).cnUserAppRole.deleteMany({
          where: { userId: authUserId, orgId: ctx.orgId, role: { appId } },
        });
        await (dbCentral as any).cnUserAppRole.create({
          data: {
            userId: authUserId,
            orgId: ctx.orgId,
            roleId: roleSwapTo.id,
            assignedBy: ctx.userId,
          },
        });
      }
    } catch {
      // Non-fatal — admin can retry by re-saving.
    }
  }

  if (
    touchingModules &&
    !isAdminUserType &&
    tickedModules.length > 0 &&
    authUserId
  ) {
    try {
      await applyModuleRevokes(
        dbCentral as never,
        authUserId,
        ctx.orgId,
        tickedModules,
        ctx.userId,
      );
    } catch {
      // Non-fatal — admin can retry by re-saving.
    }
  }

  // Phase 5: project access reconciliation. Mirrors the module-revoke
  // pattern but additive — the helper creates missing rows and deletes
  // extras so the table exactly matches the supplied tick list.
  if (Array.isArray(body.projectsAssigned) && authUserId) {
    const projectIds = (body.projectsAssigned as unknown[]).filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    try {
      await applyProjectAccess(
        dbCentral as never,
        authUserId,
        ctx.orgId,
        projectIds,
        ctx.userId,
      );
    } catch {
      // Non-fatal — admin can retry by re-saving.
    }
  }

  // Item 6: Permission-matrix reconciliation. The matrix JSON from the
  // body becomes a set of (resource, action) revoke rows on
  // CnUserPermissionExtra. Pairs WITHIN the matrix's universe but NOT
  // marked as revoked are cleared (delete revoke=true if exists).
  //
  // Skipped for admin role — admins bypass via wildcards anyway.
  if (touchingMatrix && !isAdminUserType && authUserId) {
    try {
      const desiredRevokes = matrixToRevokes(matrixIncoming ?? null);
      const desiredSet = new Set(
        desiredRevokes.map((r) => `${r.resource}:${r.action}`),
      );
      const universe = managedPairs();
      const toAdd = desiredRevokes;
      const toClear = universe.filter(
        (p) => !desiredSet.has(`${p.resource}:${p.action}`),
      );
      // Upsert revoke=true for cells the admin set to `false`.
      for (const p of toAdd) {
        await (dbCentral as any).cnUserPermissionExtra.upsert({
          where: {
            orgId_userId_resource_action: {
              orgId: ctx.orgId,
              userId: authUserId,
              resource: p.resource,
              action: p.action,
            },
          },
          update: { revoke: true },
          create: {
            orgId: ctx.orgId,
            userId: authUserId,
            resource: p.resource,
            action: p.action,
            revoke: true,
            grantedBy: ctx.userId,
          },
        });
      }
      // Clear revoke=true rows for cells the admin set to `true` (or absent).
      if (toClear.length > 0) {
        await (dbCentral as any).cnUserPermissionExtra.deleteMany({
          where: {
            orgId: ctx.orgId,
            userId: authUserId,
            revoke: true,
            OR: toClear.map((p) => ({
              resource: p.resource,
              action: p.action,
            })),
          },
        });
      }
    } catch {
      // Non-fatal — admin can retry by re-saving.
    }
  }

  const { inviteToken: _t, ...safe } = updated;
  return NextResponse.json(safe);
}

export const PUT = auth.manage<{ id: string }>(async (authCtx, req: NextRequest, { params }) => {
  return handleUpdate(req, params.id, { orgId: authCtx.orgId, userId: authCtx.userId });
});

export const PATCH = auth.manage<{ id: string }>(async (authCtx, req: NextRequest, { params }) => {
  return handleUpdate(req, params.id, { orgId: authCtx.orgId, userId: authCtx.userId });
});

export const DELETE = auth.manage<{ id: string }>(async (authCtx, _req, { params }) => {
  const ok = await softDeleteUserCentral(authCtx.orgId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
});
