/**
 * LinkedIn posts — parsing of the `CrmProspect.posts` JSON blob.
 *
 * The Chrome extension scrapes a prospect's recent LinkedIn activity and POSTs
 * it to /api/leads/from-linkedin, which stores the array verbatim in
 * `CrmProspect.posts` (Json?). The shape is owned by the extension and is NOT
 * validated on write — so nothing downstream may assume it is well-formed.
 *
 * This module is the single place that turns that untrusted blob into a typed,
 * render-safe list. Every field is optional at the source, so each one is
 * individually coerced and bad entries are dropped rather than throwing: a
 * malformed scrape must never break the prospect UI.
 *
 * Server-only (no "use client") — callers pass the parsed result to client
 * components as plain serializable objects.
 */

/** One normalized post, safe to render. */
export interface LinkedInPost {
  /** Post body. Always non-empty — entries without text are dropped. */
  text: string;
  /** Activity kind as scraped ("shared", "reshared", "commented on", …). */
  type: string | null;
  /** ISO timestamp from the post's <time datetime>, when present. */
  date: string | null;
  /** Human label scraped alongside the date ("2w", "3mo"). */
  relativeTime: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  reactions: number;
  comments: number;
}

/** Aggregate counters shown in the section header. */
export interface LinkedInPostsSummary {
  count: number;
  totalReactions: number;
  totalComments: number;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Non-negative integer, or 0. The scraper parses engagement out of DOM text and
 * can emit NaN / negative / fractional values, none of which should reach the UI.
 */
function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Only http(s) images are kept. The scraper can pick up `data:` URIs from
 * placeholder elements, and rendering attacker-influenced `javascript:` /
 * `data:` URLs from a scraped page is not something we want to do.
 */
function toImageUrl(value: unknown): string | null {
  const raw = toTrimmedString(value);
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

/** Valid ISO date, else null — a bad string must not reach `new Date()` in the UI. */
function toIsoDate(value: unknown): string | null {
  const raw = toTrimmedString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Normalize the raw `posts` blob into a render-safe list.
 *
 * Returns `[]` for null / non-array / all-invalid input, so callers can treat
 * "no posts scraped", "column never written" and "garbage stored" identically.
 * Posts without text are dropped — an image-only card with no body has nothing
 * meaningful to show.
 *
 * Ordering: newest first for entries that carry a date; undated entries keep
 * their scraped order and sort after dated ones (the scraper emits page order,
 * which is already newest-first, so this preserves intent either way).
 */
export function parseLinkedInPosts(raw: unknown): LinkedInPost[] {
  if (!Array.isArray(raw)) return [];

  const posts: LinkedInPost[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const text = toTrimmedString(record.text);
    if (!text) continue;

    // `engagement` is a nested object in the scraped shape; tolerate it missing.
    const engagement =
      record.engagement && typeof record.engagement === "object"
        ? (record.engagement as Record<string, unknown>)
        : {};

    posts.push({
      text,
      type: toTrimmedString(record.type),
      date: toIsoDate(record.date),
      relativeTime: toTrimmedString(record.relativeTime),
      imageUrl: toImageUrl(record.imageUrl),
      imageAlt: toTrimmedString(record.imageAlt),
      reactions: toCount(engagement.reactions),
      comments: toCount(engagement.comments),
    });
  }

  // Stable: dated posts newest-first, undated ones retain scrape order at the end.
  return posts
    .map((post, index) => ({ post, index }))
    .sort((a, b) => {
      if (a.post.date && b.post.date) {
        const diff = Date.parse(b.post.date) - Date.parse(a.post.date);
        if (diff !== 0) return diff;
      } else if (a.post.date) {
        return -1;
      } else if (b.post.date) {
        return 1;
      }
      return a.index - b.index;
    })
    .map(({ post }) => post);
}

/** Totals for the section header. */
export function summarizeLinkedInPosts(posts: LinkedInPost[]): LinkedInPostsSummary {
  return posts.reduce<LinkedInPostsSummary>(
    (acc, post) => ({
      count: acc.count + 1,
      totalReactions: acc.totalReactions + post.reactions,
      totalComments: acc.totalComments + post.comments,
    }),
    { count: 0, totalReactions: 0, totalComments: 0 },
  );
}
