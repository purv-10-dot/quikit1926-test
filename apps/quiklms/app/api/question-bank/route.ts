import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { createQuestion, findAllQuestions } from '@/lib/services/question-bank-service';

const ROLES = ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER'] as const;

/**
 * Real schema, replacing `z.object({}).passthrough()` (F-003).
 *
 * `createQuestion` strips five audit keys and spreads the REST into
 * `prisma.lmsQuestion.create`, so `POST {}` reached Postgres missing three NOT
 * NULL columns and any stray key arrived as an unknown Prisma argument.
 * `subject`, `type` and `text` are the three columns with neither a default nor
 * a nullable type — and they are exactly the three the UI itself checks in
 * `validateQuestion()` before queueing a question, so requiring them cannot
 * reject anything the app sends.
 *
 * `options` and `correctAnswer` stay opaque: their shape varies by question
 * type (`[{text,isCorrect}]` for MCQ, a bare string for `one_word`, pairs for
 * `match_column`) and both are `Json` columns. `options` is `.optional()` and
 * not `.nullish()` on purpose — the column is `Json @default("[]")` and NOT
 * NULL, so an explicit `null` is genuinely invalid and now 400s instead of
 * dying in Postgres.
 */
const createQuestionSchema = z.object({
  subject: z.string().min(1, 'subject is required'),
  type: z.enum([
    'mcq', 'multi_select', 'true_false', 'short_answer',
    'long_answer', 'fill_blank', 'one_word', 'match_column',
  ]),
  text: z.string().min(1, 'text is required'),
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

// GET /api/question-bank?subject=&difficulty=&type=&tags=&topic=&search=&page=&limit=
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const url = new URL(req.url);
  // `getAll`, not `get`: Express parsed a repeated `?tags=a&tags=b` into an
  // array, while `searchParams.get()` returns only the FIRST value — so the
  // repeated form silently filtered on one tag and under-filtered the results
  // (and /count). Both forms are supported: repeated params and `?tags=a,b`.
  const tagsRaw = url.searchParams.getAll('tags');
  const tags = tagsRaw.length
    ? tagsRaw.flatMap((t) => t.split(',')).map((t) => t.trim()).filter(Boolean)
    : undefined;
  const page = url.searchParams.get('page');
  const limit = url.searchParams.get('limit');
  const result = await findAllQuestions(actor.orgId, {
    subject: url.searchParams.get('subject') || undefined,
    difficulty: url.searchParams.get('difficulty') || undefined,
    type: url.searchParams.get('type') || undefined,
    tags,
    topic: url.searchParams.get('topic') || undefined,
    search: url.searchParams.get('search') || undefined,
    page: page ? parseInt(page, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
  return json({ success: true, ...result });
});

// POST /api/question-bank
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.orgId) throw BadRequest('Tenant ID required');
  const body = await parseBody(req, createQuestionSchema);
  const question = await createQuestion(actor.orgId, actor.id, body as Record<string, unknown>);
  // 201 on creation — NestJS's @Post() default, and this repo's own standard
  // (CLAUDE.md: "POST returns 201 on creation").
  return json({ success: true, data: question }, 201);
});
