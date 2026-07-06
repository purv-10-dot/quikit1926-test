import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { editAttendance, type EditAttendanceInput } from '@/lib/services/attendance-service';

const schema = z.object({
  status: z.enum(['present', 'absent', 'late', 'excused']),
  reason: z.string(),
  notes: z.string().optional(),
});

// PATCH /api/attendance/:id — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const dto = await parseBody(req, schema);
  return json(await editAttendance(actor.tenantId!, params!.id, dto as EditAttendanceInput, actor.id, actor.role));
});
