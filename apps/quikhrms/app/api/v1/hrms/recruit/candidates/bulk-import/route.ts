import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { stageNames } from "@/lib/services/pipeline-stages";

// One candidate row from the uploaded CSV/Excel (client maps headers → these keys).
const rowSchema = z.object({
  firstName: z.string().trim().min(1, "First name required"),
  lastName: z.string().trim().min(1, "Last name required"),
  email: z.string().trim().email("Invalid email"),
  phone: z.string().trim().optional(),
  currentCompany: z.string().trim().optional(),
  currentDesignation: z.string().trim().optional(),
  totalExperience: z.number().int().min(0).max(60).optional(),
  skills: z.array(z.string()).optional(),
  source: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().optional(),
});

const bodySchema = z.object({
  requisitionId: z.string().optional(),
  candidates: z.array(z.record(z.string(), z.unknown())).min(1, "No rows found").max(500, "At most 500 candidates per upload"),
});

const SOURCE_MAP: Record<string, string> = {
  linkedin: "CandLinkedIn", "linked in": "CandLinkedIn",
  "job portal": "CandJobPortal", jobportal: "CandJobPortal",
  naukri: "CandNaukri", indeed: "CandIndeed",
  referral: "CandReferral", referred: "CandReferral",
  agency: "CandAgency", consultancy: "CandAgency",
  "career page": "CandCareerPage", careerpage: "CandCareerPage",
  campus: "CandCampus", college: "CandCampus",
  direct: "CandDirect", "walk-in": "CandDirect", inbound: "CandInbound",
};
const mapSource = (s?: string): string => (s ? SOURCE_MAP[s.trim().toLowerCase()] ?? "CandDirect" : "CandDirect");

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { requisitionId, candidates } = parsed.data;

    // Resolve target requisition + its pipeline's first stage (if applying).
    let firstStage = "Screening";
    if (requisitionId) {
      const reqRow = await prisma.jobRequisition.findFirst({
        where: { id: requisitionId, orgId, deletedAt: null },
        select: { pipelineId: true },
      });
      if (!reqRow) return validationError("Selected requisition not found");
      const pipeline = await prisma.hiringPipeline.findFirst({
        where: { orgId, deletedAt: null, ...(reqRow.pipelineId ? { id: reqRow.pipelineId } : { isDefault: true }) },
        select: { stages: true },
      });
      firstStage = stageNames(pipeline?.stages)[0] ?? "Screening";
    }

    let created = 0;
    let applied = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];
    const seenEmails = new Set<string>();

    for (let i = 0; i < candidates.length; i++) {
      const raw = candidates[i] as Record<string, unknown>;
      const norm = rowSchema.safeParse({
        firstName: raw.firstName, lastName: raw.lastName, email: raw.email,
        phone: raw.phone, currentCompany: raw.currentCompany, currentDesignation: raw.currentDesignation,
        totalExperience: raw.totalExperience, skills: raw.skills,
        source: raw.source, location: raw.location, linkedinUrl: raw.linkedinUrl,
      });
      if (!norm.success) {
        errors.push({ row: i + 1, error: norm.error.issues.map((e) => e.message).join(", ") });
        continue;
      }
      const d = norm.data;
      const emailKey = d.email.toLowerCase();
      if (seenEmails.has(emailKey)) { errors.push({ row: i + 1, error: `Duplicate email in this file: ${d.email}` }); continue; }
      seenEmails.add(emailKey);

      const existing = await prisma.candidate.findFirst({ where: { orgId, email: d.email, deletedAt: null }, select: { id: true } });
      if (existing) { skipped++; continue; }

      try {
        const candidate = await prisma.candidate.create({
          data: {
            orgId, firstName: d.firstName, lastName: d.lastName, email: d.email,
            phone: d.phone || undefined,
            currentCompany: d.currentCompany || undefined,
            currentDesignation: d.currentDesignation || undefined,
            totalExperience: d.totalExperience ?? undefined,
            skills: d.skills && d.skills.length ? JSON.parse(JSON.stringify(d.skills)) : undefined,
            source: mapSource(d.source) as never,
            location: d.location || undefined,
            linkedinUrl: d.linkedinUrl || undefined,
            createdBy: userId, updatedBy: userId,
          },
        });
        created++;

        if (requisitionId) {
          await prisma.jobApplication.create({
            data: {
              orgId, candidateId: candidate.id, requisitionId,
              currentStage: firstStage,
              stageHistory: JSON.parse(JSON.stringify([{ stage: firstStage, date: new Date().toISOString(), movedBy: userId }])),
              createdBy: userId, updatedBy: userId,
            },
          });
          await prisma.candidate.update({ where: { id: candidate.id }, data: { status: "InPipeline" } });
          applied++;
        }
      } catch (e) {
        errors.push({ row: i + 1, error: e instanceof Error ? e.message : "Failed to create" });
      }
    }

    return successResponse({ created, applied, skipped, failed: errors.length, errors }, undefined, 201);
  } catch (error) {
    console.error("POST /recruit/candidates/bulk-import error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
