import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). `courseId` is
 * the compound-key component that, when absent, reached Prisma as `undefined`
 * and produced a 500. The remaining fields stay optional and loosely typed —
 * SCORM runtimes send a wide variety of shapes — but the required one is now
 * enforced at the edge, where the caller gets a field-level 400.
 */
const syncSchema = z.object({
  courseId: z.string().min(1, 'courseId is required'),
  moduleId: z.string().optional(),
  lessonId: z.string().optional(),
  completionPercentage: z.number().min(0).max(100).optional(),
  currentPosition: z.union([z.string(), z.number()]).optional(),
  suspendData: z.string().optional(),
  scormData: z.record(z.string()).optional(),
  status: z.string().optional(),
}).passthrough();

/**
 * PATCH /api/player/sync
 *
 * STATUS CODES MATTER HERE. Every failure path used to answer HTTP **200** with
 * `{success:false}` — including the guard failures below and the catch. This is
 * the SCORM progress-sync endpoint, so a silent failure means a learner's
 * progress is lost; and because the transport said "200 OK", no retry logic,
 * proxy, or alerting could ever detect it. Failures now carry real 4xx/5xx
 * codes so lost progress is visible.
 */
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) {
    return json({ success: false, message: 'Tenant ID and Learner ID are required' }, 400);
  }

  const body = await parseBody(req, syncSchema) as Record<string, unknown>;
  if (!body.courseId) return json({ success: false, message: 'Course ID is required' }, 400);

  try {
    const progress = await syncProgress({
      orgId, learnerId,
      courseId: body.courseId as string,
      moduleId: body.moduleId as string | undefined,
      lessonId: body.lessonId as string | undefined,
      completionPercentage: body.completionPercentage as number | undefined,
      currentPosition: body.currentPosition as string | number | undefined,
      suspendData: body.suspendData as string | undefined,
      scormData: body.scormData as Record<string, string> | undefined,
      status: body.status as never,
    });
    return json({ success: true, data: progress, message: 'Progress synced successfully' });
  } catch (error) {
    // Rethrow so `route()` maps it properly: Prisma client faults become 4xx
    // and genuine server faults become a logged 500. Swallowing it here and
    // answering 200 is exactly how lost SCORM progress went unnoticed.
    throw error;
  }
});
