import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, notFound, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildResignationNoticeEmail } from "@/lib/email-templates/resignation-notice";
import { resolveApprovalChainLevels } from "@/lib/services/approval-chain";

/** Convert a linked notice period to whole days (same math as the forms). */
function periodToDays(p: { duration: number; unit: string }): number {
  return p.unit === "Months" ? p.duration * 30 : p.unit === "Weeks" ? p.duration * 7 : p.duration;
}

/**
 * POST /api/v1/hrms/offboarding/resign
 * Self-service resignation. Employee submits own resignation. HR acknowledges later.
 * Body:
 *   reason?: string       — free-text (defaults to "Resignation")
 *   lastWorkingDate?: string (YYYY-MM-DD) — optional override; default = today + notice period
 *   notes?: string        — additional comments
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found for current user");

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, status: true, noticePeriodDays: true,
        employeeCode: true, jobTitle: true, reportingManagerId: true,
        department: { select: { name: true } },
        noticePeriodRef: { select: { duration: true, unit: true } },
      },
    });
    if (!employee) return notFound("Employee record not found");

    if (["Relieved", "OnNotice"].includes(employee.status)) {
      return conflict("You are already on notice or relieved. Contact HR to update your existing resignation.");
    }

    const existing = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId, deletedAt: null },
    });
    // A previously REJECTED resignation can be re-submitted (we reopen the same
    // row to respect the unique(orgId, employeeId) constraint). Any other
    // existing instance blocks a new one.
    if (existing && existing.resignationApprovalStatus !== "Rejected") {
      return conflict("A resignation is already on record. Contact HR for changes.");
    }

    const body = await req.json().catch(() => ({}));
    const reason = body.reason ? String(body.reason).trim() : null;
    const userNotes = body.notes ? String(body.notes).trim() : null;

    const resignationDate = new Date();
    // Prefer the linked notice period (single source of truth) so editing a
    // period updates the calculation everywhere; fall back to the cached number.
    const noticeDays = Math.max(0, employee.noticePeriodRef
      ? periodToDays(employee.noticePeriodRef)
      : (employee.noticePeriodDays ?? 0));
    const defaultLwd = new Date(resignationDate);
    defaultLwd.setDate(defaultLwd.getDate() + noticeDays);

    let lastWorkingDate = defaultLwd;
    if (body.lastWorkingDate) {
      const parsed = new Date(body.lastWorkingDate);
      if (Number.isNaN(parsed.getTime())) return validationError("Invalid lastWorkingDate");
      if (parsed.getTime() < resignationDate.getTime()) {
        return validationError("Last working date cannot be in the past");
      }
      lastWorkingDate = parsed;
    }

    const combinedNotes = [
      reason ? `Reason: ${reason}` : null,
      userNotes ? `Notes: ${userNotes}` : null,
      `Submitted by employee via self-service.`,
    ].filter(Boolean).join("\n");

    // Approval routing: use the configured Offboarding approval chain
    // (Settings → Approval Chains) — level 1 is the first approver. If no chain
    // is configured, fall back to the employee's direct reporting manager. If
    // neither resolves, auto-approve (nobody to route to).
    let approverId: string | null = null;
    const chain = await resolveApprovalChainLevels(orgId, "Offboarding", employeeId);
    if (chain.ok) approverId = chain.levels[0]?.approverId ?? null;
    if (!approverId) approverId = employee.reportingManagerId ?? null;
    const approvalStatus = approverId ? "Pending" : "Approved";

    const resignData = {
      resignationDate,
      lastWorkingDate,
      reason: "Resignation" as const,
      status: "Initiated" as const,
      notes: combinedNotes,
      resignationApprovalStatus: approvalStatus,
      resignationApproverId: approverId,
      resignationDecisionById: null,
      resignationDecisionAt: null,
      resignationRejectionReason: null,
      updatedBy: userId,
    };

    const instance = existing
      ? await prisma.offboardingInstance.update({ where: { id: existing.id }, data: resignData })
      : await prisma.offboardingInstance.create({ data: { orgId, employeeId, createdBy: userId, ...resignData } });

    await prisma.employee.update({
      where: { id: employeeId },
      data: { status: "OnNotice", lastWorkingDate, updatedBy: userId },
    }).catch(() => null);

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "OffboardingInstance", entityId: instance.id,
      changes: { action: "SelfResignation", reason, lastWorkingDate: lastWorkingDate.toISOString() },
    });

    // In-app notification to the approving manager (in addition to the emails
    // below) so it surfaces in their bell with a link to act on it.
    if (approverId) {
      await prisma.hrmsNotification.create({
        data: {
          orgId, employeeId: approverId, type: "Action", channel: "InApp",
          title: "Resignation awaiting your approval",
          message: `${employee.firstName} ${employee.lastName} has submitted a resignation. Review and approve or reject it.`,
          link: "/resign",
          entityType: "OffboardingInstance", entityId: instance.id,
        },
      }).catch((e) => console.error("resignation approver notification failed:", e));
    }

    void fireWorkflow({
      orgId,
      event: "offboarding.resign.submitted",
      payload: {
        employeeId,
        instanceId: instance.id,
        resignationDate: resignationDate.toISOString(),
        lastWorkingDate: lastWorkingDate.toISOString(),
        reason: reason ?? "Resignation",
      },
    });

    // Walk up reporting chain → notify each manager
    const chain: { id: string; firstName: string; lastName: string; workEmail: string | null }[] = [];
    let cursorId: string | null = employee.reportingManagerId;
    const seen = new Set<string>([employee.id]);
    let safety = 12;
    while (cursorId && safety-- > 0 && !seen.has(cursorId)) {
      seen.add(cursorId);
      const mgr = await prisma.employee.findFirst({
        where: { id: cursorId, orgId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, workEmail: true, reportingManagerId: true },
      });
      if (!mgr) break;
      chain.push({ id: mgr.id, firstName: mgr.firstName, lastName: mgr.lastName, workEmail: mgr.workEmail });
      cursorId = mgr.reportingManagerId;
    }

    const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
    const companyName = company?.companyName ?? "Our Company";
    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const lwdStr = lastWorkingDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const resignStr = resignationDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    const mailStatus: { to: string; sent: boolean; error?: string }[] = [];
    void Promise.all(chain.map(async (mgr, idx) => {
      if (!mgr.workEmail) {
        mailStatus.push({ to: `${mgr.firstName} ${mgr.lastName}`, sent: false, error: "workEmail missing" });
        return;
      }
      const resignData = {
        recipientName: `${mgr.firstName} ${mgr.lastName}`.trim(),
        recipientRole: (idx === 0 ? "direct_manager" : "skip_level") as "direct_manager" | "skip_level",
        employeeName,
        employeeCode: employee.employeeCode,
        jobTitle: employee.jobTitle,
        department: employee.department?.name ?? null,
        resignationDate: resignStr,
        lastWorkingDate: lwdStr,
        noticePeriodDays: noticeDays,
        reason,
        notes: userNotes,
        companyName,
      };
      // sent = queued; the email worker handles delivery + retries.
      await resolveAndSend(orgId, {
        key: "offboarding.resignation-notice",
        to: mgr.workEmail,
        vars: {
          recipientName: resignData.recipientName,
          employeeName: resignData.employeeName,
          employeeCode: resignData.employeeCode,
          jobTitle: resignData.jobTitle ?? "",
          department: resignData.department ?? "",
          resignationDate: resignData.resignationDate,
          lastWorkingDate: resignData.lastWorkingDate,
          noticePeriodDays: resignData.noticePeriodDays,
          reason: resignData.reason ?? "",
          notes: resignData.notes ?? "",
          portalUrl: "",
          companyName: resignData.companyName,
        },
        fallback: () => buildResignationNoticeEmail(resignData),
      });
      mailStatus.push({ to: mgr.workEmail, sent: true });
    })).catch((e) => console.error("resignation hierarchy mail failed:", e));

    return successResponse({
      instance,
      employee: { id: employee.id, name: employeeName },
      noticePeriodDays: noticeDays,
      notifiedManagers: chain.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.workEmail })),
    }, undefined, 201);
  } catch (error) {
    console.error("POST /offboarding/resign error:", error);
    return internalError();
  }
});

/**
 * GET /api/v1/hrms/offboarding/resign
 * Current user's active resignation instance (null if none).
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return successResponse(null);

    const instance = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId, deletedAt: null },
      include: {
        tasks: { orderBy: { sortOrder: "asc" } },
      },
    });

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: { noticePeriodDays: true, status: true },
    });

    return successResponse({
      instance,
      noticePeriodDays: employee?.noticePeriodDays ?? 0,
      status: employee?.status ?? null,
    });
  } catch (error) {
    console.error("GET /offboarding/resign error:", error);
    return internalError();
  }
});

/**
 * DELETE /api/v1/hrms/offboarding/resign
 * Withdraw resignation (only if still in Initiated status).
 */
export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found for current user");

    const existing = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId, deletedAt: null },
    });
    if (!existing) return notFound("No active resignation to withdraw");
    if (existing.status !== "Initiated") {
      return conflict(`Cannot withdraw — status is already "${existing.status}". Contact HR.`);
    }

    await prisma.offboardingInstance.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await prisma.employee.update({
      where: { id: employeeId },
      data: { status: "Active", lastWorkingDate: null, updatedBy: userId },
    }).catch(() => null);

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "OffboardingInstance", entityId: existing.id,
      changes: { action: "SelfResignationWithdrawn" },
    });

    void fireWorkflow({
      orgId, event: "offboarding.resign.withdrawn",
      payload: { employeeId, instanceId: existing.id },
    });

    return successResponse({ withdrawn: true });
  } catch (error) {
    console.error("DELETE /offboarding/resign error:", error);
    return internalError();
  }
});
