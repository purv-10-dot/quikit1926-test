import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  findUserByIdCentral,
  updateUserCentral,
  softDeleteUserCentral,
} from "@/lib/users/central-repository";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { logger } from "@/lib/observability/logger";
import { getQuikInfraAppId } from "@/lib/rbac/userCan";
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";
import { type PermissionMatrix } from "@/lib/rbac/menu-catalog";
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

// The 4 permission pairs that unlock Settings (Users / Roles / Workflows).
// Mirrors the invite flow so "Grant Settings access" behaves identically no
// matter which screen the admin saved from. Written as additive grants
// (revoke=false) so they survive the sub-admin settings-strip in getTenantContext.
const SETTINGS_PERMS = [
  { resource: "construction.settings", action: "manage" },
  { resource: "construction.users", action: "manage" },
  { resource: "construction.roles", action: "manage" },
  { resource: "construction.workflows", action: "manage" },
] as const;

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
    const authUser = await db.user.findUnique({
      where: { email: row.email },
      select: { id: true, lastSignInAt: true },
    });
    if (authUser) {
      const revokes = (await db.cnUserPermissionExtra.findMany({
        where: { userId: authUser.id, orgId: authCtx.orgId, revoke: true },
        select: { resource: true, action: true },
      })) as Array<{ resource: string; action: string }>;
      derivedModules = modulesFromRevokes(revokes);
      derivedProjects = await loadProjectAccess(
        db as never,
        authUser.id,
        authCtx.orgId,
      );
      derivedMatrix = revokesToMatrix(revokes);
      derivedLastLoginAt = authUser.lastSignInAt
        ? (authUser.lastSignInAt as Date).toISOString()
        : derivedLastLoginAt;

      const orgMember = await db.orgMember.findUnique({
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

  // Email edit: normalise (trim + lower-case, matching the create flow),
  // validate the format, and reject collisions with another account before
  // touching any row. `id` is the auth.User id, so a clash whose id equals
  // `id` is just the user's own unchanged email — allowed. The client only
  // sends `email` when it actually changed, so legacy rows with a malformed
  // email aren't blocked when the admin edits other fields.
  let emailToUpdate: string | undefined;
  if (body.email !== undefined) {
    const normalisedEmail = String(body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
    const clash = await db.user.findUnique({
      where: { email: normalisedEmail },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      return NextResponse.json(
        { error: `A user with email "${normalisedEmail}" already exists` },
        { status: 409 },
      );
    }
    emailToUpdate = normalisedEmail;
  }

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
      ? await db.cnAppRole.findFirst({
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
  // sidebar uses for nav visibility.
  let modulesAssigned: string[] | undefined = body.modulesAssigned;
  const matrixIncoming: PermissionMatrix | undefined =
    body.permissionMatrix && typeof body.permissionMatrix === "object"
      ? (body.permissionMatrix as PermissionMatrix)
      : undefined;
  const touchingMatrix = matrixIncoming !== undefined;
  const touchingModules = Array.isArray(modulesAssigned);
  if (touchingMatrix || touchingModules) {
    // Load the current record only when we need the non-touched side.
    const current = touchingMatrix && touchingModules
      ? null
      : await findUserByIdCentral(ctx.orgId, id);

    // modulesAssigned: the admin's explicit tick list is authoritative.
    // Do NOT union with matrix-derived modules — that would re-add every
    // module whose role grants still carry an un-revoked view action,
    // making an admin's untick a no-op and auto-selecting sub-modules the
    // admin never chose.
    modulesAssigned = touchingModules
      ? (body.modulesAssigned as string[])
      : (current?.modulesAssigned ?? []);

    // Page-level grants for a newly ticked module are written by
    // applyModuleRevokes below (against CnUserPermissionExtra, the real
    // store). Nothing to merge into the legacy matrix column here — it is
    // no longer persisted; the matrix is a view over the revoke rows.
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
    email: emailToUpdate,
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
  // When the admin edits modules from the Edit User drawer (modules only,
  // no matrix), their ticked list is AUTHORITATIVE: ticking grants a module
  // and UNTICKING revokes it. Use the explicit body list here — NOT the
  // matrix-merged `modulesAssigned`, which re-adds an unticked module
  // whenever the role/matrix still grants it and so makes the untick a
  // no-op. When a permission matrix is being saved, the per-cell
  // reconciliation block below is the source of truth instead.
  const authoritativeModules =
    touchingModules && !touchingMatrix && Array.isArray(body.modulesAssigned)
      ? (body.modulesAssigned as unknown[])
      : modulesAssigned;
  const tickedModules: string[] = Array.isArray(authoritativeModules)
    ? authoritativeModules.filter(
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
  // `authUserLookupError` captures a DB failure so the module sync below can
  // tell "this user simply has no login account" apart from "the lookup itself
  // errored" when it surfaces the failure to the admin.
  let authUserId: string | null = null;
  let authUserLookupError: string | null = null;
  if (
    roleSwapTo ||
    touchingModules ||
    touchingMatrix ||
    Array.isArray(body.projectsAssigned)
  ) {
    try {
      const authUser = await db.user.findUnique({
        where: { email: updated.email },
        select: { id: true },
      });
      authUserId = authUser?.id ?? null;
    } catch (error: unknown) {
      authUserLookupError =
        error instanceof Error ? error.message : "lookup failed";
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
        await db.cnUserAppRole.deleteMany({
          where: { userId: authUserId, orgId: ctx.orgId, role: { appId } },
        });
        await db.cnUserAppRole.create({
          data: {
            userId: authUserId,
            orgId: ctx.orgId,
            roleId: roleSwapTo.id,
            assignedBy: ctx.userId,
          },
        });
        // Keep the central UserAppAccess.role mirror (what the Admin Portal
        // shows) in sync with the role just assigned in QuikInfra.
        await mirrorAppRoleToCentral(db, {
          orgId: ctx.orgId,
          userId: authUserId,
          appId,
          roleName: roleSwapTo.name,
        });
      }
    } catch {
      // Non-fatal — admin can retry by re-saving.
    }
  }

  // Settings access reconciliation. The Edit User drawer sends `enableSettings`
  // (the "Grant Settings access" checkbox, only shown for the admin role), but
  // this PUT handler previously ignored it — only the invite flow and the
  // dedicated role-swap route wrote the settings extras. As a result ticking
  // the box here never persisted: the grant was dropped, the sidebar kept
  // Settings hidden, and the checkbox reverted to unchecked on reopen. Mirror
  // the role-swap route: grant the 4 settings extras when (role = admin AND
  // enableSettings), otherwise strip them. Only runs when the client actually
  // sent the flag (a status-only PATCH omits it, leaving settings untouched).
  if (body.enableSettings !== undefined) {
    if (!authUserId) {
      return NextResponse.json(
        {
          error: authUserLookupError
            ? `Settings access was not saved — failed to look up this user's login account: ${authUserLookupError}`
            : "Settings access was not saved — this user has no login account yet. Ask them to accept their invite (or verify their email address), then try again.",
        },
        { status: 422 },
      );
    }
    const grantSettings = isAdminUserType && body.enableSettings === true;
    try {
      if (grantSettings) {
        for (const p of SETTINGS_PERMS) {
          await db.cnUserPermissionExtra.upsert({
            where: {
              orgId_userId_resource_action: {
                orgId: ctx.orgId,
                userId: authUserId,
                resource: p.resource,
                action: p.action,
              },
            },
            update: { revoke: false },
            create: {
              orgId: ctx.orgId,
              userId: authUserId,
              resource: p.resource,
              action: p.action,
              revoke: false,
              grantedBy: ctx.userId,
            },
          });
        }
      } else {
        await db.cnUserPermissionExtra.deleteMany({
          where: {
            orgId: ctx.orgId,
            userId: authUserId,
            OR: SETTINGS_PERMS.map((p) => ({
              resource: p.resource,
              action: p.action,
            })),
          },
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      return NextResponse.json(
        { error: `Settings access was not saved: ${message}` },
        { status: 500 },
      );
    }
  }

  if (touchingModules && !isAdminUserType && tickedModules.length > 0) {
    // Module access MUST persist — otherwise the sidebar silently keeps the
    // old module set while the admin sees a successful save. Surface the two
    // failure modes as real errors instead of swallowing them:
    //   1. authUserId could not be resolved (no login account, or the lookup
    //      itself threw) → the grant/revoke rows are keyed on it, so the write
    //      is impossible.
    //   2. applyModuleRevokes threw → the write partially or fully failed.
    if (!authUserId) {
      return NextResponse.json(
        {
          error: authUserLookupError
            ? `Module access was not saved — failed to look up this user's login account: ${authUserLookupError}`
            : "Module access was not saved — this user has no login account yet. Ask them to accept their invite (or verify their email address), then try again.",
        },
        { status: 422 },
      );
    }
    try {
      // Which modules did the user already have? Modules present before AND
      // after this save are reconciled non-destructively so an Edit-User save
      // that doesn't touch the module list can't wipe the per-page rights set
      // on the Permissions screen (that wipe is what made every remaining
      // sub-module of an assigned module come back selected).
      let previouslyTicked: string[] | null = null;
      try {
        const existingRevokes = (await db.cnUserPermissionExtra.findMany({
          where: { userId: authUserId, orgId: ctx.orgId, revoke: true },
          select: { resource: true, action: true },
        })) as Array<{ resource: string; action: string }>;
        previouslyTicked = modulesFromRevokes(existingRevokes);
      } catch {
        // Couldn't read the current state — fall back to a full reconcile.
      }
      await applyModuleRevokes(
        db as never,
        authUserId,
        ctx.orgId,
        tickedModules,
        ctx.userId,
        previouslyTicked,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      return NextResponse.json(
        { error: `Module access was not saved: ${message}` },
        { status: 500 },
      );
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
        db as never,
        authUserId,
        ctx.orgId,
        projectIds,
        ctx.userId,
      );
    } catch {
      // Non-fatal — admin can retry by re-saving.
    }
  }

  // Item 6: Permission-matrix reconciliation. For every (resource, action)
  // pair in the matrix's managed universe we write an explicit
  // CnUserPermissionExtra row for this user:
  //
  //   - cell set to FALSE → revoke=true  (deny override)
  //   - cell set to TRUE  → revoke=false (ADDITIVE GRANT)
  //
  // Writing the additive grant for checked cells is the fix for "I checked a
  // page/module here but it never showed up for the user". Previously checked
  // cells only had their revoke row DELETED — which merely stops denying the
  // page, it does not grant it. The user's sidebar and route guards are built
  // from real grants (role grants ∪ additive grants − revokes), so a page the
  // role didn't already include stayed invisible no matter how many boxes the
  // admin ticked. Making the matrix write grants lets the Permissions page
  // actually hand out access, matching what the green checkboxes imply and
  // staying consistent with the Edit-User module flow (applyModuleRevokes).
  //
  // Runs for admin-role users too. Only the CENTRAL admin truly bypasses via
  // the "*" wildcard (and its matrix is locked read-only in the UI). An
  // app-level admin invited into the org ("sub-admin") gets concrete keys
  // minus revokes, so the matrix MUST be able to save for them — otherwise
  // ticking a page here silently did nothing and reverted on reload.
  if (touchingMatrix && authUserId) {
    try {
      const desiredRevokes = matrixToRevokes(matrixIncoming ?? null);
      const revokedSet = new Set(
        desiredRevokes.map((r) => `${r.resource}:${r.action}`),
      );
      const universe = managedPairs();
      const toRevoke = desiredRevokes;
      const toGrant = universe.filter(
        (p) => !revokedSet.has(`${p.resource}:${p.action}`),
      );
      const writeExtra = (
        p: { resource: string; action: string },
        revoke: boolean,
      ) =>
        db.cnUserPermissionExtra.upsert({
          where: {
            orgId_userId_resource_action: {
              orgId: ctx.orgId,
              userId: authUserId as string,
              resource: p.resource,
              action: p.action,
            },
          },
          update: { revoke },
          create: {
            orgId: ctx.orgId,
            userId: authUserId as string,
            resource: p.resource,
            action: p.action,
            revoke,
            grantedBy: ctx.userId,
          },
        });
      // Deny the unchecked cells…
      for (const p of toRevoke) await writeExtra(p, true);
      // …and explicitly grant the checked cells.
      for (const p of toGrant) await writeExtra(p, false);
    } catch (error: unknown) {
      // This block IS the permission save. Swallowing a failure here reported
      // "saved successfully" while nothing was persisted, so the admin had no
      // way to tell an un-enforced permission from an un-saved one. Fail loud.
      const message =
        error instanceof Error ? error.message : "Failed to save permissions";
      logger.error({
        msg: "user_permission_matrix_save_failed",
        userId: id,
        orgId: ctx.orgId,
        error: message,
      });
      return NextResponse.json(
        { success: false, error: `Failed to save permissions: ${message}` },
        { status: 500 },
      );
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
