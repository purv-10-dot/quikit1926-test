import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getTranscript } from '@/lib/services/gradebook-service';

// GET /api/gradebook/student/:id/transcript?academicYear=
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  const academicYear = new URL(req.url).searchParams.get('academicYear') || undefined;
  return json(await getTranscript(user.tenantId as string, params!.id, academicYear));
});
