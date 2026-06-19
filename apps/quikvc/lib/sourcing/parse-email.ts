/**
 * Inbound-email parser for sourcing.
 *
 * Triggered by the email-forwarding webhook (`POST /api/webhooks/email/sourced`).
 * Pulls the most useful fields out of a forwarded pitch email:
 *
 *   - Startup name        → from subject (after stripping "Fwd:" / "Re:")
 *                           or from the original sender's display name
 *   - Pitch / one-liner   → first ~3 lines of the body, excluding signatures
 *   - Contact email       → the original sender (parsed from "From:" line
 *                           inside the forwarded body, or fall back to the
 *                           webhook's reported sender)
 *   - Website             → first URL found in the body
 *   - Funding ask         → first ₹/Rs/INR amount with "L" / "lakh" / "crore"
 *
 * This is intentionally conservative — we'd rather create an opportunity
 * with a few empty fields than guess wrong. Analyst can fill in the rest.
 */

export interface InboundEmail {
  /** "From" header on the webhook body — usually the forwarder, not the source. */
  from: string;
  /** "To" header — used to scope which tenant this email belongs to. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Plain-text body (Resend includes both text + html; prefer text). */
  text: string;
  /** Optional HTML body. Used only as fallback when text is empty. */
  html?: string;
}

export interface ParsedOpportunity {
  startupName: string;
  contactEmail?: string;
  contactName?: string;
  website?: string;
  pitch?: string;
  fundingAskLakhs?: number;
}

/**
 * Strip "Fwd: " / "Fw: " / "Re: " prefixes (case-insensitive, repeated).
 */
export function cleanSubject(subject: string): string {
  let s = (subject ?? "").trim();
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^(?:fwd?|re):\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.trim();
}

/**
 * Pull the first email address out of an "Original Message" header inside
 * a forwarded body — that's usually the actual founder, not the forwarder.
 */
export function extractOriginalSender(body: string): { email?: string; name?: string } {
  // Match "From: Jane Doe <jane@acme.test>" anywhere in the body
  const match = body.match(/(?:^|\n)\s*From:\s*([^\n<]+?)?\s*<([^>\s]+@[^>\s]+)>/i);
  if (match) {
    const name = match[1]?.trim().replace(/["']/g, "") || undefined;
    return { name, email: match[2].trim() };
  }
  // Bare email (no display name)
  const bare = body.match(/(?:^|\n)\s*From:\s*([^\s\n]+@[^\s\n]+)/i);
  if (bare) return { email: bare[1].trim() };
  return {};
}

/**
 * First http(s) URL in the body, normalized (strip trailing punctuation).
 */
export function extractWebsite(body: string): string | undefined {
  const m = body.match(/https?:\/\/[^\s<>"]+/);
  if (!m) return undefined;
  return m[0].replace(/[.,;:!?)"']+$/, "");
}

/**
 * Parse an INR funding ask. Recognises:
 *   ₹50L, ₹1.5Cr, Rs 50 lakhs, INR 1 crore, "asking for 50L"
 * Returns the amount in lakhs (₹1L = 100,000 INR; ₹1Cr = 100L).
 *
 * To avoid matching unrelated metrics (e.g. "₹2L MRR" or "5L users"), we
 * try a keyword-proximity pass first: amounts within ~30 chars of words
 * like "ask", "raise", "round", "seeking" win. If no keyword-anchored
 * amount is found, fall back to the first amount in the body.
 */
const FUNDING_KEYWORDS = /(?:ask(?:ing)?|raise|raising|raised|seek(?:ing)?|round|fund(?:ing|s)?|need(?:ing|ed)?|target|cheque|investment)/i;

export function extractFundingAskLakhs(body: string): number | undefined {
  // 1. Keyword-anchored — look for funding-language within a short window
  //    around any ₹/Rs/INR amount.
  const anchored = matchAnchoredAmount(body);
  if (anchored !== undefined) return anchored;

  // 2. Fallback — first ₹/Rs/INR amount anywhere. Liable to false positives
  //    like "₹2L MRR", but better than dropping ambiguous mentions entirely.
  return matchAnyAmount(body);
}

function matchAnchoredAmount(body: string): number | undefined {
  // Walk every funding-keyword occurrence; check the 80-char window after
  // it for an amount.
  const regex = new RegExp(FUNDING_KEYWORDS.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    const window = body.slice(m.index, m.index + 80);
    const amt = matchAnyAmount(window);
    if (amt !== undefined) return amt;
  }
  return undefined;
}

function matchAnyAmount(body: string): number | undefined {
  const crore = body.match(/(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(?:cr|crore)s?\b/i);
  if (crore) {
    const num = parseFloat(crore[1]);
    if (isFinite(num) && num > 0) return Math.round(num * 100);
  }
  const lakh = body.match(/(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(?:l|lakh)s?\b/i);
  if (lakh) {
    const num = parseFloat(lakh[1]);
    if (isFinite(num) && num > 0) return Math.round(num);
  }
  return undefined;
}

/**
 * Pull the first 1-3 substantive lines of body for the pitch field.
 * Skips lines that look like email reply headers, signatures, or quoted text.
 *
 * If the body contains a "Forwarded message" / "Original Message" delimiter,
 * we extract the pitch from AFTER it — that's where the real founder content
 * lives, not the forwarder's "FYI" cover note.
 */
export function extractPitch(body: string): string | undefined {
  const fwdIdx = findForwardBoundary(body);
  const search = fwdIdx >= 0 ? body.slice(fwdIdx) : body;

  const lines = search
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) =>
      l.length > 0 &&
      !l.startsWith(">") && // quoted reply
      !/^-+\s*$/.test(l) && // signature / "Forwarded message" divider
      !/^On .+ wrote:$/i.test(l) && // "On Wed, Jan 1 ..., Jane wrote:"
      !/^Forwarded message/i.test(l) && // boundary text itself
      !/^From:|^To:|^Date:|^Subject:|^Sent from|^Reply-To:/i.test(l) && // forward headers
      !/^(?:Hi|Hello|Hey|Dear)\b[^.!?]*[,.!]\s*$/i.test(l) && // greeting line
      !/^(?:Best|Regards|Thanks|Cheers|Sincerely|--)\b/i.test(l), // sign-off
    );

  if (lines.length === 0) return undefined;
  return lines.slice(0, 3).join(" ").slice(0, 800);
}

/**
 * Index of the start of the forwarded section, or -1 if not found.
 * Recognises common Gmail / Outlook / Apple Mail patterns.
 */
function findForwardBoundary(body: string): number {
  const patterns = [
    /\n[-]+\s*Forwarded message[-]*\s*\n/i,
    /\n[-]+\s*Original Message[-]*\s*\n/i,
    /\nBegin forwarded message:/i,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m && m.index !== undefined) {
      return m.index + m[0].length;
    }
  }
  return -1;
}

/**
 * Main parser. Always returns at minimum a startupName — it falls back to
 * the cleaned subject line so an opportunity row always gets created.
 */
export function parseInboundEmail(email: InboundEmail): ParsedOpportunity {
  const subject = cleanSubject(email.subject);
  const body = email.text || stripHtml(email.html ?? "");

  const original = extractOriginalSender(body);
  const website = extractWebsite(body);
  const fundingAskLakhs = extractFundingAskLakhs(body);
  const pitch = extractPitch(body);

  return {
    startupName: subject || "Untitled opportunity",
    contactEmail: original.email ?? email.from,
    contactName: original.name,
    website,
    pitch,
    fundingAskLakhs,
  };
}

/** Crude HTML strip — good enough for fallback when no plain-text body. */
function stripHtml(html: string): string {
  return html
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
