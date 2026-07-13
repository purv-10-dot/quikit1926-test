import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { updateProgress } from '@/lib/services/progress-service';

// POST /api/progress — update progress (any authenticated learner)
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, z.object({}).passthrough()) as Record<string, unknown>;
  const progress = await updateProgress({
    orgId, learnerId,
    courseId: body.courseId as string,
    lessonId: body.lessonId as string | undefined,
    currentPosition: body.currentPosition as string | number | undefined,
    duration: body.duration as number | undefined,
    percentRemaining: body.percentRemaining as number | undefined,
    status: body.status as never,
    scormStatus: body.scormStatus as string | undefined,
  });
  return json({ success: true, data: progress });
});
