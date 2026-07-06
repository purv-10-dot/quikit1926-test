import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

// GET /api/courses/enrolled — list courses the authenticated learner is enrolled in
// Enrollment is derived from CourseAssignment targeting this user (no Enrollment model exists).
// Falls back to empty array on any Prisma error.
export const GET = route(async (req) => {
  const actor = await requireAuth(req);

  try {
    // No dedicated Enrollment model; resolve via CourseAssignment (targetType USER)
    const assignments = await (prisma as any).courseAssignment.findMany({
      where: {
        targetId: actor.id,
        targetType: 'USER',
        tenantId: actor.tenantId ?? undefined,
      },
      include: {
        // courseAssignment has no relation field to Course (scalar courseId only)
      },
    });

    // Fetch courses separately using the scalar courseId scalars
    const courseIds: string[] = assignments.map((a: any) => a.courseId);
    const courses = courseIds.length
      ? await (prisma as any).course.findMany({
          where: { id: { in: courseIds } },
        })
      : [];

    const data = assignments.map((a: any) => ({
      ...a,
      course: courses.find((c: any) => c.id === a.courseId) ?? null,
    }));

    return json({ success: true, data });
  } catch {
    return json({ success: true, data: [] });
  }
});
