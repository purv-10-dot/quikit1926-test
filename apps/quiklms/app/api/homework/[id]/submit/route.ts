import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { submitHomework } from '@/lib/services/homework-service';

const schema = z.object({
  attachmentUrls: z.array(z.string()).optional(),
  textResponse: z.string().optional(),
});

// POST /api/homework/:id/submit — LEARNER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER']);
  const dto = await parseBody(req, schema);
  return json(await submitHomework(actor.orgId!, params!.id, actor.id, dto));
});
