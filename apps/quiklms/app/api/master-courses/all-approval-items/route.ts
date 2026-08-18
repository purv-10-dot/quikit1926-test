import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, orgScope } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

// GET /api/master-courses/all-approval-items — ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const data = await svc.enrichCoursesWithPresignedUrls(await svc.findAllApprovalItems(orgScope(actor)));
  return json({ success: true, data });
});
