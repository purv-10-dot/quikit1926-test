import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

/**
 * Cron-triggered endpoint. For each tenant with paySchedule.autoCreate=true,
 * creates next month's pay run when (today + autoCreateDaysBefore) >= computed payDate.
 *
 * Auth: requires header `x-cron-secret` matching env CRON_SECRET.
 *
 * Schedule (vercel cron / GitHub Actions / OS cron):
 *   Daily at 02:00 UTC: GET /api/cron/payroll-auto-create
 */

function lastDayOfMonth(year: number, monthIdx: number): Date {
  return new Date(year, monthIdx + 1, 0);
}

function computePayDate(periodEnd: Date, payDayType: string, payDayOfMonth: number | null): Date {
  if (payDayType === "FixedDay" && payDayOfMonth) {
    const d = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), payDayOfMonth);
    if (d < periodEnd) d.setMonth(d.getMonth() + 1);
    return d;
  }
  return periodEnd; // LastWorkingDay default
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  // Fail CLOSED: if CRON_SECRET is unset, reject (this endpoint mutates payroll).
  if (!secret || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const schedules = await prisma.paySchedule.findMany({
      where: { autoCreate: true },
    });

    const now = new Date();
    const results: { orgId: string; created: boolean; payRunId?: string; reason?: string }[] = [];

    for (const sch of schedules) {
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = lastDayOfMonth(now.getFullYear(), now.getMonth());
      const payDate = computePayDate(periodEnd, sch.payDayType, sch.payDayOfMonth);
      const triggerDate = new Date(payDate);
      triggerDate.setDate(triggerDate.getDate() - sch.autoCreateDaysBefore);

      if (now < triggerDate) {
        results.push({ orgId: sch.orgId, created: false, reason: "before trigger window" });
        continue;
      }

      // Check if already exists
      const existing = await prisma.payRun.findFirst({
        where: { orgId: sch.orgId, periodStart, periodEnd, deletedAt: null },
      });
      if (existing) {
        results.push({ orgId: sch.orgId, created: false, payRunId: existing.id, reason: "already exists" });
        continue;
      }

      const created = await prisma.payRun.create({
        data: {
          orgId: sch.orgId,
          periodStart, periodEnd, payDate,
          status: "Draft",
          notes: `Auto-created by scheduler on ${now.toISOString().slice(0, 10)}`,
          createdBy: "system:cron",
          updatedBy: "system:cron",
        },
      });
      await prisma.paySchedule.update({
        where: { orgId: sch.orgId },
        data: { autoCreateLastRunAt: now },
      });
      emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.RUN_CREATED, sch.orgId, "system:cron", created.id, {
        periodStart, periodEnd, payDate, autoCreated: true,
      }));
      results.push({ orgId: sch.orgId, created: true, payRunId: created.id });
    }

    return NextResponse.json({ success: true, processed: schedules.length, results });
  } catch (e) {
    console.error("GET /cron/payroll-auto-create error:", e);
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
