import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findOne, update, archive, type UpdateBatchInput } from '@/lib/services/batches-service';

const scheduleItem = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  location: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().optional(),
  grade: z.string().optional(),
  section: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  teacherId: z.string().optional(),
  substituteTeacherIds: z.array(z.string()).optional(),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  term: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  schedule: z.array(scheduleItem).min(1).optional(),
  studentIds: z.array(z.string()).optional(),
  maxCapacity: z.number().min(1).optional(),
  defaultMeetingProvider: z.string().optional(),
  classType: z.string().optional(),
  trialClassCount: z.number().min(0).optional(),
  creditPerClass: z.number().min(0.25).optional(),
  ratePerClass: z.number().min(0).optional(),
  ratePerHour: z.number().min(0).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

// GET /api/batches/:id — any authed user
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await findOne(actor.tenantId!, params!.id));
});

// PATCH /api/batches/:id — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const dto = await parseBody(req, updateSchema);
  return json(await update(actor.tenantId!, params!.id, dto as UpdateBatchInput));
});

// DELETE /api/batches/:id — TENANT_ADMIN | SUB_ADMIN (archive)
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await archive(actor.tenantId!, params!.id));
});
