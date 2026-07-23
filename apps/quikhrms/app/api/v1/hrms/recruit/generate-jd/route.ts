import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { anthropic, CLAUDE_MODEL } from "@/lib/ai/claude";

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

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const b = (await req.json()) as GenBody;
    if (!b.title || !b.title.trim()) {
      return successResponse(templateJD(b));
    }

    // No API key configured → return the deterministic template.
    if (!anthropic) {
      return successResponse(templateJD(b));
    }

    const prompt = [
      `Write a job description for this role. Indian company context.`,
      `Role title: ${b.title}`,
      b.department ? `Department: ${b.department}` : "",
      b.employmentType ? `Employment type: ${b.employmentType}` : "",
      b.workLocation ? `Work location: ${b.workLocation}` : "",
      b.experienceMin != null || b.experienceMax != null
        ? `Experience: ${b.experienceMin ?? 0}${b.experienceMax != null ? `-${b.experienceMax}` : "+"} years`
        : "",
      b.skills?.length ? `Key skills: ${b.skills.join(", ")}` : "",
      ``,
      `Return ONLY strict JSON (no markdown, no prose) with this exact shape:`,
      `{"jobDescription": string (2-3 short paragraphs on role, scope, impact), "requirements": string[] (5-7 must-have bullets), "niceToHave": string[] (3-5 bullets)}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const msg = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system:
          "You are an expert technical recruiter writing clear, professional, bias-free job descriptions. Output strict JSON only — no markdown fences, no commentary.",
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join("")
        .trim();
      // Strip any accidental ```json fences, then parse.
      const json = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const parsed = JSON.parse(json) as Partial<JDResult>;
      return successResponse({
        jobDescription: typeof parsed.jobDescription === "string" ? parsed.jobDescription : templateJD(b).jobDescription,
        requirements: Array.isArray(parsed.requirements) ? parsed.requirements.filter((x) => typeof x === "string") : [],
        niceToHave: Array.isArray(parsed.niceToHave) ? parsed.niceToHave.filter((x) => typeof x === "string") : [],
      });
    } catch {
      // Model/parse failure → graceful template fallback.
      return successResponse(templateJD(b));
    }
  } catch (error) {
    console.error("POST /recruit/generate-jd error:", error);
    return internalError();
  }
});
