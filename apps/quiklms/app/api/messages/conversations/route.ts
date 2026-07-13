import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { getConversations, createConversation } from '@/lib/services/messages-service';

// GET /api/messages/conversations — list non-archived conversations
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  return json(await getConversations(actor.orgId ?? '', actor.id));
});

const createSchema = z.object({
  participantIds: z.array(z.string()).min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  groupIcon: z.string().optional(),
  type: z.enum(['direct', 'group']).optional(),
  initialMessage: z.string().optional(),
});

// POST /api/messages/conversations — create (or reuse) a conversation
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  const dto = await parseBody(req, createSchema);
  const userRole = actor.role || 'LEARNER';
  const conv = await createConversation(actor.orgId ?? '', actor.id, userRole, dto);
  return json(conv);
});
