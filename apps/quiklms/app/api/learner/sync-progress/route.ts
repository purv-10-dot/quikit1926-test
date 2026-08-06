import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). `courseId` is the
 * compound-key component that, when absent, reached the `LmsProgress` upsert as
 * `undefined` and produced a **500**.
 *
 * `lessonId` is NOT a uuid check: `LockedCoursePlayer` sends
 * `currentLesson._id || currentLesson.title`, so a lesson with no id legitimately
 * arrives keyed by its title. `currentPosition` is a union because the same
 * caller sends `played * duration` (a number) while SCORM callers send
 * `"time:123"`. `status` is a free string — `normalizeStatus` maps the client's
 * `'in_progress'`/`'completed'` itself.
 */
const syncProgressSchema = z.object({
  courseId: z.string().min(1, 'courseId is required'),
  moduleId: z.string().nullish(),
  lessonId: z.string().nullish(),
  completionPercentage: z.number().nullish(),
  currentPosition: z.union([z.string(), z.number()]).nullish(),
  status: z.string().nullish(),
});

// PATCH /api/learner/sync-progress
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, syncProgressSchema) as Record<string, unknown>;
  const progress = await syncProgress({
    orgId, learnerId,
    courseId: body.courseId as string,
    moduleId: body.moduleId as string | undefined,
    lessonId: body.lessonId as string | undefined,
    completionPercentage: body.completionPercentage as number | undefined,
    currentPosition: body.currentPosition as string | number | undefined,
    status: body.status as never,
  });
  return json({ success: true, data: progress, message: 'Progress synced successfully' });
});
