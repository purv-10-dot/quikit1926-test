import type { Mention, MentionRefInput } from "@/lib/shared";

export type Segment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; userId: string };

/**
 * Split message content into text + mention segments using the stored mention
 * offsets. Invalid offsets (out of bounds, not starting with `@`) are ignored,
 * so a broken mention degrades to plain text rather than corrupting the render.
 */
export function segmentContent(content: string, mentions: Mention[] = []): Segment[] {
  const valid = [...mentions]
    .filter(
      (m) =>
        m.offsetStart >= 0 &&
        m.offsetEnd <= content.length &&
        m.offsetEnd > m.offsetStart &&
        content.slice(m.offsetStart, m.offsetEnd).startsWith("@"),
    )
    .sort((a, b) => a.offsetStart - b.offsetStart);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of valid) {
    if (m.offsetStart < cursor) continue; // overlapping → skip
    if (m.offsetStart > cursor) {
      segments.push({ type: "text", value: content.slice(cursor, m.offsetStart) });
    }
    segments.push({
      type: "mention",
      value: content.slice(m.offsetStart, m.offsetEnd),
      userId: m.userId,
    });
    cursor = m.offsetEnd;
  }
  if (cursor < content.length) {
    segments.push({ type: "text", value: content.slice(cursor) });
  }
  return segments;
}

export interface MentionMember {
  id: string;
  displayName: string;
}

/**
 * The members a user may @mention: everyone in the channel EXCEPT themselves
 * (QC_015 — you cannot mention yourself). Applied at the source so both the
 * autocomplete suggestions and `computeMentions` exclude self. `@everyone` is a
 * literal (not a member) and is unaffected.
 */
export function mentionableMembers<T extends { id: string }>(
  members: T[],
  currentUserId: string | undefined,
): T[] {
  return currentUserId ? members.filter((m) => m.id !== currentUserId) : members;
}

/** Active `@query` token under the caret, if any (drives the autocomplete pop). */
export function findMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i]!;
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1]!)) {
        return { start: i, query: text.slice(i + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

/**
 * Compute mention offsets from the final composed text. Scans for `@everyone`
 * and `@<member displayName>` (longest name wins on ties), only when preceded
 * by whitespace/start and followed by a word boundary — same rules the server's
 * validateMentions enforces. Returns the offset refs the S02 `send` expects.
 */
export function computeMentions(text: string, members: MentionMember[]): MentionRefInput[] {
  const sorted = members
    .map((m) => ({ id: m.id, name: m.displayName.trim() }))
    .filter((m) => m.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const out: MentionRefInput[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    if (at > 0 && !/\s/.test(text[at - 1]!)) {
      i = at + 1;
      continue;
    }
    // @everyone literal
    if (text.slice(at, at + 9).toLowerCase() === "@everyone") {
      const next = text[at + 9];
      if (!next || !/[A-Za-z0-9_]/.test(next)) {
        if (!seen.has("everyone")) {
          seen.add("everyone");
          out.push({ userId: "everyone", offsetStart: at, offsetEnd: at + 9 });
        }
        i = at + 9;
        continue;
      }
    }
    let matched = false;
    for (const m of sorted) {
      const candidate = "@" + m.name;
      if (text.slice(at, at + candidate.length) !== candidate) continue;
      const next = text[at + candidate.length];
      if (next && /[A-Za-z0-9_]/.test(next)) continue;
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push({ userId: m.id, offsetStart: at, offsetEnd: at + candidate.length });
      }
      i = at + candidate.length;
      matched = true;
      break;
    }
    if (!matched) i = at + 1;
  }
  return out.sort((a, b) => a.offsetStart - b.offsetStart);
}
