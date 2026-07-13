import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { joinMeeting } from '@/lib/services/meetings-service';

const schema = z.object({ deviceType: z.string().optional() });

// POST /api/meetings/:id/join — any authenticated user (logs attendance)
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const body = await parseBody(req, schema);
  return json(await joinMeeting(actor.orgId!, params!.id, actor.id, actor.role, body?.deviceType));
});
