import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { syncProgress } from '@/lib/services/progress-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). `courseId` is the
 * compound-key component whose absence produced a **500** on the `LmsProgress`
 * upsert.
 *
 * Four viewers post here — `PdfProgressViewer`, `SCORMDocumentViewer`,
 * `SlidesProgressViewer` and `SCORMPresentationViewer` — and each sends a
 * slightly different completion report. The union of their payloads is declared
 * so no working caller loses a field, even though the handler reads only
 * `courseId`, `subModuleId`, `percentRead`, `type` and `lastPageSeen`.
 *
 * `type` is a free string rather than an enum: only the literal `'pdf'` branch
 * is special-cased below, and the other viewers' values (`'document'`, `'ppt'`)
 * are inert — a new resource kind must not start 400ing.
 */
const completeResourceSchema = z.object({
  courseId: z.string().min(1, 'courseId is required'),
  subModuleId: z.string().nullish(),
  type: z.string().nullish(),
  percentRead: z.number().min(0).max(100).nullish(),
  percentViewed: z.number().min(0).max(100).nullish(),
  lastPageSeen: z.union([z.string(), z.number()]).nullish(),
  lastSlide: z.union([z.string(), z.number()]).nullish(),
  totalSlides: z.number().nullish(),
  sessionTime: z.number().nullish(),
});

// POST /api/learner/complete-resource
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, completeResourceSchema) as Record<string, unknown>;
  const progress = await syncProgress({
    orgId, learnerId,
    courseId: body.courseId as string,
    lessonId: body.subModuleId as string | undefined,
    completionPercentage: (body.percentRead as number | undefined) ?? 100,
    status: 'Completed',
  });

  // Store last page seen for PDFs
  if (body.type === 'pdf' && body.lastPageSeen && body.subModuleId) {
    const lessonProgress = (progress.lessonProgress as Record<string, Record<string, unknown>>) || {};
    if (lessonProgress[body.subModuleId as string]) {
      lessonProgress[body.subModuleId as string].lastPageSeen = body.lastPageSeen;
      await db.lmsProgress.update({ where: { id: progress.id }, data: { lessonProgress: lessonProgress as object } });
    }
  }
  return json({ success: true, data: progress, message: 'Resource marked as completed' });
});
