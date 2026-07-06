/**
 * Academic config service — ported from AcademicConfigService (Prisma).
 * Per-tenant Subject + Section tables. Defaults are seeded into the tenant on
 * first access (matching the legacy lazy seed). `addSection` upper-cases the name.
 */
import { prisma } from '@/lib/prisma';

const DEFAULT_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English',
  'Computer Science', 'History', 'Geography',
];
const DEFAULT_SECTIONS = ['A', 'B', 'C', 'D'];

export async function getSubjects(tenantId: string): Promise<string[]> {
  const subjects = await prisma.subject.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  if (subjects.length === 0) {
    await seedDefaultSubjects(tenantId);
    return DEFAULT_SUBJECTS;
  }
  return subjects.map((s) => s.name);
}

export async function addSubject(tenantId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Subject name is required');
  await prisma.subject.upsert({
    where: { tenantId_name: { tenantId, name: trimmed } },
    create: { tenantId, name: trimmed, isDefault: false },
    update: {},
  });
  return trimmed;
}

export async function getSections(tenantId: string, grade?: string): Promise<{ grade: string; name: string }[]> {
  const where: { tenantId: string; grade?: string } = { tenantId };
  if (grade) where.grade = grade;
  const sections = await prisma.section.findMany({ where, orderBy: [{ grade: 'asc' }, { name: 'asc' }] });
  if (sections.length === 0 && !grade) {
    await seedDefaultSections(tenantId);
    return DEFAULT_SECTIONS.map((s) => ({ grade: 'all', name: s }));
  }
  return sections.map((s) => ({ grade: s.grade, name: s.name }));
}

export async function getSectionNames(tenantId: string): Promise<string[]> {
  const rows = await prisma.section.findMany({
    where: { tenantId },
    select: { name: true },
    distinct: ['name'],
  });
  if (rows.length === 0) {
    await seedDefaultSections(tenantId);
    return DEFAULT_SECTIONS;
  }
  return rows.map((r) => r.name).sort();
}

export async function addSection(tenantId: string, grade: string, name: string): Promise<void> {
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) throw new Error('Section name is required');
  await prisma.section.upsert({
    where: { tenantId_grade_name: { tenantId, grade, name: trimmed } },
    create: { tenantId, grade, name: trimmed },
    update: {},
  });
}

async function seedDefaultSubjects(tenantId: string): Promise<void> {
  await prisma.subject.createMany({
    data: DEFAULT_SUBJECTS.map((name) => ({ tenantId, name, isDefault: true })),
    skipDuplicates: true,
  });
}

async function seedDefaultSections(tenantId: string): Promise<void> {
  await prisma.section.createMany({
    data: DEFAULT_SECTIONS.map((name) => ({ tenantId, grade: 'all', name })),
    skipDuplicates: true,
  });
}
