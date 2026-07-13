import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getClassAttendance } from '@/lib/services/attendance-service';

// GET /api/attendance/class/:classId — any authed user
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await getClassAttendance(actor.orgId!, params!.classId));
});
