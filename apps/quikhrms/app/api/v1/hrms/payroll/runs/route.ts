import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, conflict } from "@/lib/api-response";
import { createPayRunSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { assertPayrollReady, findOverlappingRun, suggestPayDate } from "@/lib/services/payroll-run-state";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";
import { resolveApprovalChainLevels } from "@/lib/services/approval-chain";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const list = await prisma.payRun.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ periodStart: "desc" }],
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        payDate: true,
        payFrequency: true,
        status: true,
        employeeCount: true,
        totalGross: true,
        totalNet: true,
        totalDeductions: true,
        currency: true,
        createdAt: true,
      },
    });
    return successResponse(list);
  } catch (e) {
    console.error("GET /payroll/runs error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createPayRunSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const periodStart = new Date(parsed.data.periodStart);
    const periodEnd = new Date(parsed.data.periodEnd);

    if (periodEnd < periodStart) return validationError("Period end before start");

    // A pay run must lie within a single calendar month (YYYY-MM). We compare
    // the raw date strings to avoid timezone-shift bugs that would arise from
    // Date.getMonth() on UTC-parsed inputs near midnight.
    const startMonthKey = parsed.data.periodStart.slice(0, 7);
    const endMonthKey = parsed.data.periodEnd.slice(0, 7);
    if (startMonthKey !== endMonthKey) {
      return validationError(
        "Pay run period must lie within a single calendar month. Create a separate run for each month.",
      );
    }

    // Pay date must fall on or after the period end. You can't pay out for a
    // period before that period has finished.
    if (parsed.data.payDate && parsed.data.payDate < parsed.data.periodEnd) {
      return validationError("Pay date cannot be before period end. It can equal period end but not precede it.");
    }

    try {
      await assertPayrollReady(orgId);
    } catch (err) {
      return validationError((err as Error).message);
    }

    const overlap = await findOverlappingRun(orgId, periodStart, periodEnd);
    if (overlap) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      return conflict(
        `Pay run already exists for overlapping period ${fmt(overlap.periodStart)} to ${fmt(overlap.periodEnd)} (${overlap.status})`,
      );
    }

    const payDate = parsed.data.payDate
      ? new Date(parsed.data.payDate)
      : await suggestPayDate(orgId, periodEnd);

    const sched = await prisma.paySchedule.findUnique({ where: { orgId }, select: { currency: true, payFrequency: true } });
    let currency = sched?.currency ?? "INR";
    if (parsed.data.legalEntityId) {
      const entity = await prisma.legalEntity.findFirst({
        where: { id: parsed.data.legalEntityId, orgId, deletedAt: null },
        select: { currency: true },
      });
      if (entity) currency = entity.currency;
    }
    const payFrequency = parsed.data.payFrequency ?? sched?.payFrequency ?? "Monthly";

    const record = await prisma.payRun.create({
      data: {
        orgId,
        legalEntityId: parsed.data.legalEntityId ?? null,
        periodStart, periodEnd, payDate, currency, payFrequency,
        notes: parsed.data.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    // Seed the approval chain from the central Approval Chain (Settings →
    // Approval Chains → "Payroll") when one is configured. No chain → no rows
    // seeded (admins can still set a per-run chain manually, or approve
    // directly with hrms.settings.write — legacy behaviour, unchanged).
    try {
      const chain = await resolveApprovalChainLevels(orgId, "Payroll", null);
      if (chain.ok) {
        await prisma.payRunApproval.createMany({
          data: chain.levels.map((lv) => ({
            orgId,
            payRunId: record.id,
            level: lv.level,
            approverId: lv.approverId,
            approverRole: lv.kind,
            status: "Pending" as const,
            createdBy: userId,
            updatedBy: userId,
          })),
        });
      }
    } catch (e) {
      // Never block run creation on a chain-seeding problem — log and continue.
      console.error("payroll approval-chain seed failed", e);
    }

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "PayRun", entityId: record.id, changes: parsed.data,
    });
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.RUN_CREATED, orgId, userId, record.id, {
      periodStart, periodEnd, payDate,
    }));
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/runs error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
