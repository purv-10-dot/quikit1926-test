import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { unlinkParentStudent } from '@/lib/services/users-service';

/**
 * DELETE /api/users/:id/unlink-student/:studentId — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * `:id` is the PARENT. Port of
 * `DELETE /auth/users/:userId/unlink-student/:studentId`
 * (`auth.controller.ts:505`). Idempotent: unlinking an already-unlinked pair
 * succeeds, matching the legacy's `$pull` semantics.
 */
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');

  const result = await unlinkParentStudent(actor.orgId, params!.id, params!.studentId);
  // The service already returns { success, message } in the legacy shape.
  return json(result);
});
