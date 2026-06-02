import { NextRequest, NextResponse } from "next/server";
import {
  findUserById,
  updateUser,
  softDeleteUser,
} from "@/lib/users/repository";
import { requireSuperAdmin } from "@/lib/auth/context";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";
import {
  MENU_CATALOG,
  MODULE_KEY_TO_MENU_MODULE,
  mergeModulesWithMatrix,
  type PermissionMatrix,
} from "@/lib/rbac/menu-catalog";

/**
 * Individual-user API: GET / PUT / PATCH / DELETE /api/settings/users/:id.
 *
 * Backed by Postgres (`cn_users` via Prisma) — matching the list endpoint.
 * The earlier implementation read from the in-memory demo-store which has
 * no overlap with the real DB IDs, so the permissions page always
 * failed with "Failed to load user". This version consults the same
 * repository as the list and the login flow.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResponse = await requireSuperAdmin();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const row = await findUserById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Strip invite token before returning — never leak pending invite links.
  const { inviteToken: _t, ...safe } = row;
  return NextResponse.json(safe);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResponse = await requireSuperAdmin();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const body = await req.json();

  // If a user type is being changed, re-validate against the catalog.
  // Also blocks escalating any account to SUPER_ADMIN via the client UI.
  if (body.userType !== undefined) {
    const descriptor = getUserTypeDescriptor(body.userType);
    if (!descriptor) {
      return NextResponse.json(
        { error: `Unknown user type: ${body.userType}` },
        { status: 400 },
      );
    }
    if (!descriptor.clientSelectable) {
      return NextResponse.json(
        { error: `User type ${body.userType} cannot be set from the client UI` },
        { status: 403 },
      );
    }
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
      : await findUserById(ctx.orgId, id);
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

  const updated = await updateUser(ctx.orgId, id, {
    fullName: body.fullName,
    mobile: body.mobile,
    department: body.department,
    userType: body.userType,
    roleKey: body.roleKey,
    modulesAssigned,
    projectsAssigned: body.projectsAssigned,
    status: body.status,
    mustChangePassword: body.mustChangePassword,
    permissionMatrix: permissionMatrixToSave as Record<string, Record<string, boolean>> | undefined,
    updatedBy: ctx.userId,
  });

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const { inviteToken: _t, ...safe } = updated;
  return NextResponse.json(safe);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleUpdate(req, params.id);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleUpdate(req, params.id);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResponse = await requireSuperAdmin();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const ok = await softDeleteUser(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
