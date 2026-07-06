import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherAvailability, updateAvailableSlots } from '@/lib/services/teacher-availability-service';

const slotsSchema = z.object({
  slots: z.array(z.object({ dayOfWeek: z.number(), startTime: z.string(), endTime: z.string() })),
  maxSlotsPerWeek: z.number().optional(),
});

// GET /api/teacher-availability/:teacherId — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await getTeacherAvailability(actor.tenantId!, params!.teacherId) });
});

// PUT /api/teacher-availability/:teacherId — TENANT_ADMIN | SUB_ADMIN
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const body = await parseBody(req, slotsSchema);
  await updateAvailableSlots(actor.tenantId!, params!.teacherId, body.slots, body.maxSlotsPerWeek);
  return json({ success: true, data: await getTeacherAvailability(actor.tenantId!, params!.teacherId) });
});
