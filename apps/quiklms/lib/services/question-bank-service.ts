/**
 * Question bank service — ported from QuestionBankService (Prisma).
 * Tenant scoping via the orgId argument. `subject`, `topic`, `tags` filters
 * and free-text `search` on the question `text`. Mongo `distinct` is emulated
 * with Prisma + JS de-dup.
 */
import type { Prisma, LmsBankQuestionType as BankQuestionType, LmsDifficulty as Difficulty } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFound } from '@/lib/http';

export interface QuestionFilters {
  subject?: string;
  difficulty?: string;
  type?: string;
  tags?: string[];
  topic?: string;
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

function buildWhere(orgId: string, filters: QuestionFilters): Prisma.LmsQuestionWhereInput {
  const where: Prisma.LmsQuestionWhereInput = {
    orgId,
    isActive: filters.isActive !== false,
  };
  if (filters.subject) where.subject = filters.subject;
  if (filters.difficulty) where.difficulty = filters.difficulty as Difficulty;
  if (filters.type) where.type = filters.type as BankQuestionType;
  if (filters.topic) where.topic = { contains: filters.topic, mode: 'insensitive' };
  if (filters.tags?.length) where.tags = { hasSome: filters.tags };
  if (filters.search) where.text = { contains: filters.search, mode: 'insensitive' };
  return where;
}

export async function createQuestion(orgId: string, userId: string, data: Record<string, unknown>) {
  const { id: _id, orgId: _t, createdBy: _c, createdAt: _ca, updatedAt: _ua, ...rest } = data as Record<string, unknown>;
  return db.lmsQuestion.create({
    data: { ...(rest as Prisma.LmsQuestionCreateInput), orgId, createdBy: userId },
  });
}

export async function findAllQuestions(orgId: string, filters: QuestionFilters) {
  const where = buildWhere(orgId, filters);
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, filters.limit || 50);
  const skip = (page - 1) * limit;

  const [questions, total] = await Promise.all([
    db.lmsQuestion.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    db.lmsQuestion.count({ where }),
  ]);

  return { questions, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function findQuestion(orgId: string, id: string) {
  const question = await db.lmsQuestion.findFirst({ where: { id, orgId } });
  if (!question) throw NotFound('Question not found');
  return question;
}

export async function updateQuestion(orgId: string, id: string, data: Record<string, unknown>) {
  await findQuestion(orgId, id);
  const { id: _id, orgId: _t, createdBy: _c, createdAt: _ca, updatedAt: _ua, ...rest } = data as Record<string, unknown>;
  return db.lmsQuestion.update({ where: { id }, data: rest as Prisma.LmsQuestionUpdateInput });
}

export async function softDeleteQuestion(orgId: string, id: string) {
  await findQuestion(orgId, id);
  return db.lmsQuestion.update({ where: { id }, data: { isActive: false } });
}

/**
 * Bulk import — ALL-OR-NOTHING.
 *
 * The legacy used `insertMany` (`question-bank.service.ts:98`), which with the
 * default `ordered: true` validates every document and writes none if any fails.
 * The port used `Promise.all` of independent creates, so importing 50 questions
 * where #37 is invalid **committed the other 49** and returned a 500 — the admin
 * then re-uploaded the corrected file and got duplicates, with no way to tell
 * which rows had landed.
 *
 * A single `$transaction` restores the legacy's contract: the bank is either
 * fully updated or untouched.
 */
export async function bulkCreateQuestions(orgId: string, userId: string, questions: Record<string, unknown>[]) {
  if (!questions.length) return [];
  return db.$transaction(
    questions.map((q) => {
      const { id: _id, orgId: _t, createdBy: _c, createdAt: _ca, updatedAt: _ua, ...rest } = q;
      return db.lmsQuestion.create({
        data: { ...(rest as Prisma.LmsQuestionCreateInput), orgId, createdBy: userId },
      });
    }),
  );
}

export async function getQuestionSubjects(orgId: string): Promise<string[]> {
  const rows = await db.lmsQuestion.findMany({
    where: { orgId, isActive: true },
    select: { subject: true },
    distinct: ['subject'],
  });
  return rows.map((r) => r.subject).filter(Boolean);
}

export async function getQuestionTopics(orgId: string, subject?: string): Promise<string[]> {
  const where: Prisma.LmsQuestionWhereInput = { orgId, isActive: true };
  if (subject) where.subject = subject;
  const rows = await db.lmsQuestion.findMany({ where, select: { topic: true }, distinct: ['topic'] });
  return rows.map((r) => r.topic).filter((t): t is string => !!t);
}

export async function getQuestionTags(orgId: string): Promise<string[]> {
  const rows = await db.lmsQuestion.findMany({
    where: { orgId, isActive: true },
    select: { tags: true },
  });
  const set = new Set<string>();
  for (const r of rows) for (const t of r.tags) set.add(t);
  return [...set];
}

export async function countQuestionsByFilters(
  orgId: string,
  filters: { subject?: string; difficulty?: string; tags?: string[] },
): Promise<number> {
  const where: Prisma.LmsQuestionWhereInput = { orgId, isActive: true };
  if (filters.subject) where.subject = filters.subject;
  if (filters.difficulty) where.difficulty = filters.difficulty as Difficulty;
  if (filters.tags?.length) where.tags = { hasSome: filters.tags };
  return db.lmsQuestion.count({ where });
}
