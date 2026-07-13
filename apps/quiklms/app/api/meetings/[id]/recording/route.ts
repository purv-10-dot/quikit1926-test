import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { toggleRecording } from '@/lib/services/meetings-service';

const schema = z.object({ enabled: z.boolean() });

// PATCH /api/meetings/:id/recording — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const body = await parseBody(req, schema);
  return json(await toggleRecording(actor.orgId!, params!.id, body.enabled));
});
