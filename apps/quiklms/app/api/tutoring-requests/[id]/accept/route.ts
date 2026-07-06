import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { accept } from '@/lib/services/tutoring-requests-service';

const schema = z.object({
  confirmedSlot: z.object({ date: z.string(), startTime: z.string(), endTime: z.string() }),
  teacherNotes: z.string().optional(),
});

// PATCH /api/tutoring-requests/:id/accept — TEACHER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  const dto = await parseBody(req, schema);
  return json(await accept(actor.tenantId!, actor.id, params!.id, dto));
});
