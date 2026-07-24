/**
 * Parse QuikTrack issue keys (e.g. "QT-123", "CA-1") out of free text —
 * branch names, commit messages, PR titles/bodies. This is the linking
 * mechanism between GitHub activity and work items (same approach as Jira).
 *
 * A key is one or more uppercase letters, a hyphen, then digits. We upper-case
 * the input so `qt-123` in a branch name still matches. Keys are returned
 * de-duplicated, preserving first-seen order.
 *
 * Note: this extracts *candidate* keys by shape only. The caller must resolve
 * each against QtIssue (scoped by orgId + project) — a string that merely looks
 * like a key but matches no issue is ignored downstream.
 */

const KEY_RE = /\b([A-Z][A-Z0-9]*-\d+)\b/g;

export function parseIssueKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.toUpperCase().matchAll(KEY_RE)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
