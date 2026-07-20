import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getUserAssignments, enrichAssignmentsWithPresignedUrls } from '@/lib/services/course-assignments-service';

// GET /api/course-assignments/my-assignments — any authenticated user
//
// Enriched, as in the legacy (`course-assignments.controller.ts:348`): each
// assignment's populated `courseId.thumbnailUrl` gets a presigned sibling, so
// the learner's assignment list renders thumbnails from the private bucket.
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  if (!user.id) throw BadRequest('User ID is required');
  const assignments = await getUserAssignments(user.orgId ?? null, user.id);
  return json({ success: true, data: await enrichAssignmentsWithPresignedUrls(assignments as never) });
});
