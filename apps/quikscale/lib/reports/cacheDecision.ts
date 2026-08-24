/**
 * The cache decision — should this report be served, or regenerated?
 *
 * THE ONE HARD RULE
 * -----------------
 * Opening a report NEVER calls a model. This module is pure: it inspects a
 * stored row against the current source state and returns a verdict. It has no
 * side effects and cannot trigger generation, which is what makes "zero LLM
 * calls on the read path" a structural property rather than a promise.
 *
 * A stale report is still SERVED — with `stale: true` and the reasons — and the
 * user is offered a Regenerate button. Auto-regenerating on read would:
 *   · re-bill silently on a page view, which is the exact token bomb the
 *     requirement forbids;
 *   · discard a facilitator's sign-off (`validatedAt`) without them asking;
 *   · turn a burst of viewers into a burst of concurrent generations.
 *
 * THE CACHE KEY IS A TRIPLE
 * -------------------------
 *   sourceFingerprint  did the underlying data change?
 *   promptVersion      did we change how we ask the model?
 *   schemaVersion      did we change the shape we store?
 *
 * All three match ⇒ FRESH. Any differ ⇒ STALE, with a specific reason so the
 * UI can say *why* rather than showing an unexplained warning.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §L, §H.
 */

/** Why a report is stale. Ordered by how much it matters to the reader. */
export type StaleReason =
  | "NO_FINGERPRINT"
  | "SOURCE_DATA_CHANGED"
  | "PROMPT_VERSION_CHANGED"
  | "SCHEMA_VERSION_CHANGED"
  | "COVERAGE_IMPROVED";

/** Human-readable text for each reason, for the stale banner. */
export const STALE_REASON_LABEL: Record<StaleReason, string> = {
  NO_FINGERPRINT:
    "This report was generated before change-tracking existed, so we cannot confirm it matches the current data.",
  SOURCE_DATA_CHANGED:
    "The underlying meeting data has changed since this report was generated.",
  PROMPT_VERSION_CHANGED:
    "The report has been improved since this version was generated.",
  SCHEMA_VERSION_CHANGED:
    "The report format has changed since this version was generated.",
  COVERAGE_IMPROVED:
    "More of the meeting has been processed since this report was generated.",
};

/** The stored report row, reduced to the fields the decision needs. */
export interface StoredReportState {
  sourceFingerprint: string | null;
  promptVersion: string | null;
  schemaVersion: number | null;
  /** Share of source content extracted when this report was built (0–100). */
  coveragePct: number | null;
  currentVersion: number | null;
  /** Set once a human has signed the report off. */
  validatedAt: Date | null;
}

/** What the pipeline would produce for this report right now. */
export interface CurrentSourceState {
  sourceFingerprint: string;
  promptVersion: string;
  schemaVersion: number;
  coveragePct: number | null;
}

export interface CacheVerdict {
  /** True when the stored report can be served as current. */
  fresh: boolean;
  stale: boolean;
  reasons: StaleReason[];
  /** Ready-to-render sentences, in the same order as `reasons`. */
  messages: string[];
  /**
   * True when regenerating would discard a human sign-off. The UI must warn
   * before regenerating, and the generator records the reason when it clears
   * `validatedAt`.
   */
  wouldClearSignOff: boolean;
}

const FRESH: CacheVerdict = Object.freeze({
  fresh: true,
  stale: false,
  reasons: [],
  messages: [],
  wouldClearSignOff: false,
});

/**
 * Decide whether `stored` is still current with respect to `current`.
 *
 * Coverage is treated asymmetrically and deliberately so:
 *   · coverage IMPROVED (a previously failed chunk was retried) ⇒ stale, because
 *     regenerating would make the report strictly better;
 *   · coverage DROPPED ⇒ **not** a staleness reason on its own. A lower reading
 *     means the current extraction run is degraded, and offering to regenerate
 *     a good report into a worse one is not a service to the user. The report
 *     keeps its own recorded coverage, and the extraction failure surfaces
 *     through the run status instead.
 */
export function decideCache(
  stored: StoredReportState | null,
  current: CurrentSourceState,
): CacheVerdict {
  if (!stored) {
    return {
      fresh: false,
      stale: false, // nothing to be stale; the caller returns 404 + canGenerate
      reasons: [],
      messages: [],
      wouldClearSignOff: false,
    };
  }

  const reasons: StaleReason[] = [];

  if (!stored.sourceFingerprint) {
    // Pre-migration rows cannot prove what they were built from. Treated as
    // stale rather than trusted — but still fully viewable, and still free.
    reasons.push("NO_FINGERPRINT");
  } else if (stored.sourceFingerprint !== current.sourceFingerprint) {
    reasons.push("SOURCE_DATA_CHANGED");
  }

  if ((stored.promptVersion ?? null) !== current.promptVersion) {
    reasons.push("PROMPT_VERSION_CHANGED");
  }

  if ((stored.schemaVersion ?? 1) !== current.schemaVersion) {
    reasons.push("SCHEMA_VERSION_CHANGED");
  }

  if (
    current.coveragePct !== null &&
    stored.coveragePct !== null &&
    current.coveragePct > stored.coveragePct + 0.01
  ) {
    reasons.push("COVERAGE_IMPROVED");
  }

  if (reasons.length === 0) return FRESH;

  return {
    fresh: false,
    stale: true,
    reasons,
    messages: reasons.map((r) => STALE_REASON_LABEL[r]),
    wouldClearSignOff: stored.validatedAt !== null,
  };
}

/**
 * Should the generator do work, given a cache verdict and what the user asked?
 *
 * Separated from `decideCache` because they answer different questions —
 * "is it current?" versus "do we spend money?" — and only this one is allowed
 * to say yes to spending. `force` is the explicit Regenerate button; nothing
 * else in the system may set it.
 */
export function shouldGenerate(
  verdict: CacheVerdict,
  opts: { exists: boolean; force: boolean },
): { generate: boolean; reason: string } {
  if (!opts.exists) return { generate: true, reason: "NO_REPORT" };
  if (opts.force) return { generate: true, reason: "USER_REQUESTED" };
  if (verdict.fresh) return { generate: false, reason: "CACHE_HIT" };
  // Stale but not forced: serve the stored report and show the banner.
  return { generate: false, reason: "STALE_NOT_FORCED" };
}

/**
 * Deterministic identity of the thing being generated — the `scopeKey` half of
 * `MeetingReportJob @@unique([orgId, reportKind, scopeKey])`.
 *
 * Two concurrent Generates must compute the SAME string or the unique
 * constraint cannot deduplicate them, so this takes already-normalised
 * components: an ISO date string, not a `Date` whose formatting could vary by
 * caller or timezone.
 */
export type ReportKind = "DH_WEEKLY" | "DH_DAILY" | "WM" | "MONTHLY";

export function scopeKeyFor(
  kind: ReportKind,
  parts: { clientId?: string; weekStart?: string; meetingId?: string; period?: string },
): string {
  switch (kind) {
    case "DH_WEEKLY":
      requireAll(kind, { clientId: parts.clientId, weekStart: parts.weekStart });
      return `DH_WEEKLY:${parts.clientId}:${parts.weekStart}`;
    case "DH_DAILY":
      requireAll(kind, { meetingId: parts.meetingId });
      return `DH_DAILY:${parts.meetingId}`;
    case "WM":
      requireAll(kind, { meetingId: parts.meetingId });
      return `WM:${parts.meetingId}`;
    case "MONTHLY":
      requireAll(kind, { clientId: parts.clientId, period: parts.period });
      return `MONTHLY:${parts.clientId}:${parts.period}`;
  }
}

function requireAll(kind: string, parts: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(parts)) {
    if (!value) {
      throw new Error(`scopeKeyFor(${kind}): "${name}" is required`);
    }
  }
}
