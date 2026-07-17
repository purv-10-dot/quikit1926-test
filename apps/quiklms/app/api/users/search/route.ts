import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { searchUsers } from '@/lib/services/users-service';
import { applyTeacherPrivacy } from '@/lib/privacy';

/**
 * GET /api/users/search?q=&role= — any authenticated user (messaging, pickers)
 *
 * The absence of a role guard is CORRECT and is parity. GAP_REPORT §2.4 lists
 * this as "role guard dropped entirely", citing `auth.controller.ts:461-462` —
 * but that is a DIFFERENT endpoint. There were two searches in the legacy app:
 *
 *   /auth/users/search   auth.controller.ts:461   @Roles(TENANT_ADMIN, SUPER_ADMIN, SUB_ADMIN)
 *                        @Query('email')          — "Search users by email (for linking UI)"
 *   /users/search        users.controller.ts:111  NO @Roles — open to any authenticated user
 *                        @Query('q'), @Query('role') — "SEARCH USERS (for messaging, etc.)"
 *
 * This route takes `q` + `role` and applies the corporate `excludeRoles` rule, so
 * it is the port of `users.controller.ts:111`, which had no guard. Adding one
 * would break messaging pickers for LEARNER/PARENT. The unported endpoint is
 * `/auth/users/search`, which belongs to the auth module.
 */
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || undefined;
  const role = url.searchParams.get('role') || undefined;
  const orgId = actor.role === 'SUPER_ADMIN' ? undefined : actor.orgId ?? undefined;
  const excludeRoles = actor.tenantType === 'corporate' ? ['TEACHER', 'PARENT'] : [];
  const users = await searchUsers(orgId, q, role, excludeRoles);
  return json({ success: true, data: await applyTeacherPrivacy(actor, req, users) });
});
