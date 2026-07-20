import { route, json, Forbidden } from '@/lib/http';
import { requireAuth, requireRoles, userHasRole } from '@/lib/auth/context';
import { getStudentProgress } from '@/lib/services/analytics-service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/analytics/student/:studentId — TENANT_ADMIN | SUB_ADMIN | TEACHER | PARENT
 *
 * RELATIONSHIP CHECK ADDED. The role guard alone let ANY parent or teacher in
 * the org pull ANY student's attendance calendar, homework scores and progress
 * by id. The legacy had the same hole — the port narrowed it from cross-tenant
 * to intra-tenant but the IDOR survived.
 *
 *  - Admins: unrestricted within their org (they already administer every student).
 *  - PARENT: must be linked to the student via `LmsUserParent`.
 *  - TEACHER: must share a batch with the student, or be their assigned manager.
 *  - Anyone may read their own record.
 */
async function assertCanViewStudent(
  actor: { id: string; orgId: string | null; role: string; secondaryRole: string | null },
  studentId: string,
): Promise<void> {
  if (actor.id === studentId) return;

  const isAdmin =
    userHasRole(actor as never, 'SUPER_ADMIN') ||
    userHasRole(actor as never, 'TENANT_ADMIN') ||
    userHasRole(actor as never, 'SUB_ADMIN');
  if (isAdmin) return;

  if (userHasRole(actor as never, 'PARENT')) {
    const link = await prisma.lmsUserParent.findUnique({
      where: { parentId_childId: { parentId: actor.id, childId: studentId } },
      select: { id: true },
    });
    if (link) return;
  }

  if (userHasRole(actor as never, 'TEACHER')) {
    // Shares a batch this teacher runs, or reports to them directly.
    const [sharedBatch, managed] = await Promise.all([
      prisma.lmsBatchStudent.findFirst({
        where: { studentId, batch: { orgId: actor.orgId ?? undefined, teacherId: actor.id } },
        select: { id: true },
      }),
      prisma.lmsUser.findFirst({
        where: { id: studentId, orgId: actor.orgId ?? undefined, managerId: actor.id },
        select: { id: true },
      }),
    ]);
    if (sharedBatch || managed) return;
  }

  throw Forbidden('You do not have access to this student');
}

export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER', 'PARENT']);
  await assertCanViewStudent(actor, params!.studentId);
  return json(await getStudentProgress(actor.orgId ?? '', params!.studentId));
});
