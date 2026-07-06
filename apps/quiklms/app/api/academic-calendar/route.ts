import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { createCalendar, getAllCalendars } from '@/lib/services/academic-calendar-service';

const termSchema = z.object({
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean().optional(),
});
const holidaySchema = z.object({
  date: z.string(),
  name: z.string(),
  type: z.string().optional(),
});
const createSchema = z.object({
  academicYear: z.string(),
  terms: z.array(termSchema).optional(),
  holidays: z.array(holidaySchema).optional(),
});

// POST /api/academic-calendar — any authenticated user
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const dto = await parseBody(req, createSchema);
  return json(await createCalendar(actor.tenantId, dto, actor.id));
});

// GET /api/academic-calendar — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  return json(await getAllCalendars(actor.tenantId));
});
