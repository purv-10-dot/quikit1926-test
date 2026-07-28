import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { assertCanViewStudent } from '@/lib/auth/student-access';
import { getTranscript } from '@/lib/services/gradebook-service';

// GET /api/gradebook/student/:id/transcript?academicYear=
// Same relationship check as the grades route — a transcript is the fullest
// academic record the system holds, so it must not be reachable by id alone.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  await assertCanViewStudent(user, params!.id);
  const academicYear = new URL(req.url).searchParams.get('academicYear') || undefined;
  return json(await getTranscript(user.orgId as string, params!.id, academicYear));
});
