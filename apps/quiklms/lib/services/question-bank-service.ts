/**
 * Question bank service — ported from QuestionBankService (Prisma).
 * Tenant scoping via the tenantId argument. `subject`, `topic`, `tags` filters
 * and free-text `search` on the question `text`. Mongo `distinct` is emulated
 * with Prisma + JS de-dup.
 */
import type { Prisma, BankQuestionType, Difficulty } from '@prisma/client';
import { prisma } from '@/lib/prisma';
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

function buildWhere(tenantId: string, filters: QuestionFilters): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = {
    tenantId,
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

export async function createQuestion(tenantId: string, userId: string, data: Record<string, unknown>) {
  const { id: _id, tenantId: _t, createdBy: _c, createdAt: _ca, updatedAt: _ua, ...rest } = data as Record<string, unknown>;
  return prisma.question.create({
    data: { ...(rest as Prisma.QuestionCreateInput), tenantId, createdBy: userId },
  });
}

export async function findAllQuestions(tenantId: string, filters: QuestionFilters) {
  const where = buildWhere(tenantId, filters);
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, filters.limit || 50);
  const skip = (page - 1) * limit;

  const [questions, total] = await Promise.all([
    prisma.question.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.question.count({ where }),
  ]);

  return { questions, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function findQuestion(tenantId: string, id: string) {
  const question = await prisma.question.findFirst({ where: { id, tenantId } });
  if (!question) throw NotFound('Question not found');
  return question;
}

export async function updateQuestion(tenantId: string, id: string, data: Record<string, unknown>) {
  await findQuestion(tenantId, id);
  const { id: _id, tenantId: _t, createdBy: _c, createdAt: _ca, updatedAt: _ua, ...rest } = data as Record<string, unknown>;
  return prisma.question.update({ where: { id }, data: rest as Prisma.QuestionUpdateInput });
}

export async function softDeleteQuestion(tenantId: string, id: string) {
  await findQuestion(tenantId, id);
  return prisma.question.update({ where: { id }, data: { isActive: false } });
}

export async function bulkCreateQuestions(tenantId: string, userId: string, questions: Record<string, unknown>[]) {
  const created = await Promise.all(
    questions.map((q) => createQuestion(tenantId, userId, q)),
  );
  return created;
}

export async function getQuestionSubjects(tenantId: string): Promise<string[]> {
  const rows = await prisma.question.findMany({
    where: { tenantId, isActive: true },
    select: { subject: true },
    distinct: ['subject'],
  });
  return rows.map((r) => r.subject).filter(Boolean);
}

export async function getQuestionTopics(tenantId: string, subject?: string): Promise<string[]> {
  const where: Prisma.QuestionWhereInput = { tenantId, isActive: true };
  if (subject) where.subject = subject;
  const rows = await prisma.question.findMany({ where, select: { topic: true }, distinct: ['topic'] });
  return rows.map((r) => r.topic).filter((t): t is string => !!t);
}

export async function getQuestionTags(tenantId: string): Promise<string[]> {
  const rows = await prisma.question.findMany({
    where: { tenantId, isActive: true },
    select: { tags: true },
  });
  const set = new Set<string>();
  for (const r of rows) for (const t of r.tags) set.add(t);
  return [...set];
}

export async function countQuestionsByFilters(
  tenantId: string,
  filters: { subject?: string; difficulty?: string; tags?: string[] },
): Promise<number> {
  const where: Prisma.QuestionWhereInput = { tenantId, isActive: true };
  if (filters.subject) where.subject = filters.subject;
  if (filters.difficulty) where.difficulty = filters.difficulty as Difficulty;
  if (filters.tags?.length) where.tags = { hasSome: filters.tags };
  return prisma.question.count({ where });
}
