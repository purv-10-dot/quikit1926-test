import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeDeadlineStatus, computeStageTat, type DeadlineStatus } from "@/lib/recruit/sla";
import { findEmployeesWithPermission } from "@/lib/rbac/permission-holders";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildRecruitSlaEmail } from "@/lib/email-templates/recruit-sla";
import { appBaseUrl } from "@/lib/utils/app-url";

/**
 * POST /api/v1/hrms/cron/recruit-sla-check
 *
 * Daily SLA sweep, two independent checks:
 *
 * 1. Job-requisition Deadline TAT (targetJoiningDate) — notifies the
 *    assigned recruiter(s) the moment a requisition first crosses into
 *    "amber" (at-risk), and escalates to everyone holding
 *    hrms.recruit.performance.read (HR_Head-style roles) the moment it
 *    first crosses into "red" (breached). In-app only.
 *
 * 2. Position -> Offer SLA (RequisitionPosition.assignedAt + the level's
 *    SLA window, same clock the "Revise SLA" action reads/extends) —
 *    EMAILS the recruiter at-risk and missed, and escalates by email to
 *    HR/Admin on missed. This is the one that previously had no alert
 *    channel at all (in-app or email).
 *
 * `lastSlaAlertLevel` (on JobRequisition, and separately on
 * RequisitionPosition) is the idempotency marker for each check — a run
 * that finds nothing new to alert is a no-op, so this is safe to schedule
 * daily without spamming the same breach twice.
 *
 * Auth: x-cron-secret header must match CRON_SECRET.
 */
const OPEN_STATUSES = ["ReqOpen", "ReqOnHold", "PendingApproval", "ReqApproved"] as const;
// Same fallback used by the Recruiter Performance score / Revise SLA when a
// level has no explicit Position -> Offer SLA configured.
const DEFAULT_POSITION_TO_OFFER_SLA = 15;

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
  const result = {
    orgsChecked: 0, amberAlerted: 0, redEscalated: 0, resetToGreen: 0,
    positionAmberEmailed: 0, positionMissedEmailed: 0, positionResetToGreen: 0,
  };
  const baseUrl = appBaseUrl();

  const orgs = await prisma.companySettings.findMany({ select: { orgId: true, companyName: true } });

  for (const { orgId } of orgs) {
    try {
      const requisitions = await prisma.jobRequisition.findMany({
        where: { orgId, deletedAt: null, status: { in: [...OPEN_STATUSES] } },
        select: {
          id: true, title: true, requisitionNumber: true, status: true, lastSlaAlertLevel: true,
          recruiterId: true,
          targetJoiningDate: true, etaToFillDays: true,
          originalTargetJoiningDate: true, originalEtaToFillDays: true,
          recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true } },
        },
      });
      if (requisitions.length > 0) {
      result.orgsChecked++;

      for (const r of requisitions) {
        const activeDeadline = r.targetJoiningDate ?? r.originalTargetJoiningDate;
        const activeSla = r.etaToFillDays ?? r.originalEtaToFillDays;
        const level: DeadlineStatus | null = activeDeadline && activeSla != null
          ? computeDeadlineStatus(activeDeadline, activeSla, now)
          : null;
        if (level === r.lastSlaAlertLevel) continue; // no change since last alert — nothing to do

        const recruiterIds = r.recruiterSplits.length ? r.recruiterSplits.map((s) => s.employeeId) : r.recruiterId ? [r.recruiterId] : [];

        if (level === "AT_RISK" && r.lastSlaAlertLevel !== "DEADLINE_MISSED") {
          for (const empId of recruiterIds) {
            await notify(orgId, empId, "SLA at risk", `"${r.title}" (${r.requisitionNumber}) is approaching its hiring SLA — please review.`, "Warning", r.id);
          }
          result.amberAlerted++;
        } else if (level === "DEADLINE_MISSED") {
          for (const empId of recruiterIds) {
            await notify(orgId, empId, "SLA breached", `"${r.title}" (${r.requisitionNumber}) has exceeded its hiring SLA.`, "Error", r.id);
          }
          const escalationTargets = await findEmployeesWithPermission(orgId, "hrms.recruit.performance.read");
          for (const empId of escalationTargets) {
            if (recruiterIds.includes(empId)) continue; // already notified above
            await notify(orgId, empId, "SLA breach escalation", `"${r.title}" (${r.requisitionNumber}) has breached its hiring SLA.`, "Error", r.id);
          }
          result.redEscalated++;
        } else if (level === "ON_TRACK" && r.lastSlaAlertLevel) {
          result.resetToGreen++;
        }

        await prisma.jobRequisition.update({ where: { id: r.id }, data: { lastSlaAlertLevel: level === "ON_TRACK" ? null : level } });
      }
      }

      // ── Position → Offer SLA (email alerts) ──────────────────────────
      // Same clock the "Revise SLA" action reads/extends: assignedAt + the
      // level's SLA window (+ any prior extension). Only Open/PendingOnboarding
      // seats matter here — a Filled seat's clock already stopped.
      const positions = await prisma.$queryRaw<{
        id: string; requisitionId: string; positionCode: string; recruiterId: string | null;
        assignedAt: Date; lastSlaAlertLevel: string | null; slaExtensionDays: number;
      }[]>`
        SELECT id, "requisitionId", "positionCode", "recruiterId", "assignedAt", "lastSlaAlertLevel", "slaExtensionDays"
        FROM "app_quikhrms"."RequisitionPosition"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL
          AND status IN ('Open', 'PendingOnboarding') AND "assignedAt" IS NOT NULL`;

      if (positions.length > 0) {
        const reqIds = [...new Set(positions.map((p) => p.requisitionId))];
        const reqRows = await prisma.jobRequisition.findMany({
          where: { id: { in: reqIds } },
          select: { id: true, title: true, jobLevelId: true },
        });
        const reqById = new Map(reqRows.map((r) => [r.id, r]));

        const jobLevels = await prisma.jobLevel.findMany({ where: { orgId, deletedAt: null }, select: { id: true, positionToOfferSlaDays: true } });
        const slaByLevel = new Map(jobLevels.map((l) => [l.id, l.positionToOfferSlaDays]));

        const recruiterIds = [...new Set(positions.map((p) => p.recruiterId).filter((x): x is string => !!x))];
        const recruiterRows = recruiterIds.length
          ? await prisma.employee.findMany({ where: { id: { in: recruiterIds } }, select: { id: true, firstName: true, lastName: true, workEmail: true } })
          : [];
        const recruiterById = new Map(recruiterRows.map((e) => [e.id, e]));

        // HR/Admin escalation list — fetched once per org, only if actually needed.
        let hrRows: { id: string; firstName: string; lastName: string; workEmail: string | null }[] | null = null;
        const companyName = orgs.find((o) => o.orgId === orgId)?.companyName ?? "Our Company";

        for (const p of positions) {
          const reqRow = reqById.get(p.requisitionId);
          if (!reqRow) continue;
          const baseTarget = (reqRow.jobLevelId && slaByLevel.get(reqRow.jobLevelId)) || DEFAULT_POSITION_TO_OFFER_SLA;
          const effectiveTarget = baseTarget + p.slaExtensionDays;
          const tat = computeStageTat(p.assignedAt, null, effectiveTarget, now);
          const level: "AT_RISK" | "MISSED" | null = tat.status === "IN_TAT" ? null : tat.status;
          if (level === p.lastSlaAlertLevel) continue; // no change since last alert

          const recruiter = p.recruiterId ? recruiterById.get(p.recruiterId) : null;
          const recruiterName = recruiter ? `${recruiter.firstName} ${recruiter.lastName}`.trim() : "Unassigned";
          const daysLeft = effectiveTarget - tat.aging;
          const reviewUrl = recruiter ? `${baseUrl}/recruit/positions?recruiterId=${recruiter.id}` : `${baseUrl}/recruit/positions`;
          const emailBase = { positionCode: p.positionCode, requisitionTitle: reqRow.title, recruiterName, targetDays: effectiveTarget, daysLeft, reviewUrl, companyName };

          if (level === "AT_RISK" && p.lastSlaAlertLevel !== "MISSED") {
            if (recruiter?.workEmail) {
              await resolveAndSend(orgId, {
                key: "recruit.sla.at-risk", to: recruiter.workEmail,
                vars: { recipientName: recruiterName, ...emailBase },
                fallback: () => buildRecruitSlaEmail({ variant: "at_risk", audience: "recruiter", recipientName: recruiterName, ...emailBase }),
              });
            }
            result.positionAmberEmailed++;
          } else if (level === "MISSED") {
            if (recruiter?.workEmail) {
              await resolveAndSend(orgId, {
                key: "recruit.sla.missed", to: recruiter.workEmail,
                vars: { recipientName: recruiterName, ...emailBase },
                fallback: () => buildRecruitSlaEmail({ variant: "missed", audience: "recruiter", recipientName: recruiterName, ...emailBase }),
              });
            }
            if (hrRows === null) {
              const escalationIds = await findEmployeesWithPermission(orgId, "hrms.recruit.performance.read");
              hrRows = escalationIds.length
                ? await prisma.employee.findMany({ where: { id: { in: escalationIds } }, select: { id: true, firstName: true, lastName: true, workEmail: true } })
                : [];
            }
            for (const hr of hrRows) {
              if (hr.id === p.recruiterId || !hr.workEmail) continue; // recruiter already emailed above
              const hrName = `${hr.firstName} ${hr.lastName}`.trim();
              await resolveAndSend(orgId, {
                key: "recruit.sla.missed", to: hr.workEmail,
                vars: { recipientName: hrName, ...emailBase },
                fallback: () => buildRecruitSlaEmail({ variant: "missed", audience: "escalation", recipientName: hrName, ...emailBase }),
              });
            }
            result.positionMissedEmailed++;
          } else if (level === null && p.lastSlaAlertLevel) {
            result.positionResetToGreen++;
          }

          await prisma.$executeRaw`UPDATE "app_quikhrms"."RequisitionPosition" SET "lastSlaAlertLevel" = ${level} WHERE id = ${p.id}`;
        }
      }
    } catch (e) {
      console.error(`[recruit-sla-check] org ${orgId} failed:`, e);
    }
  }

  return NextResponse.json({ success: true, data: result });
}
