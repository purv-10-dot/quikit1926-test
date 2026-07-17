import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

/**
 * POST /api/master-courses/:id/auto-save — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN (200)
 *
 * The ownership guard is a deliberate behavior change (approved 2026-07-17), not
 * parity: `autoSaveDraft` filters only on `{id, isMaster:true}`, so without it any
 * tenant admin could overwrite `draftData` on ANY tenant's master course.
 */
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  await svc.assertCanEditMasterCourse(actor, params!.id);
  const draftData = (await parseBody(req, z.object({}).passthrough())) as Record<string, unknown>;
  const course = await svc.autoSaveDraft(params!.id, draftData);
  return json({ success: true, data: { lastAutoSaveAt: course.lastAutoSaveAt }, message: 'Draft auto-saved' }, 200);
});
