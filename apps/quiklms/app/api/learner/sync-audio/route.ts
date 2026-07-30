import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). `courseId` is the
 * compound-key component whose absence produced a **500** on the `LmsProgress`
 * upsert.
 *
 * `progress` (0-100) drives the completion branch below, so it is bounded here
 * — an out-of-range value used to be written straight into
 * `completionPercentage`. The remaining fields are SCORM audio telemetry that
 * `AudioPlayerResource` sends on every 10s heartbeat; the handler reads only
 * `currentTime`, but the rest are declared so it is visible that they are
 * accepted deliberately rather than by omission.
 */
const syncAudioSchema = z.object({
  courseId: z.string().min(1, 'courseId is required'),
  subModuleId: z.string().nullish(),
  progress: z.number().min(0).max(100).nullish(),
  currentTime: z.union([z.string(), z.number()]).nullish(),
  // SCORM `cmi.core.lesson_location`, e.g. "time:123".
  currentPosition: z.union([z.string(), z.number()]).nullish(),
  maxListenedTime: z.number().nullish(),
  sessionTime: z.number().nullish(),
  suspendData: z.string().nullish(),
});

// PATCH /api/learner/sync-audio
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, syncAudioSchema) as Record<string, unknown>;
  const progressVal = body.progress as number | undefined;
  const progress = await syncProgress({
    orgId, learnerId,
    courseId: body.courseId as string,
    lessonId: body.subModuleId as string | undefined,
    completionPercentage: progressVal,
    currentPosition: body.currentTime as string | number | undefined,
    status: (progressVal ?? 0) >= 95 ? 'Completed' : 'InProgress',
  });
  return json({ success: true, data: progress, message: 'Audio progress synced successfully' });
});
