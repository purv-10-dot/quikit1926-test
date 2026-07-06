import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { create } from '@/lib/services/assessments-service';

// POST /api/assessments — any authenticated user (TenantGuard)
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const dto = await parseBody(req, z.object({ moduleId: z.string() }).passthrough());
  const assessment = await create(actor.tenantId, dto as Record<string, unknown>);
  return json({ success: true, data: assessment, message: 'Assessment created successfully' });
});
