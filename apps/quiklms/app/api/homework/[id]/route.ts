import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findOne, update, remove, type UpdateHomeworkInput } from '@/lib/services/homework-service';

const resourceLink = z.object({ url: z.string(), label: z.string().optional() });

const updateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  attachmentUrls: z.array(z.string()).optional(),
  resourceLinks: z.array(resourceLink).optional(),
  dueDate: z.string().optional(),
  maxScore: z.number().min(0).max(100).optional(),
  allowLateSubmission: z.boolean().optional(),
  type: z.enum(['assignment', 'quiz', 'project', 'reading']).optional(),
});

// GET /api/homework/:id — any authed user
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await findOne(actor.tenantId!, params!.id));
});

// PATCH /api/homework/:id — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, updateSchema);
  return json(await update(actor.tenantId!, params!.id, dto as UpdateHomeworkInput));
});

// DELETE /api/homework/:id — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  await remove(actor.tenantId!, params!.id);
  return json(null);
});
