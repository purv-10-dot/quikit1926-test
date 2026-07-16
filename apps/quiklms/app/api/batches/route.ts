import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { create, findAll, type CreateBatchInput } from '@/lib/services/batches-service';
import type { LmsBatchStatus as BatchStatus } from '@prisma/client';

const scheduleItem = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  location: z.string().optional(),
});

const createSchema = z.object({
  name: z.string(),
  grade: z.string().optional(),
  section: z.string().optional(),
  subject: z.string(),
  description: z.string().optional(),
  teacherId: z.string(),
  substituteTeacherIds: z.array(z.string()).optional(),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/),
  term: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  schedule: z.array(scheduleItem).min(1),
  studentIds: z.array(z.string()).optional(),
  maxCapacity: z.number().min(1).optional(),
  defaultMeetingProvider: z.string().optional(),
  classType: z.string().optional(),
  trialClassCount: z.number().min(0).optional(),
  creditPerClass: z.number().min(0.25).optional(),
  ratePerClass: z.number().min(0).optional(),
  ratePerHour: z.number().min(0).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  batchType: z.string().optional(),
  source: z.string().optional(),
  tutoringRequestId: z.string().optional(),
});

// POST /api/batches — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const dto = await parseBody(req, createSchema);
  return json(await create(actor.orgId!, dto as CreateBatchInput, actor.id));
});

// GET /api/batches?status=&teacherId=&academicYear=&grade=&subject= — any authed user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  return json(
    await findAll(actor.orgId!, {
      status: (url.searchParams.get('status') as BatchStatus) || undefined,
      teacherId: url.searchParams.get('teacherId') || undefined,
      academicYear: url.searchParams.get('academicYear') || undefined,
      grade: url.searchParams.get('grade') || undefined,
      subject: url.searchParams.get('subject') || undefined,
    }),
  );
});
