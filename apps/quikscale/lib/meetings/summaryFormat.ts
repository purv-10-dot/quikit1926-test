/**
 * Fathom summary sanitisation + light markdown structuring.
 *
 * WHY THIS EXISTS
 * ---------------
 * Fathom's AI summary arrives as `default_summary.markdown_formatted` and its
 * every bullet carries a citation link back into the recording:
 *
 *     - Team agreed to move the QBR ([View](https://fathom.video/calls/883?timestamp=142.5))
 *
 * We stored that markdown verbatim and rendered it as PLAIN text, so a Fathom
 * URL appeared after every single line — unreadable in the viewer, in the .txt
 * and .docx exports, and wasteful (and leak-prone) in the Gemini prompt.
 *
 * CLEAN AT READ TIME, NEVER AT INGESTION
 * --------------------------------------
 * `ClientMeetingTranscript.summary` keeps exactly what the recorder sent, for
 * the same reason `normalize.ts` never rewrites `rawText`: the original must
 * survive so a cleaning-rule change can be re-run against the true source
 * rather than against its own last output. Cleaning here also fixes every row
 * already in the database with no backfill migration.
 *
 * The citation TIMESTAMP is dropped along with the URL. A summary is a prose
 * digest — the transcript viewer is where moments are located — and a trailing
 * "(2:22)" on every bullet reintroduces the visual clutter the URL caused.
 *
 * KEEP THIS MODULE DEPENDENCY-FREE
 * --------------------------------
 * `apps/quikflow/scripts/fathom-parity-report.ts` imports this by relative path
 * so its "what the screen shows" column calls the REAL render functions rather
 * than a reimplementation that could quietly disagree. Adding a `@/`-aliased,
 * React or Prisma import here breaks that script.
 */

/** Recorder hosts whose links are chrome, not content. */
const RECORDER_HOST = /(?:^|\/\/|\.)(?:fathom\.(?:video|ai))(?:[/:]|$)/i;

/**
 * A whole citation parenthetical: `([View](url))`, `( [00:12](url) )`, or a
 * bare `(https://fathom.video/...)`. Matched before the generic link rule so
 * the wrapping parens go too — unwrapping first would leave `(View)` behind.
 */
const CITATION_PAREN = /\s*\(\s*(?:\[[^\]]*\]\s*)?\(?\s*(https?:\/\/[^\s)]+)\s*\)?\s*\)/gi;

/** A markdown link anywhere: `[label](url)`. */
const MD_LINK = /\[([^\]]*)\]\(\s*(<)?(\S*?)(?:>)?\s*(?:"[^"]*")?\s*\)/g;

/** A bare URL left over after the structured forms are handled. */
const BARE_URL = /https?:\/\/\S+/gi;

/** `<https://…>` autolink form. */
const ANGLE_URL = /<(https?:\/\/[^>]+)>/gi;

function isRecorderUrl(url: string): boolean {
  return RECORDER_HOST.test(url);
}

/**
 * Strip Fathom citation links out of a summary, leaving readable prose.
 *
 * Only RECORDER links are removed. A link the meeting itself referenced (a Jira
 * ticket, a doc) is content — its label is kept and, when the label carries no
 * information of its own, the URL is kept as plain text so nothing a human
 * wrote is silently destroyed.
 *
 * Returns null for input that is null/blank or that cleans down to nothing.
 */
export function cleanFathomSummary(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let text = raw.replace(/\r\n/g, "\n");

  // 1. Whole citation parentheticals — `([View](https://fathom.video/…))`.
  text = text.replace(CITATION_PAREN, (match, url: string) => (isRecorderUrl(url) ? "" : match));

  // 2. Autolinks — `<https://fathom.video/…>`.
  text = text.replace(ANGLE_URL, (match, url: string) => (isRecorderUrl(url) ? "" : url));

  // 3. Remaining markdown links. Recorder links collapse to nothing when their
  //    label is pure chrome ("View", "0:12", "Watch"), otherwise to the label.
  text = text.replace(MD_LINK, (match, label: string, _angle, url: string) => {
    const clean = (label ?? "").trim();
    if (!isRecorderUrl(url ?? "")) return clean || url || match;
    return isChromeLabel(clean) ? "" : clean;
  });

  // 4. Bare recorder URLs the earlier rules didn't wrap.
  text = text.replace(BARE_URL, (url) => (isRecorderUrl(url) ? "" : url));

  // 5. Tidy what removal left behind: empty parens/brackets, orphan separators,
  //    doubled spaces, space before punctuation, runs of blank lines.
  text = text
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([.,;:!?])/g, "$1")
        .replace(/[\s—–-]+$/, (tail) => (/\n/.test(tail) ? tail : ""))
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || null;
}

/** Link labels that carry no meaning once the URL is gone. */
function isChromeLabel(label: string): boolean {
  if (!label) return true;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(label)) return true;
  return /^(view|watch|listen|link|clip|source|recording|play|jump|timestamp)$/i.test(label);
}

/* ------------------------------ structuring ------------------------------- */

export type SummaryBlock =
  | { kind: "heading"; text: string; level: number }
  | { kind: "bullet"; text: string }
  | { kind: "para"; text: string };

/**
 * Split a cleaned summary into renderable blocks so the viewer can show real
 * headings and lists instead of one pre-wrapped paragraph. Deliberately a tiny
 * subset of markdown (ATX headings, `-`/`*`/`•`/`1.` bullets, bold-only lines
 * used as headings) — a full markdown parser is more surface than a meeting
 * summary needs, and unknown syntax must degrade to plain text, not to noise.
 */
export function parseSummaryBlocks(clean: string | null | undefined): SummaryBlock[] {
  if (!clean) return [];

  const blocks: SummaryBlock[] = [];
  for (const rawLine of clean.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const atx = /^(#{1,6})\s+(.*)$/.exec(line);
    if (atx) {
      const text = stripInlineMarks(atx[2]);
      if (text) blocks.push({ kind: "heading", text, level: Math.min(atx[1].length, 4) });
      continue;
    }

    const bullet = /^(?:[-*•·]|\d{1,2}[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      const text = stripInlineMarks(bullet[1]);
      if (text) blocks.push({ kind: "bullet", text });
      continue;
    }

    // A line that is entirely bold (`**Key Takeaways**`) is Fathom's other
    // heading form.
    const boldOnly = /^\*\*(.+?)\*\*:?$/.exec(line);
    if (boldOnly) {
      const text = stripInlineMarks(boldOnly[1]);
      if (text) blocks.push({ kind: "heading", text, level: 3 });
      continue;
    }

    const text = stripInlineMarks(line);
    if (text) blocks.push({ kind: "para", text });
  }
  return blocks;
}

/** Remove `**`/`__`/`*`/`` ` `` emphasis marks — we render plain, not styled. */
export function stripInlineMarks(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/**
 * The cleaned summary flattened back to plain lines — bullets normalised to
 * `- `, headings kept as their own line. Used by the .txt / .docx exports and
 * the Gemini prompt, which all want text rather than blocks.
 */
export function summaryToPlainText(raw: string | null | undefined): string | null {
  const blocks = parseSummaryBlocks(cleanFathomSummary(raw));
  if (blocks.length === 0) return null;
  return blocks
    .map((b) => (b.kind === "bullet" ? `- ${b.text}` : b.text))
    .join("\n");
}
