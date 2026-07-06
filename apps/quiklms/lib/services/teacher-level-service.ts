/**
 * Teacher-level service — ported from NestJS TeacherLevelService (Mongoose → Prisma).
 * Tenant isolation enforced via explicit tenantId args. The cron-driven monthly
 * recalculation lives in the worker (Phase 4); these functions own the DB state.
 *
 * levelHistory (capped at last 12 in Mongo via $slice:-12) is the
 * teacherLevelHistory child table here; the cap is enforced after each push.
 */
import type { TeacherStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

interface LevelConfig {
  beginnerMaxScore: number;
  intermediateMaxScore: number;
  leadMinScore: number;
  [k: string]: unknown;
}

async function getLevelConfig(tenantId: string): Promise<LevelConfig> {
  const defaults: LevelConfig = { beginnerMaxScore: 80, intermediateMaxScore: 200, leadMinScore: 200 };
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const cfg = (tenant as Record<string, any> | null)?.enhancementConfig?.teacherLevel;
    if (cfg) return { ...defaults, ...cfg };
  } catch {
    /* use defaults */
  }
  return defaults;
}

export async function getTeacherLevel(tenantId: string, teacherId: string) {
  let level = await prisma.teacherLevel.findFirst({ where: { tenantId, teacherId } });
  if (!level) {
    level = await prisma.teacherLevel.create({ data: { tenantId, teacherId } });
  }
  return level;
}

export async function getAllTeacherLevels(tenantId: string) {
  const rows = await prisma.teacherLevel.findMany({
    where: { tenantId },
    include: { levelHistory: { orderBy: { calculatedAt: 'asc' } } },
    orderBy: { overallScore: 'desc' },
  });
  const teacherIds = rows.map((r) => r.teacherId);
  const teachers = await prisma.user.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, firstName: true, lastName: true, email: true, classesCompleted: true, classesMissed: true, punctualityScore: true },
  });
  const tmap = new Map(teachers.map((t) => [t.id, t]));

  return rows.map((r) => {
    const t = tmap.get(r.teacherId);
    return {
      _id: r.id,
      ...r,
      levelHistory: r.levelHistory.map((h) => ({ _id: h.id, ...h })),
      teacherId: t ? { _id: t.id, ...t } : r.teacherId,
    };
  });
}

export async function calculateTeacherLevel(tenantId: string, teacherId: string) {
  const teacher = await prisma.user.findUnique({ where: { id: teacherId } });

  const totalClasses = await prisma.scheduledClass.count({
    where: { tenantId, teacherId, status: 'completed' },
  });

  const totalScheduled = await prisma.scheduledClass.count({
    where: { tenantId, teacherId, status: { in: ['completed', 'in_progress', 'cancelled'] } },
  });
  const attendanceScore = totalScheduled > 0 ? Math.round((totalClasses / totalScheduled) * 100) : 0;

  // Homework grading rate — scoped to this tenant's submissions
  let homeworkCompletionRate = 80;
  try {
    const teacherHomework = await prisma.homeworkSubmission.count({ where: { tenantId, gradedBy: teacherId } });
    const totalSubmissions = await prisma.homeworkSubmission.count({
      where: { tenantId, status: { in: ['submitted', 'graded'] } },
    });
    if (totalSubmissions > 0 && teacherHomework > 0) {
      homeworkCompletionRate = Math.min(100, Math.round((teacherHomework / totalSubmissions) * 100));
    }
  } catch {
    /* keep default */
  }

  const classesMissed = teacher?.classesMissed || 0;
  const missedPenalty = classesMissed * 5;

  const overallScore = Math.max(
    0,
    Math.round(totalClasses * 2 + attendanceScore * 0.3 + homeworkCompletionRate * 0.2 - missedPenalty),
  );

  const config = await getLevelConfig(tenantId);

  let currentLevel: TeacherStatus;
  if (overallScore >= config.intermediateMaxScore) currentLevel = 'lead';
  else if (overallScore >= config.beginnerMaxScore) currentLevel = 'intermediate';
  else currentLevel = 'beginner';

  const now = new Date();

  const existing = await prisma.teacherLevel.findFirst({ where: { tenantId, teacherId } });
  const level = existing
    ? await prisma.teacherLevel.update({
        where: { id: existing.id },
        data: { currentLevel, totalClassesTaught: totalClasses, attendanceScore, homeworkCompletionRate, classesMissed, overallScore, lastCalculatedAt: now },
      })
    : await prisma.teacherLevel.create({
        data: { tenantId, teacherId, currentLevel, totalClassesTaught: totalClasses, attendanceScore, homeworkCompletionRate, classesMissed, overallScore, lastCalculatedAt: now },
      });

  await prisma.teacherLevelHistory.create({
    data: {
      teacherLevelId: level.id,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      level: currentLevel,
      score: overallScore,
      calculatedAt: now,
    },
  });

  // Enforce $slice: -12 (keep most recent 12 entries)
  const history = await prisma.teacherLevelHistory.findMany({
    where: { teacherLevelId: level.id },
    orderBy: { calculatedAt: 'asc' },
    select: { id: true },
  });
  if (history.length > 12) {
    const toDelete = history.slice(0, history.length - 12).map((h) => h.id);
    await prisma.teacherLevelHistory.deleteMany({ where: { id: { in: toDelete } } });
  }

  const result = await prisma.teacherLevel.findUnique({
    where: { id: level.id },
    include: { levelHistory: { orderBy: { calculatedAt: 'asc' } } },
  });
  return { _id: result!.id, ...result, levelHistory: result!.levelHistory.map((h) => ({ _id: h.id, ...h })) };
}

export async function recalculateTenantLevels(tenantId: string) {
  const teachers = await prisma.user.findMany({
    where: { tenantId, role: 'TEACHER', isActive: true },
    select: { id: true },
  });
  for (const teacher of teachers) {
    try {
      await calculateTeacherLevel(tenantId, teacher.id);
    } catch {
      /* skip failed teacher, matching legacy resilience */
    }
  }
}
