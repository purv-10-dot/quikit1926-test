/**
 * Manual transcript upload: extract plain text from a user-supplied `.docx`
 * file so it can be stored in `ClientMeetingTranscript.rawText` — the same
 * field Fathom ingestion populates, so the rest of the pipeline (viewer,
 * export, Gemini report generation) needs no changes to consume it.
 */
import mammoth from "mammoth";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_DOCX_BYTES = 10 * 1024 * 1024; // 10 MB, matches supportAttachments cap

export class DocxTranscriptError extends Error {}

/** Extract raw text from a `.docx` buffer. Throws `DocxTranscriptError` if the file has no extractable text. */
export async function parseDocxTranscript(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  const rawText = value.trim();
  if (!rawText) {
    throw new DocxTranscriptError("No text could be extracted from this file.");
  }
  return rawText;
}
