import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). Same contract as
 * `/api/player/sync`, which this endpoint duplicates: `courseId` completes the
 * `orgId_learnerId_courseId` compound key, so without it the upsert reached
 * Postgres with `undefined` and returned a **500**.
 *
 * `status` is a free string, not the `LmsProgressStatus` enum — `syncProgress`
 * runs it through `normalizeStatus`, which accepts `in_progress`, `in-progress`,
 * `in progress`, `completed`, `not_started` and friends, and ignores anything
 * else. Constraining it to the enum would reject every client that works today.
 */
const syncProgressSchema = z.object({
  courseId: z.string().min(1, 'courseId is required'),
  moduleId: z.string().nullish(),
  lessonId: z.string().nullish(),
  completionPercentage: z.number().nullish(),
  currentPosition: z.union([z.string(), z.number()]).nullish(),
  status: z.string().nullish(),
});

// PATCH /api/progress/sync-progress
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
