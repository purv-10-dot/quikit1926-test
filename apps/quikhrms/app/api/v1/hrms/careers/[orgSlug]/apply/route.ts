import { NextRequest } from "next/server";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { successResponse, notFound, validationError, conflict, internalError } from "@/lib/api-response";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";
import { putObject } from "@/lib/storage";
import { contentMatchesClaim } from "@/lib/utils/file-signature";
import { fireWorkflow } from "@/lib/workflows/executor";
import { stageNames } from "@/lib/services/pipeline-stages";
import { resolveOrgIdByCareerSlug } from "@/lib/services/career-page";

// PUBLIC (no login) — a candidate applies to one open job from the career
// page. Creates/reuses a Candidate (source: CandCareerPage) and creates the
// JobApplication, mirroring the internal candidates/applications routes'
// dedupe + cooling-period + pipeline-stage logic, but with public-safe error
// messages (never reveal blacklist/internal-status details to an applicant).

const MB = 1024 * 1024;
// Vercel's serverless functions hard-reject any request body over ~4.5MB
// before this route runs (HTML error page, not JSON) — same reasoning as
// uploads/route.ts and onboarding/doc-upload/[token]/route.ts.
const MAX_RESUME_BYTES = 4 * MB;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ok = (data: unknown) => successResponse(data, undefined, 201);

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) {
  try {
    const rl = await rateLimitOrResponse("careers.apply", clientIp(req), 5, 60);
    if (rl) return rl;

    const { orgSlug } = await params;
    const orgId = await resolveOrgIdByCareerSlug(orgSlug);
    if (!orgId) return notFound("Career page not found");

    const settings = await prisma.companySettings.findUnique({
      where: { orgId }, select: { careerPageEnabled: true, candidateCoolingMonths: true },
    });
    if (!settings?.careerPageEnabled) return notFound("Career page not found");

    const form = await req.formData().catch(() => null);
    if (!form) return validationError("Invalid form submission");

    // Honeypot — a real applicant never sees or fills this field (hidden via
    // CSS on the form). A bot's generic auto-fill script does. Return success
    // WITHOUT creating anything so the bot has no signal it was caught.
    if (str(form, "hp")) return ok({ applied: true });

    const requisitionId = str(form, "requisitionId");
    const firstName = str(form, "firstName");
    const lastName = str(form, "lastName");
    const email = str(form, "email").toLowerCase();
    const phone = str(form, "phone");
    const city = str(form, "city");
    const linkedinUrl = str(form, "linkedinUrl");

    if (!requisitionId) return validationError("Missing job reference");
    if (!firstName || !lastName) return validationError("First and last name are required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return validationError("A valid email is required");
    if (!phone) return validationError("Phone number is required");

    const resume = form.get("resume");
    if (!resume || !(resume instanceof File) || resume.size === 0) return validationError("Resume is required");
    if (resume.size > MAX_RESUME_BYTES) return validationError(`Resume exceeds ${MAX_RESUME_BYTES / MB}MB`);
    if (!ALLOWED_RESUME_TYPES.has(resume.type)) return validationError("Resume must be a PDF or Word document");

    const requisition = await prisma.jobRequisition.findFirst({
      where: {
        id: requisitionId, orgId, deletedAt: null,
        careerPageVisible: true, internalPostingOnly: false, status: "ReqOpen",
      },
      select: { id: true, pipelineId: true },
    });
    if (!requisition) return notFound("This job is no longer open, or doesn't exist.");

    const resumeBuf = Buffer.from(await resume.arrayBuffer());
    if (!contentMatchesClaim(resumeBuf, resume.type)) {
      return validationError("Resume content doesn't match its file type. Upload a genuine PDF or Word document.");
    }

    let coverLetterUrl: string | undefined;
    const coverLetter = form.get("coverLetter");
    if (coverLetter instanceof File && coverLetter.size > 0) {
      if (coverLetter.size > MAX_RESUME_BYTES) return validationError(`Cover letter exceeds ${MAX_RESUME_BYTES / MB}MB`);
      if (!ALLOWED_RESUME_TYPES.has(coverLetter.type)) return validationError("Cover letter must be a PDF or Word document");
      const coverBuf = Buffer.from(await coverLetter.arrayBuffer());
      if (!contentMatchesClaim(coverBuf, coverLetter.type)) {
        return validationError("Cover letter content doesn't match its file type.");
      }
      const ext = (path.extname(coverLetter.name) || "").replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
      const key = `careers/${orgId}/${randomUUID()}${ext}`;
      await putObject(key, coverBuf, coverLetter.type);
      coverLetterUrl = `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(key)}`;
    }

    const resumeExt = (path.extname(resume.name) || "").replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
    const resumeKey = `careers/${orgId}/${randomUUID()}${resumeExt}`;
    await putObject(resumeKey, resumeBuf, resume.type);
    const resumeUrl = `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(resumeKey)}`;

    // Candidate dedupe (mirrors candidates/route.ts — @@unique([orgId, email])
    // backs this at the DB level too, so a concurrent duplicate submit can't
    // slip through even if this findFirst races).
    let candidate = await prisma.candidate.findFirst({ where: { orgId, email, deletedAt: null } });
    if (candidate?.isBlacklisted) {
      // Never expose blacklist details to a public applicant.
      return conflict("We're unable to process your application at this time.");
    }
    if (!candidate) {
      try {
        candidate = await prisma.candidate.create({
          data: {
            orgId, firstName, lastName, email, phone,
            location: city || undefined,
            linkedinUrl: linkedinUrl || undefined,
            resumeUrl,
            source: "CandCareerPage",
            createdBy: "career-page",
            updatedBy: "career-page",
          },
        });
      } catch {
        // Concurrent duplicate submit raced us to @@unique([orgId, email]) —
        // re-resolve rather than 500.
        candidate = await prisma.candidate.findFirst({ where: { orgId, email, deletedAt: null } });
        if (!candidate) throw new Error("Candidate lookup failed after create race");
      }
    } else {
      // Re-applying: keep their profile current with the latest submission.
      candidate = await prisma.candidate.update({
        where: { id: candidate.id },
        data: { phone, location: city || undefined, linkedinUrl: linkedinUrl || undefined, resumeUrl, updatedBy: "career-page" },
      });
    }

    // Re-apply cooling period — identical logic to applications/route.ts POST,
    // scoped to ANY role (a rejected candidate can't apply anywhere until it lifts).
    const coolMonths = settings.candidateCoolingMonths ?? 0;
    if (coolMonths > 0) {
      const lastRejected = await prisma.jobApplication.findFirst({
        where: {
          orgId, candidateId: candidate.id, deletedAt: null,
          status: { in: ["AppRejected", "AppDeclined"] },
          rejectionExempt: false,
        },
        orderBy: [{ rejectedAt: "desc" }, { updatedAt: "desc" }],
        select: { rejectedAt: true, updatedAt: true },
      });
      if (lastRejected) {
        const rejectedDate = new Date(lastRejected.rejectedAt ?? lastRejected.updatedAt);
        const rejDay = rejectedDate.getDate();
        const eligibleAt = new Date(rejectedDate);
        eligibleAt.setDate(1);
        eligibleAt.setMonth(eligibleAt.getMonth() + coolMonths);
        const lastDayOfTarget = new Date(eligibleAt.getFullYear(), eligibleAt.getMonth() + 1, 0).getDate();
        eligibleAt.setDate(Math.min(rejDay, lastDayOfTarget));
        if (Date.now() < eligibleAt.getTime()) {
          return conflict("Thanks for your interest — based on a recent application, you'll be able to apply again a bit later. Please check back soon.");
        }
      }
    }

    const existingApp = await prisma.jobApplication.findFirst({
      // Includes soft-deleted rows — the unique constraint spans them too.
      where: { orgId, candidateId: candidate.id, requisitionId },
    });
    if (existingApp && !existingApp.deletedAt) {
      return conflict("You've already applied for this position. We'll be in touch.");
    }

    const pipeline = await prisma.hiringPipeline.findFirst({
      where: { orgId, deletedAt: null, ...(requisition.pipelineId ? { id: requisition.pipelineId } : { isDefault: true }) },
      select: { stages: true },
    });
    const stages = stageNames(pipeline?.stages);
    const initialStage = stages[0] ?? "Screening";
    const freshHistory = JSON.parse(JSON.stringify([{ stage: initialStage, date: new Date().toISOString(), movedBy: "career-page" }]));

    const application = existingApp
      ? await prisma.jobApplication.update({
          where: { id: existingApp.id },
          data: {
            deletedAt: null, status: "AppActive", currentStage: initialStage,
            appliedDate: new Date(), stageHistory: freshHistory,
            rejectionReason: null, rejectionStage: null, rejectionExempt: false,
            ...(coverLetterUrl ? { screeningAnswers: { coverLetterUrl } } : {}),
            updatedBy: "career-page",
          },
        })
      : await prisma.jobApplication.create({
          data: {
            orgId, candidateId: candidate.id, requisitionId,
            currentStage: initialStage, stageHistory: freshHistory,
            ...(coverLetterUrl ? { screeningAnswers: { coverLetterUrl } } : {}),
            createdBy: "career-page", updatedBy: "career-page",
          },
        });

    await prisma.candidate.update({ where: { id: candidate.id }, data: { status: "InPipeline" } });

    void fireWorkflow({ orgId, event: "recruit.application.received", payload: { applicationId: application.id, candidateId: candidate.id, requisitionId, stage: initialStage } });

    return ok({ applied: true });
  } catch (error) {
    console.error("POST /careers/[orgSlug]/apply error:", error);
    return internalError();
  }
}
