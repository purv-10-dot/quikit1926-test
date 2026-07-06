import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

// PATCH /api/learner/sync-audio
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  const tenantId = user.tenantId;
  const learnerId = user.id;
  if (!tenantId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, z.object({}).passthrough()) as Record<string, unknown>;
  const progressVal = body.progress as number | undefined;
  const progress = await syncProgress({
    tenantId, learnerId,
    courseId: body.courseId as string,
    lessonId: body.subModuleId as string | undefined,
    completionPercentage: progressVal,
    currentPosition: body.currentTime as string | number | undefined,
    status: (progressVal ?? 0) >= 95 ? 'Completed' : 'InProgress',
  });
  return json({ success: true, data: progress, message: 'Audio progress synced successfully' });
});
