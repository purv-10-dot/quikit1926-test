import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { syncProgress } from '@/lib/services/progress-service';

// PATCH /api/player/sync
export const PATCH = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, z.object({}).passthrough()) as Record<string, unknown>;
  if (!body.courseId) return json({ success: false, message: 'Course ID is required' });

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
    return json({ success: false, message: error instanceof Error ? error.message : 'Failed to sync progress' });
  }
});
