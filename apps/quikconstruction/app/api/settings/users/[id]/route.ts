import { NextRequest, NextResponse } from "next/server";
import {
  findUserById,
  updateUser,
  softDeleteUser,
} from "@/lib/users/repository";
import { requireAuth } from "@/lib/auth/context";
import { getUserTypeDescriptor } from "@/lib/rbac/user-types";
import {
  mergeModulesWithMatrix,
  type PermissionMatrix,
} from "@/lib/rbac/menu-catalog";

/**
 * Individual-user API: GET / PUT / PATCH / DELETE /api/settings/users/:id.
 *
 * Backed by Postgres (`users` via Prisma) — matching the list endpoint.
 * The earlier implementation read from the in-memory demo-store which has
 * no overlap with the real DB IDs, so the permissions page always
 * failed with "Failed to load user". This version consults the same
 * repository as the list and the login flow.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const row = await findUserById(ctx.tenantId, params.id);
  if (!row) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Strip invite token before returning — never leak pending invite links.
  const { inviteToken: _t, ...safe } = row;
  return NextResponse.json(safe);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResponse = await requireAuth();
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
  if (touchingMatrix || touchingModules) {
    // Resolve an effective matrix: the incoming patch if present, otherwise
    // the one already persisted. Same for modules. This keeps partial
    // PATCHes from clobbering the non-touched side.
    const current = touchingMatrix && touchingModules
      ? null
      : await findUserById(ctx.tenantId, id);
    const effectiveMatrix = matrixIncoming ??
      (current?.permissionMatrix as PermissionMatrix | null | undefined) ??
      null;
    const explicitModules = touchingModules
      ? (modulesAssigned as string[])
      : (current?.modulesAssigned ?? []);
    modulesAssigned = mergeModulesWithMatrix(explicitModules, effectiveMatrix);
  }

  const updated = await updateUser(ctx.tenantId, id, {
    fullName: body.fullName,
    mobile: body.mobile,
    department: body.department,
    userType: body.userType,
    roleKey: body.roleKey,
    modulesAssigned,
    projectsAssigned: body.projectsAssigned,
    status: body.status,
    mustChangePassword: body.mustChangePassword,
    permissionMatrix: body.permissionMatrix,
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
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const ok = await softDeleteUser(ctx.tenantId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
