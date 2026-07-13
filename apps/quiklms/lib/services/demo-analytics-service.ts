/**
 * Demo-analytics service — ported from NestJS DemoAnalyticsService.
 * Mongo aggregation pipelines re-expressed as Prisma queries + JS aggregation,
 * preserving the exact response objects. Tenant isolation via explicit orgId.
 * `studentIds` membership is the batchStudent child table here.
 */
import { prisma } from '@/lib/prisma';
import { Internal } from '@/lib/http';

// ═══════════════ DASHBOARD ANALYTICS ═══════════════
export async function getAnalytics(orgId: string) {
  const [totalDemo, totalTrial, totalRegular] = await Promise.all([
    prisma.batch.count({ where: { orgId, classType: 'demo' } }),
    prisma.batch.count({ where: { orgId, classType: 'trial' } }),
    prisma.batch.count({ where: { orgId, OR: [{ classType: 'regular' }, { classType: null }] } }),
  ]);

  const convertedBatches = await prisma.batch.count({
    where: { orgId, classType: { in: ['demo', 'trial'] }, convertedToRegular: true },
  });
  const totalDemoTrial = totalDemo + totalTrial;
  const conversionRate = totalDemoTrial > 0 ? Math.round((convertedBatches / totalDemoTrial) * 100) : 0;

  const demoTrialBatches = await prisma.batch.findMany({
    where: { orgId, classType: { in: ['demo', 'trial'] } },
    select: { id: true, trialClassCount: true, classType: true, convertedToRegular: true },
  });
  const demoTrialBatchIds = demoTrialBatches.map((b) => b.id);

  const [completedDemoClasses, totalDemoClasses] = await Promise.all([
    prisma.scheduledClass.count({ where: { orgId, batchId: { in: demoTrialBatchIds }, status: 'completed' } }),
    prisma.scheduledClass.count({ where: { orgId, batchId: { in: demoTrialBatchIds } } }),
  ]);

  const [demoAttendancePresent, demoAttendanceTotal] = await Promise.all([
    prisma.attendance.count({ where: { orgId, batchId: { in: demoTrialBatchIds }, status: { in: ['present', 'late'] } } }),
    prisma.attendance.count({ where: { orgId, batchId: { in: demoTrialBatchIds } } }),
  ]);
  const demoAttendanceRate = demoAttendanceTotal > 0 ? Math.round((demoAttendancePresent / demoAttendanceTotal) * 100) : 0;

  // Average trial classes before conversion
  const convertedTrialBatches = demoTrialBatches.filter((b) => b.convertedToRegular);
  let avgTrialClassesBeforeConversion = 0;
  if (convertedTrialBatches.length > 0) {
    let totalTrialClasses = 0;
    for (const batch of convertedTrialBatches) {
      const classCount = await prisma.scheduledClass.count({ where: { batchId: batch.id, status: 'completed' } });
      totalTrialClasses += classCount;
    }
    avgTrialClassesBeforeConversion = Math.round(totalTrialClasses / convertedTrialBatches.length);
  }

  // Monthly trend — last 6 months ($group by year/month)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const trendBatches = await prisma.batch.findMany({
    where: { orgId, classType: { in: ['demo', 'trial'] }, createdAt: { gte: sixMonthsAgo } },
    select: { createdAt: true, convertedToRegular: true },
  });
  const trendBuckets = new Map<string, { _id: { year: number; month: number }; total: number; converted: number }>();
  for (const b of trendBatches) {
    const year = b.createdAt.getFullYear();
    const month = b.createdAt.getMonth() + 1;
    const key = `${year}-${month}`;
    let bucket = trendBuckets.get(key);
    if (!bucket) {
      bucket = { _id: { year, month }, total: 0, converted: 0 };
      trendBuckets.set(key, bucket);
    }
    bucket.total += 1;
    if (b.convertedToRegular) bucket.converted += 1;
  }
  const monthlyTrend = Array.from(trendBuckets.values()).sort(
    (a, b) => a._id.year - b._id.year || a._id.month - b._id.month,
  );

  return {
    summary: {
      totalDemo,
      totalTrial,
      totalRegular,
      convertedBatches,
      conversionRate,
      completedDemoClasses,
      totalDemoClasses,
      demoAttendanceRate,
      avgTrialClassesBeforeConversion,
    },
    monthlyTrend,
  };
}

// ═══════════════ TEACHER CONVERSION PERFORMANCE ═══════════════
export async function getTeacherConversionPerformance(orgId: string) {
  const batches = await prisma.batch.findMany({
    where: { orgId, classType: { in: ['demo', 'trial'] } },
    select: { teacherId: true, convertedToRegular: true },
  });

  const byTeacher = new Map<string, { totalDemoTrial: number; converted: number }>();
  for (const b of batches) {
    let agg = byTeacher.get(b.teacherId);
    if (!agg) {
      agg = { totalDemoTrial: 0, converted: 0 };
      byTeacher.set(b.teacherId, agg);
    }
    agg.totalDemoTrial += 1;
    if (b.convertedToRegular) agg.converted += 1;
  }

  const teachers = await prisma.user.findMany({
    where: { id: { in: Array.from(byTeacher.keys()) } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const tmap = new Map(teachers.map((t) => [t.id, t]));

  const stats = Array.from(byTeacher.entries()).map(([teacherId, agg]) => {
    const t = tmap.get(teacherId);
    return {
      _id: teacherId,
      teacherId,
      teacherName: t ? `${t.firstName} ${t.lastName}` : undefined,
      teacherEmail: t?.email,
      totalDemoTrial: agg.totalDemoTrial,
      converted: agg.converted,
      conversionRate: agg.totalDemoTrial > 0 ? Math.round((agg.converted / agg.totalDemoTrial) * 100) : 0,
    };
  });

  stats.sort((a, b) => b.conversionRate - a.conversionRate);
  return stats;
}

// ═══════════════ STUDENT JOURNEY ═══════════════
export async function getStudentJourney(orgId: string, studentId: string) {
  const batches = await prisma.batch.findMany({
    where: { orgId, students: { some: { studentId } } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true, classType: true, convertedToRegular: true, convertedAt: true,
      startDate: true, endDate: true, teacherId: true, subject: true, createdAt: true,
    },
  });

  const teachers = await prisma.user.findMany({
    where: { id: { in: batches.map((b) => b.teacherId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const tmap = new Map(teachers.map((t) => [t.id, { _id: t.id, ...t }]));

  const journey = batches.map((b) => ({
    batchId: b.id,
    batchName: b.name,
    subject: b.subject,
    classType: b.classType || 'regular',
    teacher: tmap.get(b.teacherId) ?? b.teacherId,
    startDate: b.startDate,
    endDate: b.endDate,
    convertedToRegular: b.convertedToRegular || false,
    convertedAt: b.convertedAt,
    enrolledAt: b.createdAt,
  }));

  const hasDemo = journey.some((j) => j.classType === 'demo');
  const hasTrial = journey.some((j) => j.classType === 'trial');
  const hasRegular = journey.some((j) => j.classType === 'regular');

  return {
    studentId,
    journey,
    currentStage: hasRegular ? 'regular' : hasTrial ? 'trial' : hasDemo ? 'demo' : 'none',
    completedStages: { demo: hasDemo, trial: hasTrial, regular: hasRegular },
  };
}

// ═══════════════ CONVERT BATCH TO REGULAR ═══════════════
export async function convertToRegular(orgId: string, batchId: string) {
  const result = await prisma.batch.updateMany({
    where: { id: batchId, orgId, classType: { in: ['demo', 'trial'] } },
    data: { convertedToRegular: true, convertedAt: new Date(), classType: 'regular' },
  });
  if (result.count === 0) throw Internal('Batch not found or not a demo/trial batch');
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  return { _id: batch!.id, ...batch };
}
