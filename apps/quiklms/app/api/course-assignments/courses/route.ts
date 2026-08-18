import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, userHasRole } from '@/lib/auth/context';
import { getAssignedCourses, enrichAssignmentsWithPresignedUrls } from '@/lib/services/course-assignments-service';

/**
 * GET /api/course-assignments/courses?tenantId= — ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * The override param is `tenantId`: that is the legacy wire name
 * (`@Query('tenantId')`, `course-assignments.controller.ts:63`) and the org-wide
 * rename never reached the client. The port read `orgId` only, so a ADMIN
 * passing `?tenantId=X` was SILENTLY IGNORED and fell back to their own org —
 * cross-tenant inspection broke with no error. Both names are accepted now:
 * `tenantId` for legacy parity, `orgId` for anything written against the new name.
 */
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  const params = new URL(req.url).searchParams;
  const queryTenantId = params.get('tenantId') || params.get('orgId') || undefined;

  let orgId: string | null | undefined = user.orgId;
  if (userHasRole(user, 'ADMIN')) {
    if (queryTenantId) orgId = queryTenantId;
    else if (!orgId) orgId = null; // null = span every tenant
  }

  // `userHasRole`, not `user.role` — mirrors the legacy `isTenantOrSubAdminActor`
  // check (`controller.ts:75`), routed through the one shared predicate so this
  // and the service layer cannot drift.
  if ((userHasRole(user, 'TENANT_ADMIN') || userHasRole(user, 'SUB_ADMIN')) && !orgId) {
    throw BadRequest('Tenant ID is required');
  }

  const courses = await getAssignedCourses(orgId);
  return json({ success: true, data: await enrichAssignmentsWithPresignedUrls(courses as never) });
});
