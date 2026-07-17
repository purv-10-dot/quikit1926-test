import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

const ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN'] as const;

/**
 * GET /api/master-courses/:id/draft
 *
 * Guarded with the EDIT check, not the read check used by `GET /master-courses/:id`.
 * `draftData` is unpublished authoring state belonging to the submitting tenant —
 * a tenant the course is merely assigned to (`selectedTenants`) has no business
 * reading another tenant's unsaved work. Deliberate behavior change, approved
 * 2026-07-17; the original had no check at all here.
 */
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  await svc.assertCanEditMasterCourse(actor, params!.id);
  const data = await svc.getDraft(params!.id);
  return json({ success: true, data });
});

// DELETE /api/master-courses/:id/draft — destroys another tenant's draft without
// the guard. Deliberate behavior change, approved 2026-07-17.
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  await svc.assertCanEditMasterCourse(actor, params!.id);
  await svc.discardDraft(params!.id);
  return json({ success: true, message: 'Draft discarded' });
});
