import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { findOne, update } from '@/lib/services/assessments-service';

// GET /api/assessments/:id?sessionId= — any authenticated user (TenantGuard)
// NOTE: proctoring-session question slicing is omitted (quiz-proctoring module
// not ported); the full assessment is always returned, matching the no-session
// branch of the legacy handler.
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const data = await findOne(params!.id, actor.tenantId);
  return json({ success: true, data });
});

// PUT /api/assessments/:id — any authenticated user (TenantGuard)
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const updateData = await parseBody(req, z.object({}).passthrough());
  const assessment = await update(params!.id, actor.tenantId, updateData as Record<string, unknown>);
  return json({ success: true, data: assessment, message: 'Assessment updated successfully' });
});
