import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { reportMessage } from '@/lib/services/messages-service';

const schema = z.object({ reason: z.string() });

// POST /api/messages/:messageId/report — flag a message
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const { reason } = await parseBody(req, schema);
  return json(await reportMessage(actor.tenantId ?? '', params!.messageId, actor.id, reason));
});
