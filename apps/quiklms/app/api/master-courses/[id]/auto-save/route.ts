import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import * as svc from '@/lib/services/master-course-service';

/**
 * F-003: `.passthrough()` is KEPT here, and this is the one route in the set
 * where that is the right answer.
 *
 * The body is not a DTO — it is the studio's in-progress editor state, stored
 * verbatim into the `draftData` Json column and handed straight back on reload.
 * No field of it is ever read by the server, nothing is mapped onto a column,
 * and a draft is by definition half-finished, so nothing can be required. A
 * closed schema would silently drop whatever the author was in the middle of
 * typing and the recovered draft would come back incomplete — a worse failure
 * than no validation, because it is invisible.
 *
 * The studio's known top-level keys are declared so their types are still
 * checked when present; anything else rides through untouched.
 */
const autoSaveSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  category: z.string().nullish(),
  level: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  aiGeneratedThumbnail: z.boolean().nullish(),
  tags: z.array(z.string()).nullish(),
  estimatedDuration: z.number().nullish(),
  modules: z.array(z.unknown()).nullish(),
  settings: z.record(z.unknown()).nullish(),
  status: z.string().nullish(),
  selectedTenants: z.array(z.string()).nullish(),
}).passthrough();

/**
 * POST /api/master-courses/:id/auto-save — ADMIN | TENANT_ADMIN | SUB_ADMIN (200)
 *
 * The ownership guard is a deliberate behavior change (approved 2026-07-17), not
 * parity: `autoSaveDraft` filters only on `{id, isMaster:true}`, so without it any
 * tenant admin could overwrite `draftData` on ANY tenant's master course.
 */
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  await svc.assertCanEditMasterCourse(actor, params!.id);
  const draftData = (await parseBody(req, autoSaveSchema)) as Record<string, unknown>;
  const course = await svc.autoSaveDraft(params!.id, draftData);
  return json({ success: true, data: { lastAutoSaveAt: course.lastAutoSaveAt }, message: 'Draft auto-saved' }, 200);
});
