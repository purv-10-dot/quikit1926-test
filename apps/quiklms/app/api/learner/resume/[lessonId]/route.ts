import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getProgress } from '@/lib/services/progress-service';

function parseSCORMLocation(location: string | number | undefined): number {
  if (typeof location === 'number') return location;
  if (!location) return 0;
  const match = String(location).match(/^(slide|scroll|time):(\d+)$/);
  return match ? parseInt(match[2], 10) : parseInt(String(location), 10) || 0;
}

// GET /api/learner/resume/:lessonId?courseId=
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  const orgId = user.orgId;
  const learnerId = user.id;
  if (!orgId || !learnerId) return json({ success: false, message: 'Tenant ID and Learner ID are required' });

  const courseId = new URL(req.url).searchParams.get('courseId') || '';
  const progress = await getProgress(orgId, learnerId, courseId);
  const lp = (progress?.lessonProgress as Record<string, Record<string, unknown>> | undefined)?.[params!.lessonId];

  if (!lp) return json({ success: true, data: { lastTime: 0, lastPage: 1 } });

  const currentPosition = lp.currentPosition as string | number | undefined;
  const parsedLocation = parseSCORMLocation(currentPosition);
  const isScrollFormat = typeof currentPosition === 'string' && currentPosition.startsWith('scroll:');
  return json({
    success: true,
    data: {
      lastTime: parsedLocation,
      lastPage: (lp.lastPageSeen as number) || 1,
      progress: (lp.completionPercentage as number) || 0,
      scrollPosition: isScrollFormat ? parsedLocation : 0,
      currentPosition,
    },
  });
});
