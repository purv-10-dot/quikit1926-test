import sanitizeHtml from "sanitize-html";

/**
 * Shared helpers for the AI-Runtime summary endpoints (`/api/issues/[id]/summary`,
 * `/api/sprints/[id]/summary`) — see the manifest/summary contract doc from
 * Suyash (AI Runtime), §3.
 *
 * Correction to that doc's premise: it describes `QtIssue.description` /
 * `QtDoc.content` as "serialised editor JSON." They are not — the editor
 * (`components/rich-text-editor.tsx`) calls `editor.getHTML()`, so these
 * columns store sanitized HTML (see `lib/sanitize.ts`), not a Tiptap JSON
 * tree. The instruction to strip markup before it reaches a model is
 * unaffected by that correction — only the stripping mechanism changes: HTML
 * tag stripping via `sanitize-html`, not a JSON-tree walk.
 */

/**
 * Strip an issue/doc HTML body down to a short plain-text excerpt for a
 * token-budgeted AI summary. Collapses whitespace from the removed markup,
 * decodes entities, and truncates to `maxLength` (default 300, per the AI
 * summary spec) on a word boundary with a trailing ellipsis.
 */
export function htmlToSummaryExcerpt(
  html: string | null | undefined,
  maxLength = 300,
): string | null {
  if (!html) return null;
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}
