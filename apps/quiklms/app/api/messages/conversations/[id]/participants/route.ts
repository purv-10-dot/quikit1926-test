import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { addParticipants } from '@/lib/services/messages-service';

const schema = z.object({ participantIds: z.array(z.string()).min(1) });

// POST /api/messages/conversations/:id/participants — add participants (admin only)
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const { participantIds } = await parseBody(req, schema);
  return json(await addParticipants(actor.tenantId ?? '', params!.id, actor.id, participantIds));
});
