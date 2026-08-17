import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeRequisitionSla, getHolidayDateSet } from "@/lib/recruit/sla";
import { findEmployeesWithPermission } from "@/lib/rbac/permission-holders";

/**
 * POST /api/v1/hrms/cron/recruit-sla-check
 *
 * Daily job-requisition SLA sweep. Notifies the assigned recruiter(s) the
 * moment a requisition first crosses into "amber" (at-risk), and escalates
 * to everyone holding hrms.recruit.performance.read (HR_Head-style roles)
 * the moment it first crosses into "red" (breached). `lastSlaAlertLevel` is
 * the idempotency marker — a run that finds nothing new to alert is a no-op,
 * so this is safe to schedule daily without spamming the same breach twice.
 *
 * Auth: x-cron-secret header must match CRON_SECRET.
 */
const OPEN_STATUSES = ["ReqOpen", "ReqOnHold", "PendingApproval", "ReqApproved"] as const;

async function notify(orgId: string, employeeId: string, title: string, message: string, type: "Warning" | "Error", requisitionId: string) {
  await prisma.hrmsNotification.create({
    data: { orgId, employeeId, type, channel: "InApp", title, message, entityType: "JobRequisition", entityId: requisitionId },
  }).catch(() => { /* best-effort */ });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = { orgsChecked: 0, amberAlerted: 0, redEscalated: 0, resetToGreen: 0 };

  const orgs = await prisma.companySettings.findMany({ select: { orgId: true } });

  for (const { orgId } of orgs) {
    try {
      const [requisitions, jobLevels] = await Promise.all([
        prisma.jobRequisition.findMany({
          where: { orgId, deletedAt: null, status: { in: [...OPEN_STATUSES] } },
          select: {
            id: true, title: true, requisitionNumber: true, status: true, createdAt: true,
            jobLevelId: true, customSlaDays: true, slaPausedAt: true, slaPausedDays: true, lastSlaAlertLevel: true,
            recruiterId: true,
            recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true } },
          },
        }),
        prisma.jobLevel.findMany({ where: { orgId, deletedAt: null }, select: { id: true, slaDays: true } }),
      ]);
      if (requisitions.length === 0) continue;
      result.orgsChecked++;

      const slaDaysByLevel = new Map(jobLevels.map((l) => [l.id, l.slaDays]));
      const earliestCreatedAt = requisitions.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), requisitions[0].createdAt);
      const holidayDates = await getHolidayDateSet(orgId, earliestCreatedAt, now);

      for (const r of requisitions) {
        const level = computeRequisitionSla(r, slaDaysByLevel, holidayDates, now);
        if (level === r.lastSlaAlertLevel) continue; // no change since last alert — nothing to do

        const recruiterIds = r.recruiterSplits.length ? r.recruiterSplits.map((s) => s.employeeId) : r.recruiterId ? [r.recruiterId] : [];

        if (level === "amber" && r.lastSlaAlertLevel !== "red") {
          for (const empId of recruiterIds) {
            await notify(orgId, empId, "SLA at risk", `"${r.title}" (${r.requisitionNumber}) is approaching its hiring SLA — please review.`, "Warning", r.id);
          }
          result.amberAlerted++;
        } else if (level === "red") {
          for (const empId of recruiterIds) {
            await notify(orgId, empId, "SLA breached", `"${r.title}" (${r.requisitionNumber}) has exceeded its hiring SLA.`, "Error", r.id);
          }
          const escalationTargets = await findEmployeesWithPermission(orgId, "hrms.recruit.performance.read");
          for (const empId of escalationTargets) {
            if (recruiterIds.includes(empId)) continue; // already notified above
            await notify(orgId, empId, "SLA breach escalation", `"${r.title}" (${r.requisitionNumber}) has breached its hiring SLA.`, "Error", r.id);
          }
          result.redEscalated++;
        } else if (level === "green" && r.lastSlaAlertLevel) {
          result.resetToGreen++;
        }

        await prisma.jobRequisition.update({ where: { id: r.id }, data: { lastSlaAlertLevel: level === "green" ? null : level } });
      }
    } catch (e) {
      console.error(`[recruit-sla-check] org ${orgId} failed:`, e);
    }
  }

  return NextResponse.json({ success: true, data: result });
}
