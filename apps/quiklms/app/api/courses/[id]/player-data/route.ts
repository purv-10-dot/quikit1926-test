import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { db } from '@/lib/db';

// GET /api/courses/:id/player-data — structured course data for the course player
//
// TENANT SCOPING. This used `findUnique({ where: { id } })` with no orgId
// filter, so any authenticated user of ANY tenant could read another tenant's
// full course content — modules and lessons included — just by knowing the id.
// The sibling `GET /api/courses/:id` was always scoped and 404s on the same id.
//
// The where-clause below mirrors `courses-service.findOne` exactly: a course is
// visible if the tenant owns it, OR it is a master course explicitly assigned
// to that tenant. Master courses carry `orgId: null`, so a naive `{ orgId }`
// filter would break legitimate shared-content access.
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  const courseId = params!.id;
  const orgId = actor.orgId;
  if (!orgId) throw BadRequest('Tenant ID required');

  try {
    const course = await db.lmsCourse.findFirst({
      where: {
        id: courseId,
        OR: [{ orgId }, { isMaster: true, selectedTenants: { some: { orgId } } }],
      },
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
      const progress = await db.lmsProgress.findUnique({
        where: {
          orgId_learnerId_courseId: {
            orgId: actor.orgId ?? '',
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
