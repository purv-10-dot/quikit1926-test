import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { leaveMeeting } from '@/lib/services/meetings-service';

// POST /api/meetings/:id/leave — any authenticated user
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await leaveMeeting(params!.id, actor.id));
});
