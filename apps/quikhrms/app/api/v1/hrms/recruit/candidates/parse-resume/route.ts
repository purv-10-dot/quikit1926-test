import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { extractKeyFromUrl, keyBelongsToTenant, getObject } from "@/lib/storage";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth";

/**
 * POST /api/v1/hrms/recruit/candidates/parse-resume — "Smart Add"
 *
 * Reads an already-uploaded resume and returns a best-effort set of Add
 * Candidate fields to pre-fill the wizard with. Single, self-contained call
 * (Model A shape per docs/14-ai-integration-guide.md) — only this one
 * resume's content ever reaches the prompt, nothing else. Uses the direct
 * Gemini SDK per project decision (see memory: ai-direct-provider-sdks-only),
 * not @quikit/ai-sdk.
 *
 * Never hard-fails: any extraction problem returns the empty shape (200) so
 * the wizard always opens — with the resume attached — for the user to fill
 * manually instead.
 */

interface ParsedCandidateFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentCompany: string;
  currentDesignation: string;
  experienceMonths: number | null;
  skills: string[];
  linkedinUrl: string;
  location: string;
}

const EMPTY: ParsedCandidateFields = {
  firstName: "", lastName: "", email: "", phone: "",
  currentCompany: "", currentDesignation: "",
  experienceMonths: null, skills: [], linkedinUrl: "", location: "",
};

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_DOCX_CHARS = 20_000;

const EXTRACT_PROMPT = `You are a resume parser for a recruiting system.
Read the attached resume and extract ONLY these fields. Return STRICT JSON — no markdown fences, no commentary — matching exactly this shape:
{
  "firstName": string, "lastName": string, "email": string, "phone": string,
  "currentCompany": string, "currentDesignation": string,
  "experienceMonths": number | null,
  "skills": string[], "linkedinUrl": string, "location": string
}

Rules:
- Use "" for any text field you cannot find, [] for skills if none found, null for experienceMonths if unknown.
- experienceMonths = total professional work experience in months (estimate from work-history dates if not stated directly).
- phone: digits only (no country code, spaces, or dashes).
- currentCompany / currentDesignation: the candidate's MOST RECENT role only.
- Do NOT invent data that isn't in the resume. Do NOT include any field not listed above.`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1);
  return text;
}

function shapeResult(parsed: Record<string, unknown>): ParsedCandidateFields {
  return {
    firstName: typeof parsed.firstName === "string" ? parsed.firstName.trim() : "",
    lastName: typeof parsed.lastName === "string" ? parsed.lastName.trim() : "",
    email: typeof parsed.email === "string" ? parsed.email.trim() : "",
    phone: typeof parsed.phone === "string" ? parsed.phone.replace(/\D/g, "").slice(-10) : "",
    currentCompany: typeof parsed.currentCompany === "string" ? parsed.currentCompany.trim() : "",
    currentDesignation: typeof parsed.currentDesignation === "string" ? parsed.currentDesignation.trim() : "",
    experienceMonths: typeof parsed.experienceMonths === "number" && Number.isFinite(parsed.experienceMonths)
      ? Math.max(0, Math.round(parsed.experienceMonths))
      : null,
    skills: Array.isArray(parsed.skills)
      ? parsed.skills.filter((s): s is string => typeof s === "string").slice(0, 30)
      : [],
    linkedinUrl: typeof parsed.linkedinUrl === "string" ? parsed.linkedinUrl.trim() : "",
    location: typeof parsed.location === "string" ? parsed.location.trim() : "",
  };
}

export const POST = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const body = (await req.json()) as { resumeUrl?: string };
    const resumeUrl = typeof body.resumeUrl === "string" ? body.resumeUrl.trim() : "";
    if (!resumeUrl) return validationError("resumeUrl required");

    const key = extractKeyFromUrl(resumeUrl);
    if (!key || !keyBelongsToTenant(key, orgId)) {
      return validationError("Resume file not found or doesn't belong to your organisation");
    }

    // No key configured → graceful no-op, caller falls back to a blank form.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return successResponse(EMPTY);

    let obj;
    try {
      obj = await getObject(key);
    } catch (e) {
      console.error("parse-resume: storage fetch failed:", e);
      return successResponse(EMPTY);
    }
    if (obj.body.byteLength > MAX_BYTES) return validationError("Resume file too large");

    const mime = obj.contentType || "application/octet-stream";
    let parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;

    if (mime === DOCX_MIME) {
      const out = await mammoth.extractRawText({ buffer: obj.body });
      const text = (out.value ?? "").trim().slice(0, MAX_DOCX_CHARS);
      if (!text) return successResponse(EMPTY);
      parts = [{ text: `${EXTRACT_PROMPT}\n\nResume text:\n${text}` }];
    } else if (mime === PDF_MIME || IMAGE_TYPES.has(mime)) {
      parts = [
        { text: EXTRACT_PROMPT },
        { inlineData: { mimeType: mime, data: obj.body.toString("base64") } },
      ];
    } else {
      return validationError("Unsupported resume file type for auto-fill — upload a PDF, DOC, or DOCX.");
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite",
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      });
      const resp = await model.generateContent({ contents: [{ role: "user", parts }] });
      const raw = resp.response.text() ?? "";
      const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
      return successResponse(shapeResult(parsed));
    } catch (e) {
      // Model/parse failure → graceful empty result, never blocks Add Candidate.
      console.error("parse-resume: AI extraction failed:", e);
      return successResponse(EMPTY);
    }
  } catch (error) {
    console.error("POST /recruit/candidates/parse-resume error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.recruit.write"],
  rateLimit: [
    { max: 10, windowSec: 60, by: "user", scope: "ai" },
    { max: 200, windowSec: 24 * 60 * 60, by: "tenant", scope: "ai.daily" },
  ],
});
