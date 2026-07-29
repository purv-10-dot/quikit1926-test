import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { APP_ID } from "@/lib/rbac/registry";
import { resolveAndSend } from "@/lib/email/resolve";

/**
 * POST /api/v1/hrms/leaves/notify-approval-chain
 *
 * Raised from the apply-leave screen when the Leave approval chain isn't set up
 * (the apply API returns APPROVAL_CHAIN_NOT_CONFIGURED). Notifies every admin —
 * both in-app AND by email — to configure it in Settings → Approval Chains.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const meId = await resolveEmployeeId(orgId, userId);
    const me = meId
      ? await prisma.employee.findFirst({ where: { id: meId, orgId, deletedAt: null }, select: { firstName: true, lastName: true } })
      : null;
    const requester = me ? `${me.firstName} ${me.lastName}`.trim() : "An employee";

    // Resolve admins robustly: any non-deleted employee holding the HRMS "admin"
    // app role. Match the role name case-insensitively and do NOT require an
    // "Active" employment status — a freshly-provisioned SSO admin may still be
    // Invited/PreBoarding yet must be notified to configure the chain (this was
    // the cause of "No admins found" on fresh deployments).
    const candidates = await prisma.employee.findMany({
      where: {
        orgId, deletedAt: null,
        appRoles: { some: { role: { appId: APP_ID } } },
      },
      select: {
        id: true, firstName: true, workEmail: true,
        appRoles: { where: { role: { appId: APP_ID } }, select: { role: { select: { name: true } } } },
      },
    });
    const admins = candidates.filter((c) =>
      c.appRoles.some((ar) => ar.role.name?.toLowerCase() === "admin"),
    );
    if (admins.length === 0) return successResponse({ notified: 0, emailed: 0 });

    const message = `${requester} couldn't apply for leave — no Leave approval chain is set up. Configure one in Settings → Approval Chains.`;

    // 1) In-app notification for every admin.
    await prisma.hrmsNotification.createMany({
      data: admins.map((a) => ({
        orgId,
        employeeId: a.id,
        type: "Warning" as const,
        channel: "InApp" as const,
        title: "Leave approval chain not configured",
        message,
        link: "/settings/approval-chains",
        entityType: "ApprovalChain",
      })),
    });

    // 2) Email every admin who has a work email (best-effort; queued + retried
    //    by the mail worker — never fails the request).
    let emailed = 0;
    try {
      const recipients = admins.map((a) => a.workEmail).filter((e): e is string => !!e);
      if (recipients.length > 0) {
        const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
        const companyName = company?.companyName ?? "QuikIT HRMS";
        const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
        const settingsUrl = base ? `${base}/settings/approval-chains` : "Settings → Approval Chains";
        const linkHtml = base
          ? `<a href="${settingsUrl}" style="color:#16a34a;font-weight:600;">Set up the Leave approval chain</a>`
          : `<strong>Settings → Approval Chains</strong>`;
        const html = `
          <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6;">
            <p><strong>Action needed:</strong> the Leave approval chain isn't configured.</p>
            <p>${requester} tried to apply for leave but couldn't — no approval chain is set up for the Leave module, so leave requests are currently blocked for everyone.</p>
            <p style="margin-top:16px;">${linkHtml} in ${companyName} to unblock leave applications.</p>
          </div>`;
        await resolveAndSend(orgId, {
          key: "leave.approval-chain-missing",
          to: recipients,
          vars: { requesterName: requester, settingsUrl, companyName },
          fallback: () => ({ subject: "Action needed: set up the Leave approval chain", html }),
        });
        emailed = recipients.length;
      }
    } catch (mailErr) {
      console.error("[notify-approval-chain] email failed:", mailErr);
    }

    return successResponse({ notified: admins.length, emailed });
  } catch (error) {
    console.error("POST /leaves/notify-approval-chain error:", error);
    return internalError();
  }
}, { rateLimit: { max: 3, windowSec: 3600, by: "user", scope: "leaves.notify-chain" } });
