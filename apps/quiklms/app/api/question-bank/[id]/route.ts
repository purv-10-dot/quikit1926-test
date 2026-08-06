import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findQuestion, updateQuestion, softDeleteQuestion } from '@/lib/services/question-bank-service';

const ROLES = ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER'] as const;

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003). Same columns as
 * `POST /api/question-bank`, all optional: `updateQuestion` passes the body
 * through to `prisma.lmsQuestion.update`, which patches only the keys present.
 *
 * Two callers with different subsets — the question-bank page sends the whole
 * form, while the exam builder's inline editor sends only
 * `{text,type,options,correctAnswer,points,subject,difficulty}` — so requiring
 * anything here would break the second one.
 */
const updateQuestionSchema = z.object({
  subject: z.string().optional(),
  type: z.enum([
    'mcq', 'multi_select', 'true_false', 'short_answer',
    'long_answer', 'fill_blank', 'one_word', 'match_column',
  ]).optional(),
  text: z.string().optional(),
  topic: z.string().nullish(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  tags: z.array(z.string()).optional(),
  imageUrl: z.string().nullish(),
  audioUrl: z.string().nullish(),
  options: z.array(z.unknown()).optional(),
  correctAnswer: z.unknown().optional(),
  points: z.number().int().optional(),
  negativeMarks: z.number().int().optional(),
  explanation: z.string().nullish(),
  isActive: z.boolean().optional(),
});

// GET /api/question-bank/:id
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const data = await findQuestion(actor.orgId, params!.id);
  return json({ success: true, data });
});

// PUT /api/question-bank/:id
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const body = await parseBody(req, updateQuestionSchema);
  const data = await updateQuestion(actor.orgId, params!.id, body as Record<string, unknown>);
  return json({ success: true, data });
});

// DELETE /api/question-bank/:id
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  await softDeleteQuestion(actor.orgId, params!.id);
  return json({ success: true, message: 'Question deactivated' });
});
