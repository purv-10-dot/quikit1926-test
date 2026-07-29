import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { linkParentStudent } from '@/lib/services/users-service';

const schema = z.object({ studentId: z.string().min(1) }).strict();

/**
 * POST /api/users/:id/link-student — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * `:id` is the PARENT. Port of `POST /auth/users/:userId/link-student`
 * (`auth.controller.ts:475`); it lives under `/users` rather than `/auth`
 * because `/auth/*` now belongs to the centralized identity service and this is
 * LMS-domain data (`LmsUserParent`). `/auth/users/search` was relocated the same
 * way, so this follows the convention already set.
 */
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');

  const { studentId } = await parseBody(req, schema);
  const result = await linkParentStudent(actor.orgId, params!.id, studentId);
  // The service already returns { success, message } in the legacy shape.
  return json(result);
});
