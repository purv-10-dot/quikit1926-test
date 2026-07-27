import { route, json, Forbidden } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTransactions } from '@/lib/services/credits-service';
import { db } from '@/lib/db';

// GET /api/credits/my-transactions — PARENT | LEARNER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['PARENT', 'LEARNER']);
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '') || 1;
  const limit = parseInt(url.searchParams.get('limit') || '') || 20;
  const studentIdParam = url.searchParams.get('studentId') || undefined;

  /**
   * A PARENT may only read THEIR OWN child's transactions.
   *
   * Both the legacy and the first port took any `studentId` a parent supplied,
   * with no parent↔child verification — so any parent could enumerate any
   * student's credit purchase and spend history by id. Faithful to the original,
   * but a real IDOR; `LmsUserParent` holds the link and is already used
   * elsewhere in this service.
   */
  let studentId = actor.id;
  if (actor.role === 'PARENT' && studentIdParam && studentIdParam !== actor.id) {
    const link = await db.lmsUserParent.findUnique({
      where: { parentId_childId: { parentId: actor.id, childId: studentIdParam } },
      select: { id: true },
    });
    if (!link) throw Forbidden('You do not have access to this student');
    studentId = studentIdParam;
  }

  return json(await getTransactions(actor.orgId!, studentId, page, limit));
});
