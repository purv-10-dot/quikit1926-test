/**
 * Fetch a stored document, extract its text content via Gemini, and persist
 * the text in Document.metadata.extractedText so the AI Copilot can read it.
 *
 * Fire-and-forget — never throws to the caller.
 */
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth";
import { getObject, extractKeyFromUrl, keyBelongsToTenant } from "@/lib/storage";

const PDF_MIME = "application/pdf";
const TEXT_PLAIN = "text/plain";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_FETCH_BYTES = 15 * 1024 * 1024;
const MAX_STORED_CHARS = 60_000;

const EXTRACT_PROMPT = `You are a document text extractor.
Read the attached document and output a clean plain-text version of its contents.

Rules:
- Preserve paragraph structure and bullet points.
- Keep numbered policy clauses, tables (as readable lines), and important headings.
- Do NOT add commentary or summaries. Just return the document's literal text.
- If the document has multiple pages, concatenate the text in reading order.`;

export interface ExtractResult {
  ok: boolean;
  reason?: string;
  bytes?: number;
  mime?: string;
  chars?: number;
  source?: "s3" | "http";
}

export async function extractDocumentText(documentId: string, orgId: string): Promise<ExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: "GEMINI_API_KEY missing" };

  try {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, orgId, deletedAt: null },
    });
    if (!doc) return { ok: false, reason: "Document not found" };
    if (!doc.fileUrl) return { ok: false, reason: "fileUrl empty" };

    // Internal upload proxy URL — extract storage key from `?key=...` and pull via SDK.
    const proxyMatch = doc.fileUrl.match(/\/uploads\/proxy\?.*?key=([^&]+)/i);
    if (proxyMatch) {
      try {
        const key = decodeURIComponent(proxyMatch[1]);
        if (!keyBelongsToTenant(key, orgId)) return { ok: false, reason: "Key outside tenant", source: "s3" };
        const obj = await getObject(key);
        if (obj.body.byteLength > MAX_FETCH_BYTES) return { ok: false, reason: `Proxy file too large (${obj.body.byteLength})`, source: "s3" };
        const buf = obj.body;
        const mime = doc.fileType || obj.contentType || "application/octet-stream";
        return await runExtractor({ doc, buf, mime, source: "s3", apiKey });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`extractDocumentText proxy fetch failed for ${doc.id}:`, e);
        return { ok: false, reason: `Proxy fetch failed: ${msg}`, source: "s3" };
      }
    }

    // Only tenant-owned storage files are extractable. We never fetch() an
    // arbitrary URL (that would be an SSRF vector) and never read a storage key
    // belonging to another tenant.
    const storageKey = extractKeyFromUrl(doc.fileUrl);
    if (!storageKey || !keyBelongsToTenant(storageKey, orgId)) {
      return { ok: false, reason: "Only tenant-owned storage files can be extracted" };
    }

    let buf: Buffer;
    let mime = doc.fileType || "application/octet-stream";
    const source: "s3" = "s3";
    try {
      const obj = await getObject(storageKey);
      if (obj.body.byteLength > MAX_FETCH_BYTES) return { ok: false, reason: `Storage file too large (${obj.body.byteLength} > ${MAX_FETCH_BYTES})`, source };
      buf = obj.body;
      mime = doc.fileType || obj.contentType || "application/octet-stream";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`extractDocumentText storage fetch failed for ${doc.id}:`, e);
      return { ok: false, reason: `Storage fetch failed: ${msg}`, source };
    }

    return await runExtractor({ doc, buf, mime, source, apiKey });
  } catch (err) {
    console.error(`extractDocumentText(${documentId}) failed:`, err);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function runExtractor(params: {
  doc: { id: string; metadata: unknown };
  buf: Buffer;
  mime: string;
  source: "s3" | "http";
  apiKey: string;
}): Promise<ExtractResult> {
  const { doc, buf, mime, source, apiKey } = params;
  let extracted = "";

  if (mime === TEXT_PLAIN || mime.startsWith("text/plain")) {
    extracted = buf.toString("utf-8");
  } else if (mime === DOCX_MIME) {
    const out = await mammoth.extractRawText({ buffer: buf });
    extracted = out.value ?? "";
  } else if (mime === PDF_MIME || IMAGE_TYPES.has(mime)) {
    const modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.0, maxOutputTokens: 8192 },
    });
    const resp = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          { text: EXTRACT_PROMPT },
          { inlineData: { mimeType: mime, data: buf.toString("base64") } },
        ],
      }],
    });
    extracted = resp.response.text() ?? "";
  } else {
    return { ok: false, reason: `Unsupported mime: ${mime}`, source, bytes: buf.byteLength };
  }

  extracted = extracted.trim().slice(0, MAX_STORED_CHARS);
  if (!extracted) return { ok: false, reason: "Extractor returned empty text", source, mime, bytes: buf.byteLength };

  const existing = (doc.metadata as Record<string, unknown> | null) ?? {};
  const merged = { ...existing, extractedText: extracted, extractedAt: new Date().toISOString() };

  await prisma.document.update({
    where: { id: doc.id },
    data: { metadata: merged },
  });
  return { ok: true, source, mime, bytes: buf.byteLength, chars: extracted.length };
}
