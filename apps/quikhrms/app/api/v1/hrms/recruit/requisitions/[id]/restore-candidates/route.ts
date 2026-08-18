import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildReconfirmEmail } from "@/lib/email-templates/application-reconfirm";
import { sendRejectionEmail } from "@/lib/recruit/rejection-mail";
import { generateReconfirmToken } from "@/lib/services/reconfirm-token";
import { appBaseUrl } from "@/lib/utils/app-url";

const schema = z.object({
  decisions: z.array(z.object({
    applicationId: z.string().min(1),
    action: z.enum(["restore", "reject", "keep"]),
  })).min(1),
});

/**
 * POST /api/v1/hrms/recruit/requisitions/:id/restore-candidates
 * Apply the recruiter's per-candidate decision after a held requisition resumes:
 *   - restore → send a "still interested?" invite. The candidate stays in the
 *               archive (awaiting confirmation) and only re-enters the pipeline
 *               when they click "Yes". No reply = they stay archived.
 *   - reject  → penalty-free rejection (no cooling lock) + rejection email.
 *   - keep    → left in the Archive, untouched.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const ids = parsed.data.decisions.map((d) => d.applicationId);
    const apps = await prisma.jobApplication.findMany({
      where: { orgId, id: { in: ids }, requisitionId: params.id, deletedAt: null, status: "AppOnHold" },
      select: {
        id: true, candidateId: true, currentStage: true,
        candidate: { select: { firstName: true, lastName: true, email: true } },
        requisition: { select: { title: true } },
      },
    });
    const byId = new Map(apps.map((a) => [a.id, a]));

    const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
    const companyName = company?.companyName ?? "QuikIT HRMS";
    const base = appBaseUrl();

    let invited = 0, restored = 0, rejected = 0, kept = 0;
    const mails: Array<Promise<unknown>> = [];

    for (const d of parsed.data.decisions) {
      const app = byId.get(d.applicationId);
      if (!app) continue;
      const vars = {
        candidateName: `${app.candidate.firstName} ${app.candidate.lastName}`.trim(),
        jobTitle: app.requisition?.title ?? "the role",
        companyName,
      };

      if (d.action === "restore") {
        if (app.candidate.email && base) {
          // Send the "still interested?" invite — DO NOT re-enter the pipeline
          // yet. They stay archived + AppOnHold until they click "Yes".
          const { token } = generateReconfirmToken(app.id, orgId);
          await prisma.jobApplication.update({
            where: { id: app.id },
            data: { reconfirmSentAt: new Date(), updatedBy: userId },
          });
          invited++;
          mails.push(resolveAndSend(orgId, {
            key: "recruit.reconfirm", to: app.candidate.email,
            vars: { ...vars, yesUrl: `${base}/reconfirm/${token}?a=yes`, noUrl: `${base}/reconfirm/${token}?a=no` },
            fallback: () => buildReconfirmEmail({ ...vars, yesUrl: `${base}/reconfirm/${token}?a=yes`, noUrl: `${base}/reconfirm/${token}?a=no` }),
          }).catch((e) => console.error("[restore] reconfirm mail failed:", e)));
        } else {
          // No email / no public URL configured — can't ask them to confirm, so
          // restore directly and let the recruiter follow up manually.
          await prisma.jobApplication.update({
            where: { id: app.id },
            data: { status: "AppActive", reconfirmSentAt: null, updatedBy: userId },
          });
          await prisma.candidate.update({
            where: { id: app.candidateId },
            data: { isArchived: false, archiveReason: null, archivedAt: null, archivedBy: null, status: "InPipeline" },
          }).catch(() => null);
          restored++;
        }
      } else if (d.action === "reject") {
        await prisma.jobApplication.update({
          where: { id: app.id },
          data: {
            status: "AppRejected",
            rejectionStage: app.currentStage,
            rejectionReason: "Not selected after the requisition resumed",
            rejectionExempt: true, // penalty-free — no re-apply cooling lock
            reconfirmSentAt: null,
            updatedBy: userId,
          },
        });
        await prisma.candidate.update({
          where: { id: app.candidateId },
          data: { isArchived: false, archiveReason: null, archivedAt: null, archivedBy: null, status: "CandRejected" },
        }).catch(() => null);
        rejected++;
        if (app.candidate.email) {
          // Penalty-free rejection → no cooling note.
          mails.push(sendRejectionEmail(orgId, {
            to: app.candidate.email, candidateName: vars.candidateName, jobTitle: vars.jobTitle, exempt: true,
          }));
        }
      } else {
        kept++;
      }
    }

    // Fire the emails in the background — don't hold the response on SMTP.
    if (mails.length) void Promise.allSettled(mails);

    return successResponse({ invited, restored, rejected, kept });
  } catch (error) {
    console.error("POST /recruit/requisitions/:id/restore-candidates error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.requisition.write", "hrms.recruit.candidate.write"], anyPermission: true });
