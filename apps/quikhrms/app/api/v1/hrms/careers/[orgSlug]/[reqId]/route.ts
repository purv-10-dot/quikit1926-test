import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveOrgIdByCareerSlug } from "@/lib/services/career-page";

// PUBLIC (no login) — full detail for one open job on the career page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgSlug: string; reqId: string }> }) {
  try {
    const { orgSlug, reqId } = await params;
    const orgId = await resolveOrgIdByCareerSlug(orgSlug);
    if (!orgId) return notFound("Career page not found");

    const settings = await prisma.companySettings.findUnique({
      where: { orgId },
      select: { careerPageEnabled: true, companyName: true, logo: true },
    });
    if (!settings?.careerPageEnabled) return notFound("Career page not found");

    const job = await prisma.jobRequisition.findFirst({
      where: {
        id: reqId,
        orgId,
        deletedAt: null,
        careerPageVisible: true,
        internalPostingOnly: false,
        status: "ReqOpen",
      },
      select: {
        id: true,
        title: true,
        jobLocation: true,
        employmentType: true,
        workLocation: true,
        experienceMin: true,
        experienceMax: true,
        jobDescription: true,
        responsibilities: true,
        requirements: true,
        niceToHave: true,
        skills: true,
        education: true,
        benefits: true,
        raisedAt: true,
        department: { select: { name: true } },
      },
    });
    if (!job) return notFound("This job is no longer open, or doesn't exist.");

    return successResponse({
      company: { name: settings.companyName, logo: settings.logo },
      job,
    });
  } catch (error) {
    console.error("GET /careers/[orgSlug]/[reqId] error:", error);
    return internalError();
  }
}
