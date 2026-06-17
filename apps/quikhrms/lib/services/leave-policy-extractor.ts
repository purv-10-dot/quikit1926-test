/**
 * Leave Policy AI Extractor.
 *
 * Input : uploaded PDF/DOCX/text leave-policy document (bytes + mime).
 * Output: structured LeavePolicyRules JSON, validated by Zod.
 *
 * Strategy: try Gemini first (cheap, multimodal-native for PDF). Fall back to
 * Claude on failure / low confidence / empty result. Output ALWAYS goes through
 * `leavePolicyRulesSchema.parse` so callers can rely on shape.
 *
 * Output is NEVER applied directly at apply-leave time. It's saved as
 * `extractedRules` on LeavePolicy and must be HR-reviewed → `approvedRules`.
 */
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import mammoth from "mammoth";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/ai/claude";
import { leavePolicyRulesSchema, type LeavePolicyRules } from "@/lib/validations/leave";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_PLAIN = "text/plain";

const MAX_TEXT_CHARS = 80_000;

const EXTRACT_PROMPT = `You are a leave-policy parser for an HRMS.

Read the attached company leave policy document. Extract every concrete,
machine-enforceable rule into the strict JSON schema below.

Rules:
- Output ONLY JSON. No prose, no markdown, no commentary.
- For every field you cannot find explicit text for, output null (not 0, not "").
- Do NOT invent values. Do NOT infer from "common sense". Only extract what is
  literally stated in the document.
- leaveTypeCode: short canonical uppercase code per leave type. Use the code if
  the document gives one (e.g. "CL"), else derive a 2-4 letter code from the
  full name (e.g. "Casual Leave" -> "CL", "Maternity Leave" -> "ML").
- Dates in blackoutDateRanges: ISO YYYY-MM-DD when given. If only a month-range
  like "December to January" is mentioned, OMIT that range (do not invent dates).
- weekendDays: array of integers 0=Sunday..6=Saturday. Only include if explicitly
  stated which days are non-working.
- For maxPerMonth / maxPerYear / advanceNoticeDays: integers from explicit text.
- sandwichRule = true only if the document explicitly says weekends/holidays
  between leaves are counted as leave.

Output JSON shape (TypeScript):
{
  "schemaVersion": 1,
  "global": {
    "maxOpenRequests": number | null,
    "maxOverlapPerTeamPercent": number | null,
    "blackoutDates": string[] | null,
    "blackoutDateRanges": [{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","reason":"..."}] | null,
    "weekendDays": number[] | null,
    "notes": string | null
  },
  "leaveTypes": [
    {
      "leaveTypeCode": string,
      "leaveTypeName": string,
      "minConsecutiveDays": number | null,
      "maxConsecutiveDays": number | null,
      "maxPerMonth": number | null,
      "maxPerYear": number | null,
      "advanceNoticeDays": number | null,
      "applicableAfterDays": number | null,
      "probationBlocked": boolean | null,
      "requiresDocumentation": boolean | null,
      "documentationAfterDays": number | null,
      "isHalfDayAllowed": boolean | null,
      "includesHolidays": boolean | null,
      "includesWeekoffs": boolean | null,
      "sandwichRule": boolean | null,
      "clubbingBlockedWith": string[] | null,
      "applicableGender": string | null,
      "applicableEmploymentType": string[] | null,
      "isNegativeBalanceAllowed": boolean | null,
      "maxNegativeBalance": number | null,
      "carryForwardMax": number | null,
      "notes": string | null
    }
  ]
}`;

const GEMINI_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    schemaVersion: { type: SchemaType.NUMBER },
    global: {
      type: SchemaType.OBJECT,
      nullable: true,
      properties: {
        maxOpenRequests: { type: SchemaType.NUMBER, nullable: true },
        maxOverlapPerTeamPercent: { type: SchemaType.NUMBER, nullable: true },
        blackoutDates: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: true },
        weekendDays: { type: SchemaType.ARRAY, items: { type: SchemaType.NUMBER }, nullable: true },
        notes: { type: SchemaType.STRING, nullable: true },
      },
    },
    leaveTypes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          leaveTypeCode: { type: SchemaType.STRING },
          leaveTypeName: { type: SchemaType.STRING, nullable: true },
          minConsecutiveDays: { type: SchemaType.NUMBER, nullable: true },
          maxConsecutiveDays: { type: SchemaType.NUMBER, nullable: true },
          maxPerMonth: { type: SchemaType.NUMBER, nullable: true },
          maxPerYear: { type: SchemaType.NUMBER, nullable: true },
          advanceNoticeDays: { type: SchemaType.NUMBER, nullable: true },
          applicableAfterDays: { type: SchemaType.NUMBER, nullable: true },
          probationBlocked: { type: SchemaType.BOOLEAN, nullable: true },
          requiresDocumentation: { type: SchemaType.BOOLEAN, nullable: true },
          documentationAfterDays: { type: SchemaType.NUMBER, nullable: true },
          isHalfDayAllowed: { type: SchemaType.BOOLEAN, nullable: true },
          includesHolidays: { type: SchemaType.BOOLEAN, nullable: true },
          includesWeekoffs: { type: SchemaType.BOOLEAN, nullable: true },
          sandwichRule: { type: SchemaType.BOOLEAN, nullable: true },
          clubbingBlockedWith: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: true },
          applicableGender: { type: SchemaType.STRING, nullable: true },
          applicableEmploymentType: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: true },
          isNegativeBalanceAllowed: { type: SchemaType.BOOLEAN, nullable: true },
          maxNegativeBalance: { type: SchemaType.NUMBER, nullable: true },
          carryForwardMax: { type: SchemaType.NUMBER, nullable: true },
          notes: { type: SchemaType.STRING, nullable: true },
        },
        required: ["leaveTypeCode"],
      },
    },
  },
  required: ["schemaVersion", "leaveTypes"],
};

export interface ExtractPolicyInput {
  buf: Buffer;
  mime: string;
}

export interface ExtractPolicyResult {
  ok: boolean;
  rules?: LeavePolicyRules;
  provider?: "gemini" | "claude" | "text";
  log: Array<{ step: string; ok: boolean; reason?: string }>;
  error?: string;
}

async function bufferToText(buf: Buffer, mime: string): Promise<string | null> {
  if (mime === TEXT_PLAIN || mime.startsWith("text/plain")) {
    return buf.toString("utf-8");
  }
  if (mime === DOCX_MIME) {
    const out = await mammoth.extractRawText({ buffer: buf });
    return out.value ?? "";
  }
  return null;
}

function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try { return JSON.parse(fenced); } catch { /* try first JSON object substring */ }
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

/** Validate with a human-readable error so failures are debuggable. */
function validate(raw: unknown): { ok: true; rules: LeavePolicyRules } | { ok: false; reason: string } {
  if (raw == null) return { ok: false, reason: "model returned empty body" };
  const parsed = leavePolicyRulesSchema.safeParse(raw);
  if (parsed.success) return { ok: true, rules: parsed.data };
  // Pluck the first 3 Zod issues into a readable string.
  const issues = parsed.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, reason: `schema mismatch — ${issues}` };
}

type ExtractAttempt = { ok: true; rules: LeavePolicyRules } | { ok: false; reason: string };

async function extractViaGemini(input: ExtractPolicyInput): Promise<ExtractAttempt> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: "GEMINI_API_KEY not set" };

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
    },
  });

  let parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: EXTRACT_PROMPT },
  ];

  if (input.mime === PDF_MIME || input.mime.startsWith("image/")) {
    parts.push({ inlineData: { mimeType: input.mime, data: input.buf.toString("base64") } });
  } else {
    const text = await bufferToText(input.buf, input.mime);
    if (!text) return { ok: false, reason: `unsupported mime type: ${input.mime}` };
    parts.push({ text: `Document content:\n\n${text.slice(0, MAX_TEXT_CHARS)}` });
  }

  const resp = await model.generateContent({ contents: [{ role: "user", parts }] });
  const rawText = resp.response.text() ?? "";
  if (!rawText.trim()) return { ok: false, reason: "gemini returned no text" };
  const json = safeJsonParse(rawText);
  if (json == null) {
    return { ok: false, reason: `gemini output was not JSON — first 200 chars: ${rawText.slice(0, 200)}` };
  }
  return validate(json);
}

async function extractViaClaude(input: ExtractPolicyInput): Promise<ExtractAttempt> {
  if (!anthropic) return { ok: false, reason: "ANTHROPIC_API_KEY not set" };

  let content: Anthropic.MessageParam["content"];
  if (input.mime === PDF_MIME) {
    content = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: input.buf.toString("base64") },
      },
      { type: "text", text: EXTRACT_PROMPT },
    ];
  } else if (input.mime.startsWith("image/")) {
    content = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: input.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: input.buf.toString("base64"),
        },
      },
      { type: "text", text: EXTRACT_PROMPT },
    ];
  } else {
    const text = await bufferToText(input.buf, input.mime);
    if (!text) return { ok: false, reason: `unsupported mime type: ${input.mime}` };
    content = `${EXTRACT_PROMPT}\n\nDocument content:\n\n${text.slice(0, MAX_TEXT_CHARS)}`;
  }

  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    temperature: 0,
    messages: [{ role: "user", content }],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return { ok: false, reason: "claude returned no text block" };
  const json = safeJsonParse(textBlock.text);
  if (json == null) {
    return { ok: false, reason: `claude output was not JSON — first 200 chars: ${textBlock.text.slice(0, 200)}` };
  }
  return validate(json);
}

export async function extractLeavePolicy(input: ExtractPolicyInput): Promise<ExtractPolicyResult> {
  const log: ExtractPolicyResult["log"] = [];

  try {
    const r = await extractViaGemini(input);
    if (r.ok) {
      log.push({ step: "gemini", ok: true });
      return { ok: true, rules: r.rules, provider: "gemini", log };
    }
    log.push({ step: "gemini", ok: false, reason: r.reason });
    console.warn("[leave-policy-extractor] gemini:", r.reason);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.push({ step: "gemini", ok: false, reason });
    console.error("[leave-policy-extractor] gemini threw:", err);
  }

  try {
    const r = await extractViaClaude(input);
    if (r.ok) {
      log.push({ step: "claude", ok: true });
      return { ok: true, rules: r.rules, provider: "claude", log };
    }
    log.push({ step: "claude", ok: false, reason: r.reason });
    console.warn("[leave-policy-extractor] claude:", r.reason);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.push({ step: "claude", ok: false, reason });
    console.error("[leave-policy-extractor] claude threw:", err);
  }

  return { ok: false, log, error: "Both extractors failed to produce valid rules" };
}
