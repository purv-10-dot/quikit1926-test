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

export async function getSubjects(orgId: string): Promise<string[]> {
  const subjects = await prisma.lmsSubject.findMany({
    where: { orgId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  if (subjects.length === 0) {
    await seedDefaultSubjects(orgId);
    return DEFAULT_SUBJECTS;
  }
  return subjects.map((s) => s.name);
}

export async function addSubject(orgId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Subject name is required');
  await prisma.lmsSubject.upsert({
    where: { orgId_name: { orgId, name: trimmed } },
    create: { orgId, name: trimmed, isDefault: false },
    update: {},
  });
  return trimmed;
}

export async function getSections(orgId: string, grade?: string): Promise<{ grade: string; name: string }[]> {
  const where: { orgId: string; grade?: string } = { orgId };
  if (grade) where.grade = grade;
  const sections = await prisma.lmsSection.findMany({ where, orderBy: [{ grade: 'asc' }, { name: 'asc' }] });
  if (sections.length === 0 && !grade) {
    await seedDefaultSections(orgId);
    return DEFAULT_SECTIONS.map((s) => ({ grade: 'all', name: s }));
  }
  return sections.map((s) => ({ grade: s.grade, name: s.name }));
}

export async function getSectionNames(orgId: string): Promise<string[]> {
  const rows = await prisma.lmsSection.findMany({
    where: { orgId },
    select: { name: true },
    distinct: ['name'],
  });
  if (rows.length === 0) {
    await seedDefaultSections(orgId);
    return DEFAULT_SECTIONS;
  }
  return rows.map((r) => r.name).sort();
}

export async function addSection(orgId: string, grade: string, name: string): Promise<void> {
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) throw new Error('Section name is required');
  await prisma.lmsSection.upsert({
    where: { orgId_grade_name: { orgId, grade, name: trimmed } },
    create: { orgId, grade, name: trimmed },
    update: {},
  });
}

async function seedDefaultSubjects(orgId: string): Promise<void> {
  await prisma.lmsSubject.createMany({
    data: DEFAULT_SUBJECTS.map((name) => ({ orgId, name, isDefault: true })),
    skipDuplicates: true,
  });
}

async function seedDefaultSections(orgId: string): Promise<void> {
  await prisma.lmsSection.createMany({
    data: DEFAULT_SECTIONS.map((name) => ({ orgId, grade: 'all', name })),
    skipDuplicates: true,
  });
}
