/**
 * Canonical internal issue-link types (QUIKTR-115). `QtIssueLink.type` is a
 * free string column (no DB enum), so new values need no migration.
 *
 * A link is stored ONCE as a directed edge `sourceIssueId --type--> targetIssueId`.
 * Jira surfaces each edge under TWO labels depending on which side you view it
 * from: the source issue shows the `outward` label ("blocks"), the target issue
 * shows the `inward` label ("is blocked by"). That's why one stored type yields
 * two dropdown rows — except symmetric types (RELATES_TO) whose two labels are
 * identical and collapse to one row.
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
  { type: "CLONES", outward: "clones", inward: "is cloned by" },
  { type: "DUPLICATES", outward: "duplicates", inward: "is duplicated by" },
  { type: "CAUSES", outward: "causes", inward: "is caused by" },
];

/** All type strings we accept on write. */
export const ISSUE_LINK_TYPE_VALUES = ISSUE_LINK_TYPES.map((t) => t.type);

/** Which side of the stored edge a directional dropdown option writes/reads. */
export type LinkDirection = "OUTWARD" | "INWARD";

/**
 * A single selectable relationship in the "Linked work items" dropdown. Each
 * asymmetric type contributes two options (outward + inward); symmetric types
 * (labels equal) contribute one. Ordered to match Jira's list.
 */
export interface LinkOption {
  /** Stable id, e.g. "BLOCKS:OUTWARD". */
  id: string;
  type: string;
  direction: LinkDirection;
  /** Human label for this direction, e.g. "is blocked by". */
  label: string;
}

/**
 * The full directional option list. When the user picks an INWARD option
 * ("is blocked by B"), the created edge is B --BLOCKS--> thisIssue, i.e. the
 * source/target are flipped at write time (see the links POST route).
 */
export const LINK_OPTIONS: LinkOption[] = ISSUE_LINK_TYPES.flatMap((t) => {
  const out: LinkOption = {
    id: `${t.type}:OUTWARD`,
    type: t.type,
    direction: "OUTWARD",
    label: t.outward,
  };
  if (t.inward === t.outward) return [out]; // symmetric — one row only
  const inw: LinkOption = {
    id: `${t.type}:INWARD`,
    type: t.type,
    direction: "INWARD",
    label: t.inward,
  };
  return [out, inw];
});

/** Label for a stored edge as seen from a given side. */
export function linkLabel(type: string, side: LinkDirection): string {
  const def = ISSUE_LINK_TYPES.find((t) => t.type === type);
  if (!def) return type.toLowerCase().replace(/_/g, " ");
  return side === "OUTWARD" ? def.outward : def.inward;
}
