import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getCalendarForYear, deleteCalendar } from '@/lib/services/academic-calendar-service';

// GET /api/academic-calendar/:year — any authenticated user (legacy @Get(':year'))
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  return json(await getCalendarForYear(actor.orgId, params!.id));
});

// DELETE /api/academic-calendar/:id — any authenticated user
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  return json(await deleteCalendar(actor.orgId, params!.id));
});
