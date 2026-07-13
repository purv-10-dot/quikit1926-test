import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { syncProgress } from '@/lib/services/progress-service';

// POST /api/learner/complete-resource
export const POST = route(async (req) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const body = await parseBody(req, z.object({}).passthrough()) as Record<string, unknown>;
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
      await prisma.progress.update({ where: { id: progress.id }, data: { lessonProgress: lessonProgress as object } });
    }
  }
  return json({ success: true, data: progress, message: 'Resource marked as completed' });
});
