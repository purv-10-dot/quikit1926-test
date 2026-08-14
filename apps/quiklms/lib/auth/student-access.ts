import { Forbidden } from '@/lib/http';
import { userHasRole, type AuthUser } from '@/lib/auth/context';
import { db } from '@/lib/db';

/**
 * Shared relationship check for any endpoint that takes a `studentId` and
 * returns that student's records.
 *
 * WHY THIS EXISTS. A role guard answers "is this caller a parent/teacher?" —
 * it does NOT answer "is this caller *that student's* parent/teacher?". Without
 * the second question, any parent in the org can read any child's grades by id,
 * and any teacher can read any student's. The legacy NestJS backend had the
 * same hole (`gradebook.controller.ts` used `JwtAuthGuard` alone;
 * `exam-sessions.controller.ts:61-66` had `@Roles(PARENT, …)` and passed the
 * raw param straight through), and the Next.js port reproduced it faithfully —
 * narrowing it from cross-tenant to intra-tenant without closing it.
 *
 * The logic was first written inline in `app/api/analytics/student/[studentId]`
 * and is extracted here so every `studentId` surface enforces the SAME rule.
 * Duplicating it per route is how the endpoints drifted apart in the first
 * place: fixing one route left the same data reachable through four others.
 *
 * Access rules:
 *  - Anyone may read their own record.
 *  - ADMIN / TENANT_ADMIN / SUB_ADMIN: unrestricted within their org
 *    (they already administer every student in it).
 *  - PARENT: must be linked to the student via `LmsUserParent`.
 *  - TEACHER: must run a batch the student is in, or be their assigned manager.
 *  - MANAGER: must be the student's assigned manager.
 *  - Everyone else (notably LEARNER reading another learner): refused.
 */
export async function assertCanViewStudent(
  actor: AuthUser,
  studentId: string,
): Promise<void> {
  if (actor.id === studentId) return;

  const isAdmin =
    userHasRole(actor, 'ADMIN') ||
    userHasRole(actor, 'TENANT_ADMIN') ||
    userHasRole(actor, 'SUB_ADMIN');
  if (isAdmin) return;

  if (userHasRole(actor, 'PARENT')) {
    const link = await db.lmsUserParent.findUnique({
      where: { parentId_childId: { parentId: actor.id, childId: studentId } },
      select: { id: true },
    });
    if (link) return;
  }

  if (userHasRole(actor, 'TEACHER')) {
    // Shares a batch this teacher runs, or reports to them directly.
    const [sharedBatch, managed] = await Promise.all([
      db.lmsBatchStudent.findFirst({
        where: { studentId, batch: { orgId: actor.orgId ?? undefined, teacherId: actor.id } },
        select: { id: true },
      }),
      db.lmsUser.findFirst({
        where: { id: studentId, orgId: actor.orgId ?? undefined, managerId: actor.id },
        select: { id: true },
      }),
    ]);
    if (sharedBatch || managed) return;
  }

  if (userHasRole(actor, 'MANAGER')) {
    const managed = await db.lmsUser.findFirst({
      where: { id: studentId, orgId: actor.orgId ?? undefined, managerId: actor.id },
      select: { id: true },
    });
    if (managed) return;
  }

  throw Forbidden('You do not have access to this student');
}

/**
 * Batch-level counterpart: may the caller see records for everyone in a batch?
 *
 * Used by class-wide views (rankings, batch reports) where there is no single
 * `studentId` to check. Deliberately stricter than `assertCanViewStudent` —
 * a class ranking exposes every classmate's identity and grade at once, so a
 * LEARNER or PARENT is refused outright rather than shown a filtered list.
 */
export async function assertCanViewBatch(
  actor: AuthUser,
  batchId: string,
): Promise<void> {
  const isAdmin =
    userHasRole(actor, 'ADMIN') ||
    userHasRole(actor, 'TENANT_ADMIN') ||
    userHasRole(actor, 'SUB_ADMIN');
  if (isAdmin) return;

  if (userHasRole(actor, 'TEACHER')) {
    const own = await db.lmsBatch.findFirst({
      where: { id: batchId, orgId: actor.orgId ?? undefined, teacherId: actor.id },
      select: { id: true },
    });
    if (own) return;
  }

  throw Forbidden('You do not have access to this batch');
}
