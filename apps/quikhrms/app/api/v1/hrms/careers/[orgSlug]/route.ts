import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveOrgIdByCareerSlug } from "@/lib/services/career-page";

// PUBLIC (no login) — job listing for one org's career page, identified by
// either its custom career-page slug or its default Org.slug in the URL.
// Returns 404 (not just an empty list) whenever the org doesn't exist OR
// hasn't turned the career page on, so a disabled page looks identical to a
// non-existent one from the outside.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) {
  try {
    const { orgSlug } = await params;
    const orgId = await resolveOrgIdByCareerSlug(orgSlug);
    if (!orgId) return notFound("Career page not found");

    const settings = await prisma.companySettings.findUnique({
      where: { orgId },
      select: { careerPageEnabled: true, companyName: true, logo: true, careerPageIntro: true },
    });
    if (!settings?.careerPageEnabled) return notFound("Career page not found");

    const jobs = await prisma.jobRequisition.findMany({
      where: {
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
        raisedAt: true,
        department: { select: { name: true } },
      },
      orderBy: { raisedAt: "desc" },
    });

    return successResponse({
      company: { name: settings.companyName, logo: settings.logo, intro: settings.careerPageIntro },
      jobs,
    });
  } catch (error) {
    console.error("GET /careers/[orgSlug] error:", error);
    return internalError();
  }
}
