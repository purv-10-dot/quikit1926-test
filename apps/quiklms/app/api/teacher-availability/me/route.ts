import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherAvailability, updateAvailableSlots } from '@/lib/services/teacher-availability-service';

const slotsSchema = z.object({
  slots: z.array(z.object({ dayOfWeek: z.number(), startTime: z.string(), endTime: z.string() })),
  maxSlotsPerWeek: z.number().optional(),
});

// GET /api/teacher-availability/me — TEACHER (own availability)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json({ success: true, data: await getTeacherAvailability(actor.orgId!, actor.id) });
});

// PUT /api/teacher-availability/me — TEACHER (update own availability)
export const PUT = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  const body = await parseBody(req, slotsSchema);
  await updateAvailableSlots(actor.orgId!, actor.id, body.slots, body.maxSlotsPerWeek);
  return json({ success: true, data: await getTeacherAvailability(actor.orgId!, actor.id) });
});
