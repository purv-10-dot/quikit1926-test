import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { reject } from '@/lib/services/tutoring-requests-service';

const schema = z.object({ rejectionReason: z.string().optional() });

// PATCH /api/tutoring-requests/:id/reject — TEACHER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  const dto = await parseBody(req, schema);
  return json(await reject(actor.orgId!, actor.id, params!.id, dto));
});
