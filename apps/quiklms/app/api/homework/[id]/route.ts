import { z } from 'zod';
import { route, json } from '@/lib/http';
import { dateField, parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findOne, update, remove, type UpdateHomeworkInput } from '@/lib/services/homework-service';
import { maxScoreField, resourceLink } from '@/lib/services/homework-schema';

// Bounds must match the create schema exactly — an edit that the create would
// have accepted must not be rejected, and vice versa.
const updateSchema = z.object({
  title: z.string().min(1, 'title is required').optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  attachmentUrls: z.array(z.string().min(1)).optional(),
  resourceLinks: z.array(resourceLink).optional(),
  dueDate: dateField.optional(),
  maxScore: maxScoreField.optional(),
  allowLateSubmission: z.boolean().optional(),
  lateSubmissionDeadline: dateField.optional(),
  latePenaltyPercent: z.number().min(0).max(100).optional(),
  type: z.enum(['assignment', 'quiz', 'project', 'reading']).optional(),
});

// GET /api/homework/:id — any authed user
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  return json(await findOne(actor.orgId!, params!.id));
});

// PATCH /api/homework/:id — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const dto = await parseBody(req, updateSchema);
  return json(await update(actor.orgId!, params!.id, dto as UpdateHomeworkInput));
});

// DELETE /api/homework/:id — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  await remove(actor.orgId!, params!.id);
  return json(null);
});
