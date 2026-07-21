import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fireWorkflow } from "@/lib/workflows/executor";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/cron/lifecycle-automations
 *
 * Daily on/offboarding automations (run once a day). Each trigger matches an
 * exact day-offset window, so a once-a-day run fires it exactly once — no extra
 * idempotency marker needed. Access-revocation is guarded by employee status.
 *
 *  Onboarding : IT-provisioning reminder @ DOJ−5 · welcome @ DOJ−2 ·
 *               probation-review reminder (~2 wks before) · 30/60/90 pulse check-ins
 *  Offboarding: clearance reminders @ LWD−3 & LWD−1 · auto access-revocation @ LWD
 *
 * Auth: x-cron-secret header must match CRON_SECRET.
 */
const SYS = "system-lifecycle";

function dayRange(base: Date, offsetDays: number): { gte: Date; lt: Date } {
  const gte = new Date(base); gte.setHours(0, 0, 0, 0); gte.setDate(gte.getDate() + offsetDays);
  const lt = new Date(gte); lt.setDate(lt.getDate() + 1);
  return { gte, lt };
}

async function notify(orgId: string, employeeId: string | null | undefined, title: string, message: string, entityType?: string, entityId?: string) {
  if (!employeeId) return;
  await prisma.hrmsNotification.create({
    data: { orgId, employeeId, type: "Info", channel: "InApp", title, message, entityType, entityId },
  }).catch(() => { /* best-effort */ });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = { welcomeDoj2: 0, itProvisionDoj5: 0, probationReminder: 0, pulse: 0, clearanceReminder: 0, accessRevoked: 0 };

  const orgs = await prisma.companySettings.findMany({ select: { orgId: true, probationPeriodDays: true } });

  for (const org of orgs) {
    const orgId = org.orgId;
    try {
      // 1. IT-provisioning reminder @ DOJ−5
      {
        const w = dayRange(now, 5);
        const joiners = await prisma.employee.findMany({
          where: { orgId, deletedAt: null, status: "PreBoarding", dateOfJoining: { gte: w.gte, lt: w.lt } },
          select: { id: true, firstName: true, lastName: true, reportingManagerId: true },
        });
        for (const e of joiners) {
          await notify(orgId, e.reportingManagerId, "Prepare IT setup", `${e.firstName} ${e.lastName} joins in 5 days — raise IT provisioning (credentials + assets).`, "Employee", e.id);
          void fireWorkflow({ orgId, event: "onboarding.it-provisioning.due", payload: { employeeId: e.id } });
          result.itProvisionDoj5++;
        }
      }

      // 2. Welcome @ DOJ−2
      {
        const w = dayRange(now, 2);
        const joiners = await prisma.employee.findMany({
          where: { orgId, deletedAt: null, status: "PreBoarding", dateOfJoining: { gte: w.gte, lt: w.lt } },
          select: { id: true, firstName: true, lastName: true, reportingManagerId: true },
        });
        for (const e of joiners) {
          await notify(orgId, e.id, "Welcome — see you soon!", "Your first day is in 2 days. Check your Day-1 agenda, reporting time and location.", "Employee", e.id);
          await notify(orgId, e.reportingManagerId, "New joiner in 2 days", `${e.firstName} ${e.lastName} joins in 2 days.`, "Employee", e.id);
          void fireWorkflow({ orgId, event: "onboarding.welcome.due", payload: { employeeId: e.id } });
          result.welcomeDoj2++;
        }
      }

      // 3. Probation-review reminder (~2 weeks before probation end = DOJ + probationDays)
      {
        const probDays = org.probationPeriodDays ?? 90;
        const w = dayRange(now, 14 - probDays); // DOJ where DOJ + probDays = today + 14
        const emps = await prisma.employee.findMany({
          where: { orgId, deletedAt: null, status: "Active", confirmationDate: null, dateOfJoining: { gte: w.gte, lt: w.lt } },
          select: { id: true, firstName: true, lastName: true, reportingManagerId: true },
        });
        for (const e of emps) {
          await notify(orgId, e.reportingManagerId, "Probation ending soon", `${e.firstName} ${e.lastName}'s probation ends in ~2 weeks — complete the review (Confirm / Extend).`, "Employee", e.id);
          void fireWorkflow({ orgId, event: "onboarding.probation.review-due", payload: { employeeId: e.id } });
          result.probationReminder++;
        }
      }

      // 4. 30 / 60 / 90-day pulse check-ins
      for (const d of [30, 60, 90]) {
        const w = dayRange(now, -d);
        const emps = await prisma.employee.findMany({
          where: { orgId, deletedAt: null, status: "Active", dateOfJoining: { gte: w.gte, lt: w.lt } },
          select: { id: true },
        });
        for (const e of emps) {
          await notify(orgId, e.id, `${d}-day check-in`, `You've completed ${d} days with us! Please share quick feedback on how it's going.`, "Employee", e.id);
          void fireWorkflow({ orgId, event: "onboarding.pulse-survey.due", payload: { employeeId: e.id, day: d } });
          result.pulse++;
        }
      }

      // 5. Clearance reminders @ LWD−3 and LWD−1
      for (const off of [3, 1]) {
        const w = dayRange(now, off);
        const insts = await prisma.offboardingInstance.findMany({
          where: { orgId, deletedAt: null, status: { not: "OffboardCompleted" }, lastWorkingDate: { gte: w.gte, lt: w.lt } },
          include: { tasks: { where: { status: { notIn: ["TaskCompleted", "TaskSkipped"] } }, select: { assigneeId: true, department: true, title: true } } },
        });
        for (const inst of insts) {
          if (inst.tasks.length === 0) continue;
          for (const t of inst.tasks) {
            await notify(orgId, t.assigneeId, `Clearance pending — LWD in ${off} day${off > 1 ? "s" : ""}`, `${t.department ?? "Clearance"}: "${t.title}" is still pending.`, "OffboardingInstance", inst.id);
          }
          void fireWorkflow({ orgId, event: "offboarding.clearance.reminder", payload: { offboardingId: inst.id, employeeId: inst.employeeId, daysToLwd: off, pending: inst.tasks.length } });
          result.clearanceReminder++;
        }
      }

      // 6. Auto access-revocation once the last working day has passed
      {
        const tomorrow = dayRange(now, 0).lt;
        const insts = await prisma.offboardingInstance.findMany({
          where: { orgId, deletedAt: null, lastWorkingDate: { lt: tomorrow } },
          select: { id: true, employeeId: true },
        });
        for (const inst of insts) {
          const emp = await prisma.employee.findFirst({
            where: { orgId, id: inst.employeeId, deletedAt: null, status: { notIn: ["Relieved", "Absconding"] } },
            select: { id: true },
          });
          if (!emp) continue; // already relieved — idempotent
          await prisma.employee.update({ where: { id: emp.id }, data: { status: "Relieved", updatedBy: SYS } });
          await notify(orgId, inst.employeeId, "Access deactivated", "Your last working day has passed and system access has been deactivated. Thank you for your contributions.", "OffboardingInstance", inst.id);
          void fireWorkflow({ orgId, event: "offboarding.access.revoked", payload: { employeeId: emp.id, offboardingId: inst.id } });
          await createAuditLog({
            orgId, userId: SYS, action: "StatusChange", entityType: "Employee", entityId: emp.id,
            metadata: { to: "Relieved", reason: "LWD passed — auto access revocation", offboardingId: inst.id },
          }).catch(() => null);
          result.accessRevoked++;
        }
      }
    } catch (e) {
      console.error(`[lifecycle-automations] org ${orgId} failed:`, e);
    }
  }

  return NextResponse.json({ success: true, data: result });
}
