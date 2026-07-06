import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

// PATCH /api/learner/sync-progress
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  const tenantId = user.tenantId;
  const learnerId = user.id;
  if (!tenantId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, z.object({}).passthrough()) as Record<string, unknown>;
  const progress = await syncProgress({
    tenantId, learnerId,
    courseId: body.courseId as string,
    moduleId: body.moduleId as string | undefined,
    lessonId: body.lessonId as string | undefined,
    completionPercentage: body.completionPercentage as number | undefined,
    currentPosition: body.currentPosition as string | number | undefined,
    status: body.status as never,
  });
  return json({ success: true, data: progress, message: 'Progress synced successfully' });
});
