/**
 * Canonical internal issue-link types (QUIKTR-115). `QtIssueLink.type` is a
 * free string column (no DB enum), so new values need no migration. Only
 * "RELATES_TO" is wired up end-to-end today (app/api/issues/[id]/links/route.ts,
 * symmetric, single label) — BLOCKS/DUPLICATES are published here as the
 * source of truth for QUIKTR-116 (`link_issues`) to implement against.
 */
export interface IssueLinkTypeDto {
  type: string;
  /** Label shown on the source issue, e.g. "Issue A [outward] Issue B". */
  outward: string;
  /** Label shown on the target issue, e.g. "Issue B [inward] Issue A". */
  inward: string;
}

export const ISSUE_LINK_TYPES: IssueLinkTypeDto[] = [
  { type: "RELATES_TO", outward: "relates to", inward: "relates to" },
  { type: "BLOCKS", outward: "blocks", inward: "is blocked by" },
  { type: "DUPLICATES", outward: "duplicates", inward: "is duplicated by" },
];
