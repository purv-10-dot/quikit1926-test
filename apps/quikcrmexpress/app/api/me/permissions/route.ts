import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { ensureCrmRolesForOrg } from "@/lib/api/crm-rbac";

/**
 * GET /api/me/permissions
 *
 * The caller's effective permission set for QuikCRMExpress in the active org.
 * Powers client-side gating (sidebar, button-hide, route guards), and gives
 * this app the same endpoint 4 of 5 reference apps expose.
 *
 * The URL and the `{ success, data }` envelope are the common contract; the
 * permission SOURCE stays app-specific. quiktrack/quikscale resolve theirs
 * from AppRole/RolePermission via a local `loadMyPermissions`; this app
 * resolves the same concept through `getEffectiveMatrix` (role baseline +
 * org-scoped permission templates). Re-implementing their model here would
 * duplicate a system this app already has.
 *
 * The matrix is also passed server-side into DashboardProviders, so this route
 * is for client refetches after a permission change rather than first paint.
 *
 * SIDE EFFECT — seed bootstrap: every authenticated client mounts the hook that
 * fires this endpoint, so it doubles as the app's "on-app-startup" hook, the
 * same way quikscale / quiktrack / quikinfra use theirs. It seeds the org's
 * AppRole rows (idempotent, 5-min in-process cache) and binds an admin-tier
 * caller to the admin role if they hold none. Without this, an org whose
 * launcher-side
 * /api/internal/provision-roles call never landed kept an empty
 * app_quikcrmexpress."AppRole" table — and an empty role dropdown in the
 * Admin Portal — until someone happened to open Settings → Users.
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    // Fire-and-forget: seeding must never break the permission fetch. Retried
    // on the next mount.
    try {
      await ensureCrmRolesForOrg(user.userId, user.orgId, isCrmAdminUser(user));
    } catch {
      // Swallow — best-effort bootstrap.
    }

    const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);

    return NextResponse.json({
      success: true,
      data: {
        modules: matrix,
        role: user.role,
        isAdmin: isCrmAdminUser(user),
      },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
