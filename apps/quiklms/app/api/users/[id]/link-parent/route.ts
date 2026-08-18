import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { linkParentStudent } from '@/lib/services/users-service';

const schema = z.object({ parentId: z.string().min(1) }).strict();

/**
 * POST /api/users/:id/link-parent — ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * `:id` is the STUDENT — the mirror of link-student, and the argument order
 * flips accordingly. Port of `POST /auth/users/:userId/link-parent`
 * (`auth.controller.ts:490`), which likewise delegated to the same
 * `linkParentStudent(tenantId, parentId, studentId)` with the ids swapped.
 */
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');

  const { parentId } = await parseBody(req, schema);
  const result = await linkParentStudent(actor.orgId, parentId, params!.id);
  // The service already returns { success, message } in the legacy shape.
  return json(result);
});
