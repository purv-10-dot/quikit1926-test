import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { leaveMeeting } from '@/lib/services/meetings-service';

// POST /api/meetings/:id/leave — any authenticated user, own attendance only.
// Tenant-scoped: neither the legacy nor the port checked the meeting belonged to
// the caller's org, so any id could decrement another tenant's participantCount.
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await leaveMeeting(params!.id, actor.id, actor.orgId));
});
