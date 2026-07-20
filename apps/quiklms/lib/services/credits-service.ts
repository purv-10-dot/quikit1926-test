/**
 * Credits service — ported from NestJS CreditsService (Mongoose → Prisma).
 * Tenant scoping via explicit orgId arguments. Credit deduction logic (FIFO
 * across packages, creditTransaction logging, remainingCredits decrement) is
 * ported faithfully. Parent→child links use the UserParent join (legacy used a
 * denormalized childrenIds array).
 */
import type { Prisma, LmsTransactionType as TransactionType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, NotFound } from '@/lib/http';

export interface CreditDeductionResult {
  success: boolean;
  deductedFromPackage: string;
  packageRemainingCredits: number;
  totalRemainingCredits: number;
  transactionId: string;
  warnings: string[];
}

interface TenantCreditConfig {
  expiryMonths?: number;
  lowCreditThreshold?: number;
  zeroCreditPolicy?: string;
  gracePeriodClasses?: number;
  packages?: Array<Record<string, unknown>>;
}

async function getCreditConfig(orgId: string): Promise<TenantCreditConfig> {
  const tenant = await prisma.lmsTenant.findUnique({ where: { id: orgId }, select: { creditConfig: true } });
  return ((tenant?.creditConfig as TenantCreditConfig) || {}) as TenantCreditConfig;
}

// ═══════════════ ALLOCATE CREDITS TO STUDENT ═══════════════
export async function allocateCredits(
  orgId: string,
  dto: { studentId: string; packageName: string; credits: number; price?: number; validityMonths?: number; expiresAt?: string; notes?: string },
  allocatedBy: string,
) {
  let expiresAt: Date;
  if (dto.expiresAt) {
    expiresAt = new Date(dto.expiresAt);
  } else if (dto.validityMonths) {
    expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + dto.validityMonths);
  } else {
    const months = (await getCreditConfig(orgId)).expiryMonths || 6;
    expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);
  }

  const creditPackage = await prisma.lmsCreditPackage.create({
    data: {
      orgId,
      studentId: dto.studentId,
      packageName: dto.packageName,
      purchasedCredits: dto.credits,
      usedCredits: 0,
      remainingCredits: dto.credits,
      purchaseDate: new Date(),
      expiresAt,
      status: 'active',
      price: dto.price,
      notes: dto.notes,
      allocatedBy,
    },
  });

  await prisma.lmsCreditTransaction.create({
    data: {
      orgId,
      packageId: creditPackage.id,
      studentId: dto.studentId,
      transactionType: 'purchase',
      amount: dto.credits,
      balanceAfter: dto.credits,
      notes: `Credits allocated: ${dto.packageName}`,
      processedBy: allocatedBy,
    },
  });

  return creditPackage;
}

// ═══════════════ DEDUCT CREDIT (FIFO) ═══════════════
export async function deductCredit(
  orgId: string,
  studentId: string,
  classId?: string,
  attendanceId?: string,
  creditAmount = 1,
  customNotes?: string,
  customType?: TransactionType,
): Promise<CreditDeductionResult> {
  const packages = await prisma.lmsCreditPackage.findMany({
    where: { orgId, studentId, status: 'active', remainingCredits: { gt: 0 } },
    // `nulls: 'first'` is REQUIRED for parity, not a style choice. Mongo sorts
    // missing values FIRST, so the legacy drained never-expiring packages before
    // expiring ones (`credits.service.ts:96-103`). Prisma/Postgres put NULLs LAST
    // by default, which silently inverted FIFO package selection for any student
    // holding a mix — the opposite package gets consumed.
    orderBy: [{ expiresAt: { sort: 'asc', nulls: 'first' } }, { purchaseDate: 'asc' }],
  });
  if (packages.length === 0) throw BadRequest('No credits available for this student');

  const packageToUse = packages[0];
  const newUsed = packageToUse.usedCredits + creditAmount;
  let newRemaining = packageToUse.remainingCredits - creditAmount;
  let newStatus = packageToUse.status;
  if (newRemaining <= 0) {
    newRemaining = Math.max(0, newRemaining);
    newStatus = 'exhausted';
  }

  await prisma.lmsCreditPackage.update({
    where: { id: packageToUse.id },
    data: { usedCredits: newUsed, remainingCredits: newRemaining, status: newStatus },
  });

  const transaction = await prisma.lmsCreditTransaction.create({
    data: {
      orgId: packageToUse.orgId,
      packageId: packageToUse.id,
      studentId,
      transactionType: customType || 'deduct',
      amount: -creditAmount,
      balanceAfter: newRemaining,
      relatedClassId: classId,
      relatedAttendanceId: attendanceId,
      notes: customNotes || `Credit deducted for class attendance (${creditAmount} credits)`,
    },
  });

  const totalRemaining = await getTotalRemainingCredits(studentId);

  const warnings: string[] = [];
  const threshold = (await getCreditConfig(packageToUse.orgId)).lowCreditThreshold || 3;
  if (totalRemaining <= threshold) warnings.push(`Low credit balance: ${totalRemaining} remaining`);

  return {
    success: true,
    deductedFromPackage: packageToUse.id,
    packageRemainingCredits: newRemaining,
    totalRemainingCredits: totalRemaining,
    transactionId: transaction.id,
    warnings,
  };
}

// ═══════════════ GET TOTAL REMAINING CREDITS ═══════════════
export async function getTotalRemainingCredits(studentId: string): Promise<number> {
  const result = await prisma.lmsCreditPackage.aggregate({
    where: { studentId, status: 'active' },
    _sum: { remainingCredits: true },
  });
  return result._sum.remainingCredits ?? 0;
}

// ═══════════════ GET STUDENT BALANCE ═══════════════
export async function getStudentBalance(orgId: string, studentId: string) {
  const packages = await prisma.lmsCreditPackage.findMany({
    where: { orgId, studentId, status: 'active' },
    orderBy: { expiresAt: { sort: 'asc', nulls: 'first' } }, // Mongo sorts nulls first — see deductCredit
  });

  const totalRemaining = packages.reduce((sum, p) => sum + p.remainingCredits, 0);
  const totalPurchased = packages.reduce((sum, p) => sum + p.purchasedCredits, 0);
  const totalUsed = packages.reduce((sum, p) => sum + p.usedCredits, 0);
  const soonestExpiring = packages.find((p) => p.expiresAt);

  return {
    available: totalRemaining,
    remainingCredits: totalRemaining,
    totalCredits: totalPurchased,
    totalPurchased,
    usedCredits: totalUsed,
    totalUsed,
    expiringSoon: soonestExpiring
      ? { credits: soonestExpiring.remainingCredits, expiresAt: soonestExpiring.expiresAt }
      : null,
    packages: packages.map((p) => ({
      id: p.id,
      packageName: p.packageName,
      remainingCredits: p.remainingCredits,
      purchasedCredits: p.purchasedCredits,
      expiresAt: p.expiresAt,
      purchaseDate: p.purchaseDate,
    })),
  };
}

// ═══════════════ GET TRANSACTIONS ═══════════════
export async function getTransactions(orgId: string, studentId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const where: Prisma.LmsCreditTransactionWhereInput = { orgId, studentId };

  const [rawTransactions, total] = await Promise.all([
    prisma.lmsCreditTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.lmsCreditTransaction.count({ where }),
  ]);

  // Reproduce populate('relatedClassId','title startTime') + populate('processedBy','firstName lastName')
  const classIds = rawTransactions.map((t) => t.relatedClassId).filter(Boolean) as string[];
  const processorIds = rawTransactions.map((t) => t.processedBy).filter(Boolean) as string[];
  const [classes, processors] = await Promise.all([
    classIds.length
      ? prisma.lmsScheduledClass.findMany({ where: { id: { in: classIds } }, select: { id: true, title: true, startTime: true } })
      : Promise.resolve([]),
    processorIds.length
      ? prisma.lmsUser.findMany({ where: { id: { in: processorIds } }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
  ]);
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const procMap = new Map(processors.map((p) => [p.id, p]));

  const transactions = rawTransactions.map((t) => ({
    ...t,
    relatedClassId: t.relatedClassId ? classMap.get(t.relatedClassId) ?? t.relatedClassId : t.relatedClassId,
    processedBy: t.processedBy ? procMap.get(t.processedBy) ?? t.processedBy : t.processedBy,
  }));

  return { transactions, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// ═══════════════ REFUND CREDITS ═══════════════
export async function refundCredits(
  orgId: string,
  dto: { packageId: string; amount: number; reason: string; notes?: string },
  processedBy: string,
) {
  const pkg = await prisma.lmsCreditPackage.findFirst({ where: { id: dto.packageId, orgId } });
  if (!pkg) throw NotFound('Credit package not found');

  /**
   * A refund cannot exceed what was actually used.
   *
   * Neither the legacy nor the first port bounded this, so refunding more than
   * `usedCredits` inflated `remainingCredits` without limit — free credits from
   * a typo, on a balance real money was paid for. Clamped to the used amount,
   * which is the most that can legitimately be given back.
   */
  if (dto.amount <= 0) throw BadRequest('Refund amount must be greater than zero');
  if (dto.amount > pkg.usedCredits) {
    throw BadRequest(
      `Cannot refund ${dto.amount} credits — only ${pkg.usedCredits} have been used from this package.`,
    );
  }

  const newUsed = Math.max(0, pkg.usedCredits - dto.amount);
  const newRemaining = pkg.remainingCredits + dto.amount;
  const newStatus = newRemaining > 0 && pkg.status === 'exhausted' ? 'active' : pkg.status;

  await prisma.lmsCreditPackage.update({
    where: { id: pkg.id },
    data: { usedCredits: newUsed, remainingCredits: newRemaining, status: newStatus },
  });

  await prisma.lmsCreditTransaction.create({
    data: {
      orgId,
      packageId: pkg.id,
      studentId: pkg.studentId,
      transactionType: 'refund',
      amount: dto.amount,
      balanceAfter: newRemaining,
      notes: `Refund: ${dto.reason}`,
      processedBy,
    },
  });

  return { success: true, newBalance: newRemaining };
}

// ═══════════════ CREDIT PACKAGE DEFINITIONS (TENANT CATALOGUE) ═══════════════
/**
 * Backed by the `LmsCreditPackageDefinition` TABLE, not the `creditConfig` JSON
 * blob (schema change approved by the product owner, 2026-07-18).
 *
 * Every edit used to be a read-modify-write of the whole `creditConfig` object,
 * so two admins editing packages concurrently silently lost one edit — and the
 * blob rewrite could clobber a concurrent change to any OTHER creditConfig key
 * (`expiryMonths`, `lowCreditThreshold`, `zeroCreditPolicy`). Mongo's
 * `$push`/`$pull` on the subdocument array could not lose a sibling write that
 * way. Each definition is now an independently-updatable row, so concurrent
 * edits to different packages cannot collide at all, and an edit to the same
 * package is a single atomic UPDATE.
 *
 * MIGRATION NOTE: any definitions still living in `creditConfig.packages` are
 * read back as a fallback in `getPackageDefinitions` until they are moved. Writes
 * only ever go to the table.
 */
export async function getPackageDefinitions(orgId: string) {
  const rows = await prisma.lmsCreditPackageDefinition.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length) return rows;

  // Legacy fallback — tenants whose catalogue has not been migrated off the blob.
  return (await getCreditConfig(orgId)).packages || [];
}

export async function createPackageDefinition(
  orgId: string,
  dto: { name: string; credits: number; price: number; validityMonths: number; isActive?: boolean },
) {
  return prisma.lmsCreditPackageDefinition.create({
    data: {
      orgId,
      name: dto.name,
      credits: dto.credits,
      price: dto.price,
      validityMonths: dto.validityMonths,
      isActive: dto.isActive !== false,
    },
  });
}

export async function updatePackageDefinition(
  orgId: string,
  packageId: string,
  dto: { name?: string; credits?: number; price?: number; validityMonths?: number; isActive?: boolean },
) {
  // Scoped update — a definition from another tenant cannot be touched, and the
  // whole change is one atomic statement.
  const result = await prisma.lmsCreditPackageDefinition.updateMany({
    where: { id: packageId, orgId },
    data: {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.credits !== undefined ? { credits: dto.credits } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.validityMonths !== undefined ? { validityMonths: dto.validityMonths } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    },
  });
  if (result.count === 0) throw NotFound('Credit package definition not found');
  return { success: true };
}

export async function deletePackageDefinition(orgId: string, packageId: string) {
  const result = await prisma.lmsCreditPackageDefinition.deleteMany({ where: { id: packageId, orgId } });
  if (result.count === 0) throw NotFound('Credit package definition not found');
  return { success: true };
}

// ═══════════════ ZERO CREDIT STATUS ═══════════════
export async function getZeroCreditStatus(orgId: string, studentId: string) {
  const totalRemaining = await getTotalRemainingCredits(studentId);
  const config = await getCreditConfig(orgId);
  const policy = config.zeroCreditPolicy || 'warn';
  const gracePeriodClasses = config.gracePeriodClasses ?? 3;

  const exhaustedPackages = await prisma.lmsCreditPackage.findMany({
    where: { orgId, studentId, status: 'exhausted' },
  });
  const graceClassesUsed = exhaustedPackages.reduce(
    (sum, p) => sum + ((p as unknown as { graceClassesUsed?: number }).graceClassesUsed || 0),
    0,
  );

  return { hasCredits: totalRemaining > 0, totalRemaining, graceClassesUsed, gracePeriodClasses, policy };
}

// ═══════════════ GET BALANCE BY PARENT (find children) ═══════════════
export async function getBalanceByParent(orgId: string, parentId: string) {
  const parent = await prisma.lmsUser.findFirst({ where: { id: parentId, orgId } });
  if (!parent) throw NotFound('Parent not found');

  const links = await prisma.lmsUserParent.findMany({ where: { parentId }, select: { childId: true } });
  const childrenIds = links.map((l) => l.childId);
  const children = childrenIds.length
    ? await prisma.lmsUser.findMany({
        where: { id: { in: childrenIds } },
        select: { id: true, firstName: true, lastName: true, grade: true },
      })
    : [];
  const childMap = new Map(children.map((c) => [c.id, c]));

  const balances: unknown[] = [];
  for (const childId of childrenIds) {
    const balance = await getStudentBalance(orgId, childId);
    const child = childMap.get(childId);
    balances.push({
      studentId: childId,
      studentName: child ? `${child.firstName} ${child.lastName}` : 'Unknown',
      grade: child?.grade,
      ...balance,
    });
  }
  return balances;
}
