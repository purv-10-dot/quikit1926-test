import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyExternalApiKey } from "@/lib/services/external-api-key";
import { rateLimitOrResponse } from "@/lib/rate-limit";

// PUBLIC (API-key gated, no login) — read-only, open, career-page-visible Job
// Requisitions for an org's OWN careers website to render its job list from
// (instead of hand-maintaining a static list there). One key per org,
// self-service via Settings → Integrations → Directory API. Field names on
// the JSON below intentionally mirror a plain "Job" shape (title, type,
// location, workPreference, department, experienceRange, openings, desc,
// overview, responsibilities, requirements, offer) so a consuming site's
// existing job-card/detail components need minimal reshaping.

const ok = <T,>(data: T) => NextResponse.json({ success: true, data }, { status: 200 });
const err = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status });

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FullTime: "Full-time",
  PartTime: "Part-time",
  Contract: "Contract",
  Intern: "Contract",
  Freelance: "Contract",
};

const WORK_LOCATION_LABEL: Record<string, string> = {
  Office: "On-site",
  Remote: "Remote",
  Hybrid: "Hybrid",
};

function experienceRange(min: unknown, max: unknown): string {
  const lo = min != null ? Number(min) : null;
  const hi = max != null ? Number(max) : null;
  if (lo == null && hi == null) return "";
  if (lo != null && hi != null) return `${lo}–${hi} Years`;
  if (lo != null) return `${lo}+ Years`;
  return `Up to ${hi} Years`;
}

function toJson(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// jobDescription is authored as rich-text HTML in HRMS, but consuming career
// sites render `desc`/`overview` as plain escaped text (no HTML rendering) —
// send plain text so raw tags don't show up literally on their pages.
function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");

  // Rate-limit by the key itself (not IP) — a leaked key is capped regardless
  // of which machine it's used from.
  const rl = await rateLimitOrResponse("external.jobRequisitions", apiKey ?? "missing", 60, 60);
  if (rl) return rl;

  try {
    const orgId = await verifyExternalApiKey(apiKey, "jobRequisitions");
    if (!orgId) return err("Invalid or missing API key", 401);

    const jobs = await prisma.jobRequisition.findMany({
      where: {
        orgId, deletedAt: null,
        careerPageVisible: true, internalPostingOnly: false, status: "ReqOpen",
      },
      select: {
        id: true, title: true, employmentType: true, workLocation: true, jobLocation: true,
        experienceMin: true, experienceMax: true, positions: true, filledPositions: true,
        jobDescription: true, responsibilities: true, requirements: true, benefits: true,
        raisedAt: true, department: { select: { name: true } },
      },
      orderBy: { raisedAt: "desc" },
    });

    const data = jobs.map((j) => ({
      id: j.id,
      title: j.title,
      type: EMPLOYMENT_TYPE_LABEL[j.employmentType] ?? j.employmentType,
      location: j.jobLocation ?? "",
      workPreference: WORK_LOCATION_LABEL[j.workLocation] ?? j.workLocation,
      department: j.department?.name ?? "",
      experienceRange: experienceRange(j.experienceMin, j.experienceMax),
      // Raw numbers alongside the formatted range — lets a consuming site
      // bucket into its own Junior/Mid/Senior/Lead-style filter without
      // parsing the display string.
      experienceMinYears: j.experienceMin != null ? Number(j.experienceMin) : null,
      experienceMaxYears: j.experienceMax != null ? Number(j.experienceMax) : null,
      openings: Math.max(0, j.positions - j.filledPositions),
      // We only have one description field — same text fills both the card
      // summary ("desc") and the detail-page body ("overview").
      desc: stripHtml(j.jobDescription),
      overview: stripHtml(j.jobDescription),
      responsibilities: toJson(j.responsibilities),
      requirements: toJson(j.requirements),
      offer: toJson(j.benefits),
    }));

    return ok(data);
  } catch (error) {
    console.error("GET /job-requisitions/external error:", error);
    return err("Internal server error", 500);
  }
}
