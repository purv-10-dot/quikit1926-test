import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getRemindersForTeacher } from '@/lib/services/student-reminders-service';

// GET /api/student-reminders/teacher — TEACHER (reminders for own classes)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json(await getRemindersForTeacher(actor.orgId!, actor.id));
});
