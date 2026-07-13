import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { markAttendance, type MarkAttendanceInput } from '@/lib/services/attendance-service';

const schema = z.object({
  scheduledClassId: z.string(),
  batchId: z.string().optional(),
  classDate: z.string().optional(),
  students: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(['present', 'absent', 'late', 'excused']),
      notes: z.string().optional(),
    }),
  ),
});

// POST /api/attendance/mark — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, schema);
  return json(await markAttendance(actor.orgId!, dto as MarkAttendanceInput, actor.id));
});
