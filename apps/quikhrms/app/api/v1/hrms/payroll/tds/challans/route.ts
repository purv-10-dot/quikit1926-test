import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createTdsChallanSchema } from "@/lib/validations/payroll";
import { refreshLiabilityForPeriod } from "@/lib/services/tds-liability";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

/**
 * AY derivation: a payment made within FY YYYY-(YY+1) is assessed in
 * AY (YYYY+1)-(YY+2).  e.g. paid 07 May 2026 (FY 2026-27) → AY 2027-28.
 */
function deriveAssessmentYear(depositDate: Date): string {
  const m = depositDate.getUTCMonth() + 1;
  const y = depositDate.getUTCFullYear();
  const fyStart = m >= 4 ? y : y - 1;
  const ayStart = fyStart + 1;
  const ayEnd = (ayStart + 1) % 100;
  return `${ayStart}-${ayEnd.toString().padStart(2, "0")}`;
}

/** Default allocation period if caller doesn't specify: the month BEFORE deposit. */
function defaultAllocationPeriod(depositDate: Date): { periodYear: number; periodMonth: number } {
  const d = new Date(depositDate);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return { periodYear: d.getUTCFullYear(), periodMonth: d.getUTCMonth() + 1 };
}

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const fy = searchParams.get("fy");
    const status = searchParams.get("status");

    const where: Prisma.TdsChallanWhereInput = {
      orgId,
      deletedAt: null,
      ...(status && { status: status as Prisma.EnumTdsChallanStatusFilter["equals"] }),
    };

    if (fy) {
      const fyStart = parseInt(fy.slice(0, 4), 10);
      if (!Number.isNaN(fyStart)) {
        where.depositDate = {
          gte: new Date(Date.UTC(fyStart, 3, 1)),
          lte: new Date(Date.UTC(fyStart + 1, 2, 31)),
        };
      }
    }

    const challans = await prisma.tdsChallan.findMany({
      where,
      orderBy: { depositDate: "desc" },
      include: {
        allocations: {
          include: {
            period: { select: { periodYear: true, periodMonth: true, natureOfPayment: true } },
          },
        },
      },
    });

    const totalDeposited = challans.reduce((s, c) => s + Number(c.totalAmount), 0);
    const totalUnallocated = challans.reduce((s, c) => s + Number(c.remainingAmount), 0);

    return successResponse({
      challans,
      summary: {
        count: challans.length,
        totalDeposited,
        totalUnallocated,
      },
    });
  } catch (e) {
    console.error("GET /payroll/tds/challans error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createTdsChallanSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const depositDate = new Date(data.depositDate);
    if (Number.isNaN(depositDate.getTime())) return validationError("Invalid deposit date");
    if (depositDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return validationError("Deposit date cannot be in the future");
    }

    // Duplicate CIN guard (also enforced by @@unique).
    const dup = await prisma.tdsChallan.findFirst({
      where: { orgId, cin: data.cin, deletedAt: null },
      select: { id: true },
    });
    if (dup) return conflict(`A challan with CIN "${data.cin}" already exists`);

    // Decide allocations — explicit from caller, else default to (depositDate - 1 month).
    const allocations = data.allocations && data.allocations.length > 0
      ? data.allocations
      : [{
          ...defaultAllocationPeriod(depositDate),
          amount: data.basicTax,
          natureOfPayment: data.natureOfPayment,
        }];

    const assessmentYear = deriveAssessmentYear(depositDate);

    // Single transaction so allocations + period totals stay consistent.
    const challan = await prisma.$transaction(async (tx) => {
      const c = await tx.tdsChallan.create({
        data: {
          orgId,
          cin: data.cin,
          bsrCode: data.bsrCode,
          challanSerial: data.challanSerial,
          depositDate,
          assessmentYear,
          natureOfPayment: data.natureOfPayment,
          tanNumber: data.tanNumber,
          basicTax: data.basicTax,
          surcharge: data.surcharge,
          educationCess: data.educationCess,
          interest: data.interest,
          lateFee: data.lateFee,
          others: data.others,
          totalAmount: data.totalAmount,
          paymentMode: data.paymentMode,
          bankName: data.bankName ?? null,
          acknowledgmentNumber: data.acknowledgmentNumber ?? null,
          remainingAmount: data.totalAmount, // adjusted below
          status: "Recorded",
          createdBy: userId,
        },
      });

      let consumed = 0;
      for (const a of allocations) {
        // Ensure the liability period exists (upsert with totalDeducted=0 if new).
        const period = await tx.tdsLiabilityPeriod.upsert({
          where: {
            orgId_periodYear_periodMonth_natureOfPayment: {
              orgId,
              periodYear: a.periodYear,
              periodMonth: a.periodMonth,
              natureOfPayment: a.natureOfPayment,
            },
          },
          create: {
            orgId,
            periodYear: a.periodYear,
            periodMonth: a.periodMonth,
            natureOfPayment: a.natureOfPayment,
            totalDeducted: 0,
            totalAllocated: 0,
            employeeCount: 0,
            dueDate: a.periodMonth === 3
              ? new Date(Date.UTC(a.periodYear, 3, 30))
              : new Date(Date.UTC(
                  a.periodMonth === 12 ? a.periodYear + 1 : a.periodYear,
                  a.periodMonth % 12,
                  7,
                )),
            status: "Pending",
          },
          update: {},
        });

        await tx.tdsChallanAllocation.create({
          data: {
            orgId,
            challanId: c.id,
            liabilityPeriodId: period.id,
            allocatedAmount: a.amount,
            isAutoAllocated: !data.allocations,
            allocatedBy: userId,
          },
        });
        consumed += a.amount;
      }

      const remaining = Math.max(0, Number(c.totalAmount) - consumed);
      const status = remaining <= 0.01
        ? "FullyAllocated"
        : consumed > 0
          ? "PartiallyAllocated"
          : "Recorded";

      return tx.tdsChallan.update({
        where: { id: c.id },
        data: { remainingAmount: remaining, status },
      });
    });

    // Recompute touched periods' totalAllocated + status.
    for (const a of allocations) {
      await refreshLiabilityForPeriod(orgId, a.periodYear, a.periodMonth, a.natureOfPayment);
    }

    await createAuditLog({
      orgId, userId, action: "Create",
      entityType: "TdsChallan", entityId: challan.id,
      metadata: { cin: data.cin, total: data.totalAmount, allocations: allocations.length },
    });

    return successResponse(challan, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/tds/challans error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
