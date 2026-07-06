import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { reviewIncident } from '@/lib/services/proctoring-service';

const schema = z.object({ disposition: z.string(), action: z.string(), remarks: z.string().optional() });

// PATCH /api/proctoring/:sessionId/incident — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const body = await parseBody(req, schema);
  const incident = await reviewIncident(actor, actor.id, params!.sessionId, body);
  return json({ success: true, data: incident });
});
