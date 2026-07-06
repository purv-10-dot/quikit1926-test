/**
 * Payouts service — ported from NestJS PayoutsService (Mongoose → Prisma).
 *
 * Tenant isolation: every query is scoped by an explicit tenantId argument
 * (callers pass actor.tenantId; the controllers enforce roles). Mongo populate()
 * of teacher / completed classes / approvedBy is reproduced with manual lookups,
 * returning the same nested shapes the legacy API produced (with `_id` aliases).
 *
 * Cross-module helpers that the legacy service injected (scheduling, teacher-level,
 * non-teaching-work) are reproduced inline against Prisma to keep this module
 * self-contained (lib/services/* must not be modified).
 */
import type { Prisma, PayoutStatus, RateType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFound, BadRequest } from '@/lib/http';

const USER_NAME_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

async function userMap(ids: (string | null | undefined)[], select: Prisma.UserSelect = USER_NAME_SELECT) {
  const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select });
  return new Map(users.map((u) => [u.id, u as Record<string, unknown>]));
}

function shapeUser(u: Record<string, unknown> | undefined | null) {
  if (!u) return null;
  return { _id: u.id, ...u };
}

/** Load completed-class details for a payout's completedClasses, optionally with batch. */
async function loadCompletedClasses(scheduledClassIds: string[], withBatch: boolean) {
  if (!scheduledClassIds.length) return [];
  const classes = await prisma.scheduledClass.findMany({
    where: { id: { in: scheduledClassIds } },
    select: { id: true, title: true, startTime: true, endTime: true, batchId: true },
  });
  if (!withBatch) {
    return classes.map((c) => ({ _id: c.id, title: c.title, startTime: c.startTime, batchId: c.batchId }));
  }
  const batchMap = await loadBatchLite(classes.map((c) => c.batchId));
  return classes.map((c) => ({
    _id: c.id,
    title: c.title,
    startTime: c.startTime,
    endTime: c.endTime,
    batchId: batchMap.get(c.batchId) ?? c.batchId,
  }));
}

async function loadBatchLite(batchIds: string[]) {
  const unique = Array.from(new Set(batchIds.filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const batches = await prisma.batch.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, grade: true, subject: true },
  });
  return new Map(batches.map((b) => [b.id, { _id: b.id, name: b.name, grade: b.grade, subject: b.subject }]));
}

/** Shape a payout row (+ children) into the legacy populated document form. */
function shapePayout(
  payout: Record<string, unknown> & { adjustments?: unknown[] },
  opts: {
    teacher?: Record<string, unknown> | null;
    completedClasses?: unknown[];
    approvedBy?: Record<string, unknown> | null;
  } = {},
) {
  const out: Record<string, unknown> = { _id: payout.id, ...payout };
  if (opts.teacher !== undefined) out.teacherId = shapeUser(opts.teacher);
  if (opts.completedClasses !== undefined) out.completedClassIds = opts.completedClasses;
  if (opts.approvedBy !== undefined) out.approvedBy = shapeUser(opts.approvedBy);
  return out;
}

// ═══════════════ COMPLETED-CLASSES LOOKUP (scheduling helper) ═══════════════
async function findCompletedClassesForPayout(tenantId: string, teacherId: string, periodStart: Date, periodEnd: Date) {
  const classes = await prisma.scheduledClass.findMany({
    where: {
      tenantId,
      teacherId,
      status: 'completed',
      attendanceMarkedAt: { not: null },
      startTime: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { startTime: 'asc' },
  });
  const batchIds = Array.from(new Set(classes.map((c) => c.batchId)));
  const batches = await prisma.batch.findMany({
    where: { id: { in: batchIds } },
    select: { id: true, name: true, grade: true, subject: true, classType: true, ratePerClass: true },
  });
  const bmap = new Map(batches.map((b) => [b.id, b]));
  return classes.map((c) => ({ ...c, _id: c.id, batchId: bmap.get(c.batchId) ?? null, rawBatchId: c.batchId }));
}

// ═══════════════ TEACHER LEVEL RATE (teacher-level helper) ═══════════════
async function getTeacherRateByLevel(tenantId: string, teacherId: string, baseRate: number): Promise<number> {
  try {
    const level = await prisma.teacherLevel.findFirst({ where: { tenantId, teacherId } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const levelConfig = (tenant as Record<string, any> | null)?.enhancementConfig?.teacherLevel;
    if (!level || !levelConfig) return baseRate;
    switch (level.currentLevel) {
      case 'lead':
        return levelConfig.leadRate || baseRate;
      case 'intermediate':
        return levelConfig.intermediateRate || baseRate;
      case 'beginner':
        return levelConfig.beginnerRate || baseRate;
      default:
        return baseRate;
    }
  } catch {
    return baseRate;
  }
}

// ═══════════════ NON-TEACHING MONTHLY PAY (non-teaching-work helper) ═══════════════
async function getTeacherMonthlyNonTeachingPay(tenantId: string, teacherId: string, month: number, year: number): Promise<number> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  const tasks = await prisma.nonTeachingTask.findMany({
    where: { tenantId, teacherId, status: 'approved', approvedAt: { gte: startDate, lte: endDate } },
    select: { paymentAmount: true },
  });
  return tasks.reduce((sum, t) => sum + (t.paymentAmount || 0), 0);
}

// ═══════════════ GENERATE PAYOUTS ═══════════════
export async function generatePayouts(tenantId: string, dto: { month: number; year: number; perClassRate?: number }) {
  const periodStart = new Date(dto.year, dto.month - 1, 1);
  const periodEnd = new Date(dto.year, dto.month, 0, 23, 59, 59);

  const teachers = await prisma.user.findMany({ where: { tenantId, role: 'TEACHER', isActive: true } });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenantCfg = tenant as Record<string, any> | null;
  const defaultRate = tenantCfg?.payoutConfig?.defaultRatePerClass || 500;
  const demoTrialConfig = tenantCfg?.enhancementConfig?.demoTrial;

  const results: Record<string, unknown>[] = [];

  for (const teacher of teachers) {
    const teacherRateType = (teacher.rateType as string) || 'per_class';
    const teacherMonthlyPayout = teacher.monthlyPayout || 0;

    const completedClasses = await findCompletedClassesForPayout(tenantId, teacher.id, periodStart, periodEnd);

    if (completedClasses.length === 0 && teacherRateType !== 'monthly' && teacherRateType !== 'hybrid') continue;

    let baseRate = teacher.ratePerClass || dto.perClassRate || defaultRate;
    try {
      baseRate = await getTeacherRateByLevel(tenantId, teacher.id, baseRate);
    } catch {
      /* use base rate */
    }

    let grossAmount = 0;

    if (teacherRateType === 'monthly') {
      grossAmount = teacherMonthlyPayout;
    } else if (teacherRateType === 'hybrid') {
      grossAmount = teacherMonthlyPayout;
    }

    if (teacherRateType !== 'monthly') {
      for (const cls of completedClasses) {
        const batch = cls.batchId as Record<string, any> | null;
        const classType = batch?.classType || 'regular';
        const batchRate = batch?.ratePerClass;

        if (classType === 'demo' && demoTrialConfig?.demoRatePerClass) {
          grossAmount += demoTrialConfig.demoRatePerClass;
        } else if (classType === 'trial' && demoTrialConfig?.trialRatePerClass) {
          grossAmount += demoTrialConfig.trialRatePerClass;
        } else if (batchRate != null && batchRate > 0) {
          grossAmount += batchRate;
        } else {
          grossAmount += baseRate;
        }
      }
    }

    const ratePerClass = baseRate;
    const completedClassIds = completedClasses.map((c) => c.rawBatchId ? c._id : c._id) as string[];

    let nonTeachingWorkAmount = 0;
    try {
      nonTeachingWorkAmount = await getTeacherMonthlyNonTeachingPay(tenantId, teacher.id, dto.month, dto.year);
    } catch {
      /* ignore */
    }

    const existing = await prisma.teacherPayout.findFirst({
      where: { tenantId, teacherId: teacher.id, periodStart, periodEnd },
    });

    if (existing) {
      if (existing.status === 'draft') {
        const netAmount = grossAmount + nonTeachingWorkAmount + (existing.totalBonus || 0) - (existing.totalDeductions || 0);
        const updated = await prisma.teacherPayout.update({
          where: { id: existing.id },
          data: {
            totalClassesCompleted: completedClasses.length,
            ratePerClass,
            rateType: teacherRateType as RateType,
            grossAmount,
            nonTeachingWorkAmount,
            netAmount,
            completedClasses: {
              deleteMany: {},
              create: completedClassIds.map((scheduledClassId) => ({ scheduledClassId })),
            },
          },
        });
        results.push({ _id: updated.id, ...updated });
      }
      continue;
    }

    const payout = await prisma.teacherPayout.create({
      data: {
        tenantId,
        teacherId: teacher.id,
        periodStart,
        periodEnd,
        totalClassesCompleted: completedClasses.length,
        ratePerClass,
        rateType: teacherRateType as RateType,
        grossAmount,
        nonTeachingWorkAmount,
        netAmount: grossAmount + nonTeachingWorkAmount,
        status: 'draft',
        completedClasses: { create: completedClassIds.map((scheduledClassId) => ({ scheduledClassId })) },
      },
    });

    results.push({ _id: payout.id, ...payout });
  }

  return {
    generated: results.length,
    payouts: results,
    period: { month: dto.month, year: dto.year },
  };
}

// ═══════════════ LIST PAYOUTS ═══════════════
export async function findAll(
  tenantId: string,
  filters?: { month?: number; year?: number; status?: string; teacherId?: string; source?: string },
) {
  const where: Prisma.TeacherPayoutWhereInput = { tenantId };
  if (filters?.status) where.status = filters.status as PayoutStatus;
  if (filters?.teacherId) where.teacherId = filters.teacherId;
  if (filters?.source) where.source = filters.source as 'batch' | 'tutoring';

  let periodStart: Date | undefined;
  let periodEnd: Date | undefined;

  if (filters?.month && filters?.year) {
    periodStart = new Date(filters.year, filters.month - 1, 1);
    periodEnd = new Date(filters.year, filters.month, 0, 23, 59, 59);
    where.periodStart = { gte: periodStart };
    where.periodEnd = { lte: periodEnd };
  } else if (filters?.year) {
    periodStart = new Date(filters.year, 0, 1);
    periodEnd = new Date(filters.year, 11, 31, 23, 59, 59);
    where.periodStart = { gte: periodStart };
    where.periodEnd = { lte: periodEnd };
  }

  const rows = await prisma.teacherPayout.findMany({
    where,
    include: { adjustments: true, completedClasses: { select: { scheduledClassId: true } } },
    orderBy: { periodStart: 'desc' },
  });

  const teacherMap = await userMap(rows.map((r) => r.teacherId), {
    id: true, firstName: true, lastName: true, email: true, ratePerClass: true,
  });
  const approverMap = await userMap(rows.map((r) => r.approvedBy));

  const payouts = await Promise.all(
    rows.map(async (r) => {
      const completed = await loadCompletedClasses(r.completedClasses.map((c) => c.scheduledClassId), false);
      const { completedClasses: _cc, ...rest } = r;
      return shapePayout(
        { ...rest, adjustments: r.adjustments.map((a) => ({ _id: a.id, ...a })) },
        {
          teacher: teacherMap.get(r.teacherId) ?? null,
          completedClasses: completed,
          approvedBy: r.approvedBy ? approverMap.get(r.approvedBy) ?? null : null,
        },
      );
    }),
  );

  // Totals for the entire period (ignoring source filter)
  const totalsWhere: Prisma.TeacherPayoutWhereInput = { tenantId };
  if (periodStart && periodEnd) {
    totalsWhere.periodStart = { gte: periodStart };
    totalsWhere.periodEnd = { lte: periodEnd };
  }
  if (filters?.status) totalsWhere.status = filters.status as PayoutStatus;
  if (filters?.teacherId) totalsWhere.teacherId = filters.teacherId;

  const totalsRows = await prisma.teacherPayout.findMany({
    where: totalsWhere,
    select: { netAmount: true, source: true },
  });

  let tutoringPayoutTotal = 0;
  let batchPayoutTotal = 0;
  for (const t of totalsRows) {
    const src = t.source ?? 'batch';
    if (src === 'tutoring') tutoringPayoutTotal += t.netAmount;
    if (src === 'batch') batchPayoutTotal += t.netAmount;
  }

  return { payouts, tutoringPayoutTotal, batchPayoutTotal };
}

// ═══════════════ GET TEACHER'S PAYOUTS ═══════════════
export async function getTeacherPayouts(tenantId: string, teacherId: string, year?: number) {
  const where: Prisma.TeacherPayoutWhereInput = { tenantId, teacherId };
  if (year) {
    where.periodStart = { gte: new Date(year, 0, 1) };
    where.periodEnd = { lte: new Date(year, 11, 31, 23, 59, 59) };
  }

  const rows = await prisma.teacherPayout.findMany({
    where,
    include: { adjustments: true, completedClasses: { select: { scheduledClassId: true } } },
    orderBy: { periodStart: 'desc' },
  });

  return Promise.all(
    rows.map(async (r) => {
      const completed = await loadCompletedClasses(r.completedClasses.map((c) => c.scheduledClassId), true);
      const { completedClasses: _cc, ...rest } = r;
      return shapePayout(
        { _id: r.id, ...rest, adjustments: r.adjustments.map((a) => ({ _id: a.id, ...a })) },
        { completedClasses: completed },
      );
    }),
  );
}

// ═══════════════ GET PAYOUT BY ID ═══════════════
export async function findOne(tenantId: string, payoutId: string) {
  const r = await prisma.teacherPayout.findFirst({
    where: { id: payoutId, tenantId },
    include: { adjustments: true, completedClasses: { select: { scheduledClassId: true } } },
  });
  if (!r) throw NotFound('Payout not found');

  const teacherMap = await userMap([r.teacherId], {
    id: true, firstName: true, lastName: true, email: true, ratePerClass: true,
  });
  const approverMap = await userMap([r.approvedBy]);
  const completed = await loadCompletedClasses(r.completedClasses.map((c) => c.scheduledClassId), true);
  const { completedClasses: _cc, ...rest } = r;

  return shapePayout(
    { ...rest, adjustments: r.adjustments.map((a) => ({ _id: a.id, ...a })) },
    {
      teacher: teacherMap.get(r.teacherId) ?? null,
      completedClasses: completed,
      approvedBy: r.approvedBy ? approverMap.get(r.approvedBy) ?? null : null,
    },
  );
}

// ═══════════════ ADD ADJUSTMENT ═══════════════
export async function addAdjustment(
  tenantId: string,
  payoutId: string,
  dto: { type: 'bonus' | 'deduction' | 'reimbursement'; amount: number; reason: string },
  appliedBy: string,
) {
  const payout = await prisma.teacherPayout.findFirst({
    where: { id: payoutId, tenantId },
    include: { adjustments: true },
  });
  if (!payout) throw NotFound('Payout not found');
  if (payout.status === 'paid') throw BadRequest('Cannot add adjustments to a paid payout');

  await prisma.payoutAdjustment.create({
    data: {
      payoutId,
      type: dto.type,
      amount: dto.amount,
      reason: dto.reason,
      appliedBy,
      appliedAt: new Date(),
    },
  });

  const adjustments = await prisma.payoutAdjustment.findMany({ where: { payoutId } });
  let totalBonus = 0;
  let totalDeductions = 0;
  for (const adj of adjustments) {
    if (adj.type === 'bonus' || adj.type === 'reimbursement') totalBonus += adj.amount;
    if (adj.type === 'deduction') totalDeductions += adj.amount;
  }

  const netAmount = payout.grossAmount + (payout.nonTeachingWorkAmount || 0) + totalBonus - totalDeductions;
  await prisma.teacherPayout.update({
    where: { id: payoutId },
    data: { totalBonus, totalDeductions, netAmount },
  });

  return findOne(tenantId, payoutId);
}

// ═══════════════ STATUS TRANSITIONS ═══════════════
async function updateStatus(tenantId: string, payoutId: string, newStatus: PayoutStatus, allowedFrom: PayoutStatus[], extra: Prisma.TeacherPayoutUpdateInput = {}) {
  const result = await prisma.teacherPayout.updateMany({
    where: { id: payoutId, tenantId, status: { in: allowedFrom } },
    data: { status: newStatus, ...extra },
  });
  if (result.count === 0) throw BadRequest(`Payout not found or cannot transition to ${newStatus}`);
  return prisma.teacherPayout.findFirst({ where: { id: payoutId, tenantId } });
}

export async function submit(tenantId: string, payoutId: string) {
  return updateStatus(tenantId, payoutId, 'pending', ['draft']);
}

export async function approve(tenantId: string, payoutId: string, approvedBy: string) {
  const result = await prisma.teacherPayout.updateMany({
    where: { id: payoutId, tenantId, status: { in: ['pending', 'draft'] } },
    data: { status: 'approved', approvedBy, approvedAt: new Date() },
  });
  if (result.count === 0) throw BadRequest('Payout not found or cannot be approved');
  return prisma.teacherPayout.findFirst({ where: { id: payoutId, tenantId } });
}

export async function reject(tenantId: string, payoutId: string) {
  return updateStatus(tenantId, payoutId, 'rejected', ['pending']);
}

export async function markPaid(tenantId: string, payoutId: string, dto: { paymentMethod: string; paymentReference: string }) {
  const result = await prisma.teacherPayout.updateMany({
    where: { id: payoutId, tenantId, status: 'approved' },
    data: { status: 'paid', paidAt: new Date(), paymentMethod: dto.paymentMethod, paymentReference: dto.paymentReference },
  });
  if (result.count === 0) throw BadRequest('Payout not found or not approved');
  return prisma.teacherPayout.findFirst({ where: { id: payoutId, tenantId } });
}
