import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyExternalApiKey } from "@/lib/services/external-api-key";
import { rateLimitOrResponse } from "@/lib/rate-limit";
import { putObject } from "@/lib/storage";
import { contentMatchesClaim } from "@/lib/utils/file-signature";
import { fireWorkflow } from "@/lib/workflows/executor";
import { generateCandidateCode } from "@/lib/utils/candidate-code";
import { resolveAssignedRecruiter } from "@/lib/services/assign-recruiter";

// PUBLIC (API-key gated, no login) — an org's OWN careers website POSTs a
// candidate's application here. Two shapes are supported:
//  - `jobId` provided (came from this same key's GET .../job-requisitions/
//    external feed): creates/reuses a Candidate AND a proper JobApplication
//    linked to that specific requisition.
//  - `jobId` omitted (a generic "Send Application" form with a free-text
//    Position/Job Title, not tied to any open requisition): creates/reuses
//    ONLY the Candidate record — no JobApplication — exactly like HR's manual
//    "Add Candidate" flow, which also allows a candidate to exist unlinked to
//    any job. HR can later open the candidate profile and apply them to a
//    real requisition whenever one fits.

const MB = 1024 * 1024;
// Vercel's serverless functions hard-reject any request body over ~4.5MB
// before this route even runs (raw HTML error, not our JSON) — same
// constraint noted on the old careers apply route.
const MAX_RESUME_BYTES = 4 * MB;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ok = <T,>(data: T, status = 201) => NextResponse.json({ success: true, data }, { status });
const err = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status });

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// Every org's own careers website sends whatever fields ITS form collects —
// we only require a fixed minimum (name, email, resume; see the README-style
// integration guide). Anything beyond the known field names below still
// isn't dropped: it's captured here and stored generically on the
// application (screeningAnswers.extra) so a recruiter can see it even though
// we don't have a dedicated column for it, and no per-org schema change is
// ever needed just because one company's form asks one extra question.
const KNOWN_FIELDS = new Set([
  "jobId", "fullName", "email", "phone",
  "linkedIn", "linkedinUrl", "portfolio", "portfolioUrl",
  "years", "yearsOfExperience", "message", "coverNote",
  "position", "positionTitle", "jobTitle",
  "resume", "recaptchaToken", "hp",
]);

function extractExtraFields(form: FormData): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (KNOWN_FIELDS.has(key) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) extra[key] = trimmed;
  }
  return extra;
}

// "fullName" is one field on the caller's form (matches their existing
// OpenApplicationCTA-style form) — split on the first space. A single-word
// name is valid (lastName ends up ""); Candidate.lastName allows "".
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const idx = fullName.indexOf(" ");
  if (idx === -1) return { firstName: fullName, lastName: "" };
  return { firstName: fullName.slice(0, idx).trim(), lastName: fullName.slice(idx + 1).trim() };
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");

  // Lower than the GET feed's limit — applications carry a file upload and
  // realistic apply volume per org is much lower than page-view/feed volume.
  const rl = await rateLimitOrResponse("external.jobRequisitions.apply", apiKey ?? "missing", 30, 60);
  if (rl) return rl;

  try {
    const orgId = await verifyExternalApiKey(apiKey, "jobRequisitions");
    if (!orgId) return err("Invalid or missing API key", 401);

    const form = await req.formData().catch(() => null);
    if (!form) return err("Invalid form submission", 400);

    const jobId = str(form, "jobId");
    const fullName = str(form, "fullName");
    const email = str(form, "email").toLowerCase();
    const phone = str(form, "phone");
    const linkedinUrl = str(form, "linkedIn") || str(form, "linkedinUrl");
    const portfolioUrl = str(form, "portfolio") || str(form, "portfolioUrl");
    const experienceRaw = str(form, "years") || str(form, "yearsOfExperience");
    const message = str(form, "message") || str(form, "coverNote");
    const positionTitle = str(form, "position") || str(form, "positionTitle") || str(form, "jobTitle");
    const extraFields = extractExtraFields(form);
    const screeningAnswers = message || Object.keys(extraFields).length
      ? { ...(message ? { coverNote: message } : {}), ...(Object.keys(extraFields).length ? { extra: extraFields } : {}) }
      : undefined;

    const { firstName, lastName } = splitFullName(fullName);
    if (!firstName) return err("Full name is required", 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("A valid email is required", 400);

    // The form asks for years; Candidate.totalExperience is stored in months.
    const experienceYears = experienceRaw ? parseFloat(experienceRaw) : NaN;
    const totalExperience = Number.isFinite(experienceYears) && experienceYears >= 0 ? Math.round(experienceYears * 12) : undefined;

    // A generic "Send Application" form (no specific job picked) omits jobId
    // entirely — that's valid; see the comment at the top of this file.
    let requisition: { id: string; pipelineId: string | null } | null = null;
    if (jobId) {
      requisition = await prisma.jobRequisition.findFirst({
        where: {
          id: jobId, orgId, deletedAt: null,
          careerPageVisible: true, internalPostingOnly: false, status: "ReqOpen",
        },
        select: { id: true, pipelineId: true },
      });
      if (!requisition) return err("This job is no longer open, or doesn't exist.", 404);
    }

    const resume = form.get("resume");
    if (!resume || !(resume instanceof File) || resume.size === 0) return err("Resume is required", 400);
    if (resume.size > MAX_RESUME_BYTES) return err(`Resume exceeds ${MAX_RESUME_BYTES / MB}MB`, 400);
    if (!ALLOWED_RESUME_TYPES.has(resume.type)) return err("Resume must be a PDF or Word document", 400);

    const resumeBuf = Buffer.from(await resume.arrayBuffer());
    if (!contentMatchesClaim(resumeBuf, resume.type)) {
      return err("Resume content doesn't match its file type. Upload a genuine PDF or Word document.", 400);
    }

    const resumeExt = (path.extname(resume.name) || "").replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
    const resumeKey = `careers/${orgId}/${randomUUID()}${resumeExt}`;
    await putObject(resumeKey, resumeBuf, resume.type);
    const resumeUrl = `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(resumeKey)}`;

    const settings = await prisma.companySettings.findUnique({ where: { orgId }, select: { candidateCoolingMonths: true } });

    // No specific job → the free-text position + cover message have nowhere
    // else to live (there's no JobApplication to hold them), so they're
    // stashed as readable tags on the Candidate — same "don't drop it, don't
    // force a schema change" spirit as extractExtraFields() above.
    const generalInterestTags = !requisition
      ? [
          ...(positionTitle ? [`Interested in: ${positionTitle}`] : []),
          ...(message ? [`Note: ${message}`] : []),
        ]
      : [];

    // Dedupe on (orgId, email) — @@unique backs this at the DB level too, so
    // a concurrent duplicate submit can't slip through even if this races.
    let candidate = await prisma.candidate.findFirst({ where: { orgId, email, deletedAt: null } });
    if (candidate?.isBlacklisted) {
      return err("We're unable to process your application at this time.", 409);
    }
    if (!candidate) {
      try {
        candidate = await prisma.candidate.create({
          data: {
            orgId, firstName, lastName, email,
            phone: phone || undefined,
            linkedinUrl: linkedinUrl || undefined,
            portfolioUrl: portfolioUrl || undefined,
            totalExperience,
            resumeUrl,
            source: "CandCareerPage",
            ...(generalInterestTags.length ? { tags: generalInterestTags } : {}),
            createdBy: "careers-external-api",
            updatedBy: "careers-external-api",
          },
        });
        const candidateCode = await generateCandidateCode(orgId);
        await prisma.$executeRaw`UPDATE "app_quikhrms"."Candidate" SET "candidateCode" = ${candidateCode} WHERE id = ${candidate.id}`;
      } catch {
        candidate = await prisma.candidate.findFirst({ where: { orgId, email, deletedAt: null } });
        if (!candidate) throw new Error("Candidate lookup failed after create race");
      }
    } else {
      candidate = await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          firstName, lastName,
          phone: phone || undefined,
          linkedinUrl: linkedinUrl || undefined,
          portfolioUrl: portfolioUrl || undefined,
          totalExperience,
          resumeUrl,
          updatedBy: "careers-external-api",
        },
      });
    }

    // A generic application (no jobId) stops here — only the Candidate record
    // exists, exactly like HR's manual "Add Candidate" without linking a JR.
    // HR applies them to a real requisition later from the candidate profile.
    if (!requisition) {
      void fireWorkflow({ orgId, event: "recruit.candidate.created", payload: { candidateId: candidate.id, name: `${candidate.firstName} ${candidate.lastName}`, source: candidate.source } });
      return ok({ applied: true, candidateId: candidate.id, general: true });
    }

    // Re-apply cooling period — same logic as the old careers apply route:
    // a recently-rejected candidate can't apply anywhere until it lifts.
    const coolMonths = settings?.candidateCoolingMonths ?? 0;
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
          return err("Thanks for your interest — based on a recent application, you'll be able to apply again a bit later. Please check back soon.", 409);
        }
      }
    }

    const existingApp = await prisma.jobApplication.findFirst({
      // Includes soft-deleted rows — the unique constraint spans them too.
      where: { orgId, candidateId: candidate.id, requisitionId: jobId },
    });
    if (existingApp && !existingApp.deletedAt) {
      return err("You've already applied for this position. We'll be in touch.", 409);
    }

    // Website applications land here with currentStage/stageHistory left null
    // — a "pending review" application, deliberately NOT yet on the Hiring
    // Pipeline board (that board only shows applications with a real stage).
    // HR reviews it from the Candidates → Active list and explicitly moves it
    // onto the board (POST .../start-pipeline), which is where a real stage —
    // and the first stageHistory entry — first gets assigned.
    const application = existingApp
      ? await prisma.jobApplication.update({
          where: { id: existingApp.id },
          data: {
            deletedAt: null, status: "AppActive", currentStage: null,
            appliedDate: new Date(), stageHistory: Prisma.DbNull,
            rejectionReason: null, rejectionStage: null, rejectionExempt: false,
            ...(screeningAnswers ? { screeningAnswers } : {}),
            updatedBy: "careers-external-api",
          },
        })
      : await prisma.jobApplication.create({
          data: {
            orgId, candidateId: candidate.id, requisitionId: jobId,
            ...(screeningAnswers ? { screeningAnswers } : {}),
            createdBy: "careers-external-api", updatedBy: "careers-external-api",
          },
        });

    // Candidate status stays "New" (the pre-pipeline/intake status) — it only
    // becomes "InPipeline" once start-pipeline actually stages the application.
    await prisma.candidate.update({ where: { id: candidate.id }, data: { status: "New" } });

    // Recruiter assignment — always Round Robin here, among recruiters with
    // an open allocated seat on this requisition. A website apply has no
    // logged-in human action to self-assign to.
    const assignedRecruiterId = await resolveAssignedRecruiter(orgId, jobId);
    if (assignedRecruiterId) {
      await prisma.$executeRaw`
        UPDATE "app_quikhrms"."JobApplication" SET "assignedRecruiterId" = ${assignedRecruiterId} WHERE id = ${application.id}`;
    }

    void fireWorkflow({ orgId, event: "recruit.application.received", payload: { applicationId: application.id, candidateId: candidate.id, requisitionId: jobId, stage: null } });

    return ok({ applied: true, applicationId: application.id });
  } catch (error) {
    console.error("POST /job-requisitions/external/apply error:", error);
    return err("Internal server error", 500);
  }
}
