import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

// GET /api/courses/:id/player-data — structured course data for the course player
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const courseId = params!.id;

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
      },
    });

    if (!course) {
      return json({
        success: true,
        data: { course: null, modules: [], totalLessons: 0 },
      });
    }

    // Fetch learner progress for this course if available
    let lessonProgress: Record<string, unknown> = {};
    try {
      const progress = await prisma.progress.findUnique({
        where: {
          tenantId_learnerId_courseId: {
            tenantId: actor.tenantId ?? '',
            learnerId: actor.id,
            courseId,
          },
        },
      });
      lessonProgress = (progress?.lessonProgress as Record<string, unknown>) ?? {};
    } catch {
      // progress record may not exist — that's fine
    }

    const totalLessons = course.modules.reduce(
      (sum, m) => sum + m.lessons.length,
      0,
    );

    return json({
      success: true,
      data: {
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
          thumbnailUrl: course.thumbnailUrl,
          status: course.status,
        },
        modules: course.modules.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          orderIndex: m.orderIndex,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            contentUrl: l.contentUrl,
            orderIndex: l.orderIndex,
            duration: l.duration,
            description: l.description,
            progress: lessonProgress[l.id] ?? null,
          })),
        })),
        totalLessons,
        lessonProgress,
      },
    });
  } catch {
    return json({
      success: true,
      data: { course: null, modules: [], totalLessons: 0 },
    });
  }
});
