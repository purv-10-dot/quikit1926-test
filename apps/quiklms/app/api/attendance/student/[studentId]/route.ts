import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getStudentAttendance } from '@/lib/services/attendance-service';

// GET /api/attendance/student/:studentId — any authed user
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  return json(
    await getStudentAttendance(
      actor.tenantId!,
      params!.studentId,
      url.searchParams.get('startDate') || undefined,
      url.searchParams.get('endDate') || undefined,
    ),
  );
});
