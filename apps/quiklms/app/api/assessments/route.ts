import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create } from '@/lib/services/assessments-service';

// POST /api/assessments — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | TEACHER
// Authoring a quiz is staff work; this was `requireAuth` only, so any LEARNER
// could create assessments in their tenant.
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const dto = await parseBody(req, z.object({ moduleId: z.string() }).passthrough());
  const assessment = await create(actor.orgId, dto as Record<string, unknown>);
  return json({ success: true, data: assessment, message: 'Assessment created successfully' });
});
