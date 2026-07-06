import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

const ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN'] as const;

// GET /api/master-courses/:id/draft
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  const data = await svc.getDraft(params!.id);
  return json({ success: true, data });
});

// DELETE /api/master-courses/:id/draft
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  await svc.discardDraft(params!.id);
  return json({ success: true, message: 'Draft discarded' });
});
