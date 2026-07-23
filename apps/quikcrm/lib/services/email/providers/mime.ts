/**
 * RFC 5322 / MIME helpers shared by the Gmail provider (which sends raw RFC822)
 * and by message parsing. Kept dependency-free — string building + Buffer only.
 *
 * The Microsoft provider sends via a Graph JSON payload (not raw MIME), so it
 * only uses the parsing/address helpers here, not buildMimeMessage.
 */

import type { SendMessageInput } from "./types";

/** Extract the bare email from a "Name <email@x>" header value. */
export function extractEmail(headerVal: string): string {
  const m = headerVal.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  return headerVal.trim().toLowerCase();
}

/** Extract the display name from a "Name <email@x>" header value (or ""). */
export function extractName(headerVal: string): string {
  const m = headerVal.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : "";
}

/** Split a comma-separated address header into bare lowercase emails. */
export function splitAddresses(headerVal: string): string[] {
  if (!headerVal.trim()) return [];
  return headerVal
    .split(",")
    .map((s) => extractEmail(s))
    .filter(Boolean);
}

/** Case-insensitive header lookup over Gmail's {name,value}[] header array. */
export function headerValue(
  headers: { name: string; value: string }[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  const h = headers.find((x) => x.name.toLowerCase() === lower);
  return h ? h.value : null;
}

interface GmailPartLike {
  mimeType?: string;
  filename?: string;
  body?: { data?: string };
  parts?: GmailPartLike[];
}

/** Recursively pull the text/html and text/plain bodies out of a Gmail payload. */
export function extractBodies(part: GmailPartLike | undefined): {
  html?: string;
  text?: string;
} {
  let html: string | undefined;
  let text: string | undefined;

  function walk(p: GmailPartLike | undefined): void {
    if (!p) return;
    // Skip attachment parts (they carry a filename).
    if (!p.filename && p.body?.data) {
      const decoded = Buffer.from(p.body.data, "base64url").toString("utf8");
      if (p.mimeType === "text/html" && html === undefined) html = decoded;
      else if (p.mimeType === "text/plain" && text === undefined) text = decoded;
    }
    for (const c of p.parts ?? []) walk(c);
  }
  walk(part);
  return { html, text };
}

/** Naive HTML → text fallback for snippet/plain-text alternative. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** RFC 2047 encode a header value if it contains non-ASCII characters. */
function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * Build a full RFC822 message (MIME multipart when attachments are present)
 * for Gmail's messages/send `raw` field. Sets threading headers when replying.
 */
export function buildMimeMessage(input: SendMessageInput): string {
  const boundary = `qk_${Buffer.from(input.subject + input.to.join(",")).toString("hex").slice(0, 24)}`;
  const altBoundary = `alt_${boundary}`;
  const lines: string[] = [];

  lines.push(`From: ${input.fromAddress}`);
  lines.push(`To: ${input.to.join(", ")}`);
  if (input.cc?.length) lines.push(`Cc: ${input.cc.join(", ")}`);
  if (input.bcc?.length) lines.push(`Bcc: ${input.bcc.join(", ")}`);
  lines.push(`Subject: ${encodeHeaderWord(input.subject)}`);
  lines.push("MIME-Version: 1.0");
  if (input.inReplyToRfcId) {
    lines.push(`In-Reply-To: ${input.inReplyToRfcId}`);
    lines.push(`References: ${input.inReplyToRfcId}`);
  }

  const html = input.bodyHtml;
  const text = htmlToText(html);
  const hasAttachments = !!input.attachments?.length;

  const bodyAlt: string[] = [];
  bodyAlt.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`, "");
  bodyAlt.push(`--${altBoundary}`);
  bodyAlt.push("Content-Type: text/plain; charset=UTF-8");
  bodyAlt.push("Content-Transfer-Encoding: base64", "");
  bodyAlt.push(Buffer.from(text, "utf8").toString("base64"));
  bodyAlt.push(`--${altBoundary}`);
  bodyAlt.push("Content-Type: text/html; charset=UTF-8");
  bodyAlt.push("Content-Transfer-Encoding: base64", "");
  bodyAlt.push(Buffer.from(html, "utf8").toString("base64"));
  bodyAlt.push(`--${altBoundary}--`);

  if (!hasAttachments) {
    return [...lines, ...bodyAlt].join("\r\n");
  }

  // multipart/mixed wrapping the alternative body + attachments.
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "");
  lines.push(`--${boundary}`);
  lines.push(...bodyAlt, "");
  for (const att of input.attachments ?? []) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${att.filename}"`, "");
    // Re-wrap to 76-char lines per RFC.
    lines.push(att.contentBase64.replace(/(.{76})/g, "$1\r\n"));
  }
  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}
