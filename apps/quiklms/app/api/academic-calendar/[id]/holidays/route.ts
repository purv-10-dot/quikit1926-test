import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { updateHolidays } from '@/lib/services/academic-calendar-service';

const holidaySchema = z.object({
  date: z.string(),
  name: z.string(),
  type: z.string().optional(),
});
const schema = z.object({ holidays: z.array(holidaySchema) });

// PATCH /api/academic-calendar/:id/holidays — any authenticated user
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const { holidays } = await parseBody(req, schema);
  return json(await updateHolidays(actor.orgId, params!.id, holidays));
});
