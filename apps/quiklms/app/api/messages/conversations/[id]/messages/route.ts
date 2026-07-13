import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { getMessages, sendMessage } from '@/lib/services/messages-service';

// GET /api/messages/conversations/:id/messages?page=&limit=
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '') || 1;
  const limit = parseInt(url.searchParams.get('limit') || '') || 50;
  return json(await getMessages(actor.orgId ?? '', params!.id, actor.id, page, limit));
});

const sendSchema = z.object({
  text: z.string(),
  attachmentUrls: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
  forwardedFrom: z.string().optional(),
});

// POST /api/messages/conversations/:id/messages — REST fallback (realtime in worker)
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const dto = await parseBody(req, sendSchema);
  return json(await sendMessage(actor.orgId ?? '', params!.id, actor.id, dto));
});
