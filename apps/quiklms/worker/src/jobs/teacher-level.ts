/**
 * Monthly teacher-level recalculation — ported from
 * `TeacherLevelService.recalculateAllLevels` (`@Cron(EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)`).
 *
 * The new stack kept only the manual admin button (`POST /api/teacher-levels/recalculate`),
 * so levels went stale the moment nobody clicked it — and levels drive the
 * level-based payout rate (`lib/services/payouts-service.ts`), so a stale level
 * is a wrong payment, not just a wrong badge.
 *
 * The scoring formula is re-implemented here rather than imported: the worker is
 * a standalone process and cannot reach the Next app's `lib/`. It mirrors
 * `apps/quiklms/lib/services/teacher-level-service.ts` exactly —
 *   overallScore = max(0, round(totalClasses*2 + attendanceScore*0.3
 *                               + homeworkCompletionRate*0.2 - classesMissed*5))
 * — including the 12-entry cap on level history. Keep the two in sync.
 */
import type { LmsTeacherStatus } from '@prisma/client';
import { prisma } from '../db.js';

interface LevelConfig {
  beginnerMaxScore: number;
  intermediateMaxScore: number;
  leadMinScore: number;
}
const LEVEL_DEFAULTS: LevelConfig = { beginnerMaxScore: 80, intermediateMaxScore: 200, leadMinScore: 200 };

const HISTORY_CAP = 12; // Mongo `$slice: -12`

async function getLevelConfig(orgId: string): Promise<LevelConfig> {
  try {
    const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId }, select: { enhancementConfig: true } });
    const cfg = (tenant?.enhancementConfig as { teacherLevel?: Partial<LevelConfig> } | null)?.teacherLevel;
    if (cfg) return { ...LEVEL_DEFAULTS, ...cfg };
  } catch {
    /* use defaults */
  }
  return LEVEL_DEFAULTS;
}

/** Recompute + persist one teacher's level. Mirrors `calculateTeacherLevel`. */
export async function calculateTeacherLevel(orgId: string, teacherId: string): Promise<void> {
  const teacher = await prisma.lmsUser.findUnique({ where: { id: teacherId }, select: { classesMissed: true } });

  const totalClasses = await prisma.lmsScheduledClass.count({ where: { orgId, teacherId, status: 'completed' } });
  const totalScheduled = await prisma.lmsScheduledClass.count({
    where: { orgId, teacherId, status: { in: ['completed', 'in_progress', 'cancelled'] } },
  });
  const attendanceScore = totalScheduled > 0 ? Math.round((totalClasses / totalScheduled) * 100) : 0;

  // Homework grading rate — scoped to this tenant's submissions.
  let homeworkCompletionRate = 80;
  try {
    const teacherHomework = await prisma.lmsHomeworkSubmission.count({ where: { orgId, gradedBy: teacherId } });
    const totalSubmissions = await prisma.lmsHomeworkSubmission.count({
      where: { orgId, status: { in: ['submitted', 'graded'] } },
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

  const config = await getLevelConfig(orgId);
  let currentLevel: LmsTeacherStatus;
  if (overallScore >= config.intermediateMaxScore) currentLevel = 'lead';
  else if (overallScore >= config.beginnerMaxScore) currentLevel = 'intermediate';
  else currentLevel = 'beginner';

  const now = new Date();
  const existing = await prisma.lmsTeacherLevel.findFirst({ where: { orgId, teacherId }, select: { id: true } });
  const level = existing
    ? await prisma.lmsTeacherLevel.update({
        where: { id: existing.id },
        data: { currentLevel, totalClassesTaught: totalClasses, attendanceScore, homeworkCompletionRate, classesMissed, overallScore, lastCalculatedAt: now },
      })
    : await prisma.lmsTeacherLevel.create({
        data: { orgId, teacherId, currentLevel, totalClassesTaught: totalClasses, attendanceScore, homeworkCompletionRate, classesMissed, overallScore, lastCalculatedAt: now },
      });

  await prisma.lmsTeacherLevelHistory.create({
    data: {
      teacherLevelId: level.id,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      level: currentLevel,
      score: overallScore,
      calculatedAt: now,
    },
  });

  // Enforce $slice: -12 (keep the most recent 12 entries).
  const history = await prisma.lmsTeacherLevelHistory.findMany({
    where: { teacherLevelId: level.id },
    orderBy: { calculatedAt: 'asc' },
    select: { id: true },
  });
  if (history.length > HISTORY_CAP) {
    const toDelete = history.slice(0, history.length - HISTORY_CAP).map((h) => h.id);
    await prisma.lmsTeacherLevelHistory.deleteMany({ where: { id: { in: toDelete } } });
  }
}

/** Recompute every active teacher in one tenant. Mirrors `recalculateTenantLevels`. */
export async function recalculateTenantLevels(orgId: string): Promise<void> {
  const teachers = await prisma.lmsUser.findMany({
    where: { orgId, role: 'TEACHER', isActive: true },
    select: { id: true },
  });
  for (const t of teachers) {
    try {
      await calculateTeacherLevel(orgId, t.id);
    } catch (e) {
      // Skip the failed teacher, matching legacy resilience.
      console.error(`[teacherLevel] teacher ${t.id} failed:`, (e as Error).message);
    }
  }
}

/**
 * 1st of the month, 00:00 — recalculate every active teacher in every active tenant.
 *
 * "Active tenant" is `quikit.Org.status === 'active'`: `LmsTenant` no longer
 * carries its own status column (it was a second, unenforced source of truth —
 * see `lib/tenant-status.ts`), and `LmsTenant.orgId` always equals `LmsTenant.id`.
 */
export async function runMonthlyTeacherLevelRecalc(): Promise<void> {
  const tenants = await prisma.lmsTenant.findMany({ select: { orgId: true } });
  if (tenants.length === 0) return;
  const activeOrgs = await prisma.org.findMany({
    where: { id: { in: tenants.map((t) => t.orgId) }, status: 'active' },
    select: { id: true },
  });

  console.log(`[teacherLevel] monthly recalculation across ${activeOrgs.length} active tenant(s)`);
  for (const org of activeOrgs) {
    try {
      await recalculateTenantLevels(org.id);
    } catch (e) {
      console.error(`[teacherLevel] tenant ${org.id} failed:`, (e as Error).message);
    }
  }
  console.log('[teacherLevel] monthly recalculation complete');
}
