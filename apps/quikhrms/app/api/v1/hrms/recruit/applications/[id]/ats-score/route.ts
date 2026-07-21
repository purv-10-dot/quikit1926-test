import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { scoreResumeAgainstJD, parsedResumeToText, type SkillWeight } from "@/lib/ai/ats-scorer";

interface ParsedResume {
  skills?: string[];
  summary?: string;
  totalExperienceMonths?: number;
  [k: string]: unknown;
}

/**
 * POST /api/v1/hrms/recruit/applications/:id/ats-score
 * Compute ATS score for an application using JD skillWeights + candidate resume.
 * Persists result on JobApplication.aiMatchScore + aiMatchAnalysis.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const application = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        candidate: {
          select: {
            id: true, firstName: true, lastName: true,
            resumeUrl: true, parsedResume: true,
            totalExperience: true, skills: true,
            currentCompany: true, currentDesignation: true,
            education: true, location: true, linkedinUrl: true,
          },
        },
        requisition: {
          select: {
            id: true, title: true, jobDescription: true,
            experienceMin: true, experienceMax: true, skillWeights: true, skills: true,
          },
        },
      },
    });
    if (!application) return notFound("Application not found");
    if (!application.candidate) return notFound("Candidate missing");
    if (!application.requisition) return notFound("Requisition missing");

    const skillWeightsRaw = application.requisition.skillWeights;
    const skillWeights = Array.isArray(skillWeightsRaw)
      ? (skillWeightsRaw as unknown[]).filter((x): x is SkillWeight =>
          typeof x === "object" && x !== null &&
          "skill" in (x as Record<string, unknown>) &&
          "weight" in (x as Record<string, unknown>)
        )
      : [];

    if (skillWeights.length === 0) {
      return validationError("Requisition has no skill weights defined. Add weights to enable ATS scoring.");
    }

    const parsedResume = (application.candidate.parsedResume ?? null) as ParsedResume | null;
    const cand = application.candidate;

    const candidateSkills = Array.isArray(cand.skills)
      ? (cand.skills as unknown[]).map(String)
      : Array.isArray(parsedResume?.skills) ? parsedResume!.skills!.map(String) : [];

    const candidateExpMonths = cand.totalExperience
      ? Number(cand.totalExperience) * 12
      : typeof parsedResume?.totalExperienceMonths === "number"
      ? parsedResume.totalExperienceMonths
      : null;

    let resumeText = parsedResumeToText(parsedResume as Record<string, unknown> | null);
    if (!resumeText) {
      const lines: string[] = [
        `Name: ${cand.firstName} ${cand.lastName}`,
        cand.currentDesignation ? `Current Role: ${cand.currentDesignation}${cand.currentCompany ? ` at ${cand.currentCompany}` : ""}` : "",
        candidateExpMonths ? `Experience: ${(candidateExpMonths / 12).toFixed(1)} years` : "",
        candidateSkills.length ? `Skills: ${candidateSkills.join(", ")}` : "",
        Array.isArray(cand.education) ? `Education: ${JSON.stringify(cand.education)}` : "",
        cand.location ? `Location: ${cand.location}` : "",
      ].filter(Boolean);
      resumeText = lines.join("\n");
    }
    if (!resumeText) {
      return validationError("No resume data available to score. Fill candidate's skills/experience or upload a parsed resume first.");
    }

    let result;
    try {
      result = await scoreResumeAgainstJD({
        jobTitle: application.requisition.title,
        jobDescription: application.requisition.jobDescription ?? null,
        experienceMin: application.requisition.experienceMin != null ? Number(application.requisition.experienceMin) : null,
        experienceMax: application.requisition.experienceMax != null ? Number(application.requisition.experienceMax) : null,
        skillWeights,
        resumeText,
        candidateSummary: parsedResume?.summary ?? null,
        candidateExperienceMonths: candidateExpMonths,
        candidateSkills,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ATS scoring failed";
      return internalError(msg);
    }

    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        aiMatchScore: result.overallScore,
        aiMatchAnalysis: JSON.parse(JSON.stringify(result)),
        updatedBy: userId,
      },
    });

    return successResponse(result);
  } catch (error) {
    console.error("POST /applications/:id/ats-score error:", error);
    return internalError();
  }
}, {
  rateLimit: [
    { max: 10, windowSec: 60, by: "user", scope: "ai" },
    { max: 200, windowSec: 24 * 60 * 60, by: "tenant", scope: "ai.daily" },
  ],
});
