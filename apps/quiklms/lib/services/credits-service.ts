/**
 * Credits service — ported from NestJS CreditsService (Mongoose → Prisma).
 * Tenant scoping via explicit orgId arguments. Credit deduction logic (FIFO
 * across packages, creditTransaction logging, remainingCredits decrement) is
 * ported faithfully. Parent→child links use the UserParent join (legacy used a
 * denormalized childrenIds array).
 */
import type { Prisma, TransactionType } from '@prisma/client';
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
  const tenant = await prisma.tenant.findUnique({ where: { id: orgId }, select: { creditConfig: true } });
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

  const creditPackage = await prisma.creditPackage.create({
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

  await prisma.creditTransaction.create({
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
  const packages = await prisma.creditPackage.findMany({
    where: { orgId, studentId, status: 'active', remainingCredits: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { purchaseDate: 'asc' }],
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

  await prisma.creditPackage.update({
    where: { id: packageToUse.id },
    data: { usedCredits: newUsed, remainingCredits: newRemaining, status: newStatus },
  });

  const transaction = await prisma.creditTransaction.create({
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
  const result = await prisma.creditPackage.aggregate({
    where: { studentId, status: 'active' },
    _sum: { remainingCredits: true },
  });
  return result._sum.remainingCredits ?? 0;
}

// ═══════════════ GET STUDENT BALANCE ═══════════════
export async function getStudentBalance(orgId: string, studentId: string) {
  const packages = await prisma.creditPackage.findMany({
    where: { orgId, studentId, status: 'active' },
    orderBy: { expiresAt: 'asc' },
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
  const where: Prisma.CreditTransactionWhereInput = { orgId, studentId };

  const [rawTransactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.creditTransaction.count({ where }),
  ]);

  // Reproduce populate('relatedClassId','title startTime') + populate('processedBy','firstName lastName')
  const classIds = rawTransactions.map((t) => t.relatedClassId).filter(Boolean) as string[];
  const processorIds = rawTransactions.map((t) => t.processedBy).filter(Boolean) as string[];
  const [classes, processors] = await Promise.all([
    classIds.length
      ? prisma.scheduledClass.findMany({ where: { id: { in: classIds } }, select: { id: true, title: true, startTime: true } })
      : Promise.resolve([]),
    processorIds.length
      ? prisma.user.findMany({ where: { id: { in: processorIds } }, select: { id: true, firstName: true, lastName: true } })
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
  const pkg = await prisma.creditPackage.findFirst({ where: { id: dto.packageId, orgId } });
  if (!pkg) throw NotFound('Credit package not found');

  const newUsed = Math.max(0, pkg.usedCredits - dto.amount);
  const newRemaining = pkg.remainingCredits + dto.amount;
  const newStatus = newRemaining > 0 && pkg.status === 'exhausted' ? 'active' : pkg.status;

  await prisma.creditPackage.update({
    where: { id: pkg.id },
    data: { usedCredits: newUsed, remainingCredits: newRemaining, status: newStatus },
  });

  await prisma.creditTransaction.create({
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

// ═══════════════ CREDIT PACKAGE DEFINITIONS (TENANT CONFIG) ═══════════════
export async function getPackageDefinitions(orgId: string) {
  return (await getCreditConfig(orgId)).packages || [];
}

export async function createPackageDefinition(
  orgId: string,
  dto: { name: string; credits: number; price: number; validityMonths: number; isActive?: boolean },
) {
  const config = await getCreditConfig(orgId);
  const id = crypto.randomUUID();
  const newPkg = {
    id,
    name: dto.name,
    credits: dto.credits,
    price: dto.price,
    validityMonths: dto.validityMonths,
    isActive: dto.isActive !== false,
  };
  const packages = [...(config.packages || []), newPkg];
  await prisma.tenant.update({
    where: { id: orgId },
    data: { creditConfig: { ...(config as Record<string, unknown>), packages } as Prisma.InputJsonValue },
  });
  return { id, ...dto, isActive: dto.isActive !== false };
}

export async function updatePackageDefinition(
  orgId: string,
  packageId: string,
  dto: { name?: string; credits?: number; price?: number; validityMonths?: number; isActive?: boolean },
) {
  const config = await getCreditConfig(orgId);
  const packages = (config.packages || []).map((p) => {
    if ((p as { id?: string }).id !== packageId) return p;
    const updated = { ...p };
    if (dto.name !== undefined) updated.name = dto.name;
    if (dto.credits !== undefined) updated.credits = dto.credits;
    if (dto.price !== undefined) updated.price = dto.price;
    if (dto.validityMonths !== undefined) updated.validityMonths = dto.validityMonths;
    if (dto.isActive !== undefined) updated.isActive = dto.isActive;
    return updated;
  });
  await prisma.tenant.update({
    where: { id: orgId },
    data: { creditConfig: { ...(config as Record<string, unknown>), packages } as Prisma.InputJsonValue },
  });
  return { success: true };
}

export async function deletePackageDefinition(orgId: string, packageId: string) {
  const config = await getCreditConfig(orgId);
  const packages = (config.packages || []).filter((p) => (p as { id?: string }).id !== packageId);
  await prisma.tenant.update({
    where: { id: orgId },
    data: { creditConfig: { ...(config as Record<string, unknown>), packages } as Prisma.InputJsonValue },
  });
  return { success: true };
}

// ═══════════════ ZERO CREDIT STATUS ═══════════════
export async function getZeroCreditStatus(orgId: string, studentId: string) {
  const totalRemaining = await getTotalRemainingCredits(studentId);
  const config = await getCreditConfig(orgId);
  const policy = config.zeroCreditPolicy || 'warn';
  const gracePeriodClasses = config.gracePeriodClasses ?? 3;

  const exhaustedPackages = await prisma.creditPackage.findMany({
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
  const parent = await prisma.user.findFirst({ where: { id: parentId, orgId } });
  if (!parent) throw NotFound('Parent not found');

  const links = await prisma.userParent.findMany({ where: { parentId }, select: { childId: true } });
  const childrenIds = links.map((l) => l.childId);
  const children = childrenIds.length
    ? await prisma.user.findMany({
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
