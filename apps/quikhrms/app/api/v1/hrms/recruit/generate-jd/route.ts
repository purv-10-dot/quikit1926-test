import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

interface GenBody {
  title?: string;
  experienceMin?: number | null;
  experienceMax?: number | null;
  skills?: string[];
  employmentType?: string;
  workLocation?: string;
  department?: string;
}

interface JDResult {
  jobDescription: string;
  requirements: string[];
  niceToHave: string[];
}

function templateJD(b: GenBody): JDResult {
  const exp =
    b.experienceMin != null || b.experienceMax != null
      ? ` We are looking for ${b.experienceMin ?? 0}${b.experienceMax != null ? `–${b.experienceMax}` : "+"} years of experience.`
      : "";
  const place = b.workLocation === "Remote" ? "remotely" : `at our ${(b.workLocation ?? "office").toLowerCase()}`;
  return {
    jobDescription: `We are hiring a ${b.title ?? "professional"} to join our team.${exp} In this role you will drive key initiatives, collaborate across functions, and own measurable outcomes. This is a ${b.employmentType ?? "full-time"} position, based ${place}.`,
    requirements: [
      "Strong ownership and communication skills",
      "Hands-on experience relevant to the role",
      ...(b.skills?.length ? [`Proficiency in ${b.skills.slice(0, 5).join(", ")}`] : []),
    ],
    niceToHave: ["Experience in a fast-paced, high-growth environment"],
  };
}

// AI-generated JD is temporarily disabled — the direct Anthropic call has
// been removed pending migration to @quikit/ai-sdk. Always returns the
// deterministic template so the "Auto-write" button keeps working.
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const b = (await req.json()) as GenBody;
    return successResponse(templateJD(b));
  } catch (error) {
    console.error("POST /recruit/generate-jd error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write"] });
