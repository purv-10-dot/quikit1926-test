/**
 * Evidence verification — does the transcript actually say this?
 *
 * Every extracted fact carries a quote and the indices of the turns it came
 * from. This checks the quote genuinely appears in those turns. It is the
 * cheapest and most load-bearing accuracy control in the pipeline: a substring
 * match, no model, no cost, and it is what stops a fluent-sounding fabrication
 * from reaching a client report.
 *
 * This is also why `normalize.ts` never rewrites mid-sentence text. If cleaning
 * altered a turn after the model quoted it, every quote would fail here and the
 * pipeline would silently discard real findings.
 *
 * THREE VERDICTS, NOT TWO
 * -----------------------
 * A binary verified/unverified is too blunt. Models routinely reproduce a quote
 * with a different apostrophe, a collapsed double space, or "don't" for
 * "do not" — none of which is a fabrication. So:
 *
 *   EXACT      the quote is a literal substring of the cited turns
 *   NORMALISED matches after unicode/whitespace/punctuation normalisation
 *   UNVERIFIED not found in the cited turns
 *
 * EXACT and NORMALISED both pass. UNVERIFIED fails, and its fact is dropped.
 *
 * DROPPED, NOT FLAGGED
 * --------------------
 * Doc 17 D11: an unverified claim is removed, not rendered with a warning. A
 * report the facilitator has to fact-check is worth less than a shorter true
 * one. Every drop is counted so the rate is visible in `reports/metrics` — a
 * rising drop rate means the prompt needs work, not that the check is wrong.
 */

/** Quote-level verdict. */
export type EvidenceVerdict = "EXACT" | "NORMALISED" | "UNVERIFIED";

export interface VerifiableEvidence {
  quote: string;
  transcriptSegmentIds: number[];
}

export interface SegmentText {
  idx: number;
  text: string;
}

export interface EvidenceCheck {
  verdict: EvidenceVerdict;
  /** Segment indices cited that do not exist in this transcript. */
  unknownSegmentIds: number[];
  /** True when the quote matched a segment OTHER than the ones cited. */
  foundElsewhere: boolean;
  /** Index the quote was actually found in, when `foundElsewhere`. */
  foundAtIdx: number | null;
}

/**
 * Normalise for comparison only — never for storage.
 *
 * Folds the differences that are reproduction artefacts rather than
 * fabrication: smart quotes, dashes, ellipses, non-breaking spaces, case, and
 * runs of whitespace. Deliberately does NOT fold words: "shipped" and
 * "shipping" must not compare equal, because that difference can change what a
 * report claims.
 */
export function normaliseForCompare(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Verify one evidence entry against the transcript's segments.
 *
 * `foundElsewhere` is reported rather than accepted. A quote that exists in the
 * transcript but not where the model said it does is a real attribution error:
 * the words are genuine but the speaker and timestamp attached to them may not
 * be, and the whole evidence chain depends on that attribution. The caller
 * decides how strict to be.
 */
export function verifyEvidence(
  evidence: VerifiableEvidence,
  segments: SegmentText[],
): EvidenceCheck {
  const byIdx = new Map(segments.map((s) => [s.idx, s.text]));

  const unknownSegmentIds = evidence.transcriptSegmentIds.filter((i) => !byIdx.has(i));
  const citedTexts = evidence.transcriptSegmentIds
    .map((i) => byIdx.get(i))
    .filter((t): t is string => t !== undefined);

  // Joined with a space so a quote spanning two cited turns still matches.
  const citedRaw = citedTexts.join(" ");
  const quoteRaw = evidence.quote;

  if (citedRaw.includes(quoteRaw)) {
    return { verdict: "EXACT", unknownSegmentIds, foundElsewhere: false, foundAtIdx: null };
  }

  const citedNorm = normaliseForCompare(citedRaw);
  const quoteNorm = normaliseForCompare(quoteRaw);

  if (quoteNorm.length > 0 && citedNorm.includes(quoteNorm)) {
    return {
      verdict: "NORMALISED",
      unknownSegmentIds,
      foundElsewhere: false,
      foundAtIdx: null,
    };
  }

  // Not in the cited turns. Is it anywhere at all? Knowing the difference
  // between "invented" and "mis-attributed" is what makes the drop rate
  // actionable rather than just alarming.
  for (const s of segments) {
    if (normaliseForCompare(s.text).includes(quoteNorm) && quoteNorm.length > 0) {
      return {
        verdict: "UNVERIFIED",
        unknownSegmentIds,
        foundElsewhere: true,
        foundAtIdx: s.idx,
      };
    }
  }

  return { verdict: "UNVERIFIED", unknownSegmentIds, foundElsewhere: false, foundAtIdx: null };
}

export interface FactVerification {
  /** True when the fact may be persisted. */
  passed: boolean;
  /** Per-evidence verdicts, in input order. */
  checks: EvidenceCheck[];
  /** Evidence entries that survived, for storage. */
  keptEvidence: VerifiableEvidence[];
  reason: string | null;
}

export interface VerifyOptions {
  /**
   * Treat a quote found in a DIFFERENT segment as passing.
   *
   * Default false. The words being real is not enough — a fact attributed to
   * the wrong speaker or the wrong moment is wrong in the way that matters for
   * a per-member adherence report.
   */
  allowFoundElsewhere?: boolean;
  /**
   * Require every evidence entry to verify, rather than at least one.
   *
   * Default false: a fact with three quotes, two solid and one garbled, is
   * still a supported fact. The garbled quote is dropped, not the fact.
   */
  requireAll?: boolean;
}

/**
 * Verify all evidence for one fact.
 *
 * Passing requires at least one surviving quote (or all of them, with
 * `requireAll`). Failed entries are stripped from `keptEvidence` so nothing
 * unverifiable is ever stored — a stored quote that does not appear in the
 * transcript would be worse than no quote at all, because the evidence drawer
 * presents it as proof.
 */
export function verifyFactEvidence(
  evidence: VerifiableEvidence[],
  segments: SegmentText[],
  options: VerifyOptions = {},
): FactVerification {
  if (evidence.length === 0) {
    return {
      passed: false,
      checks: [],
      keptEvidence: [],
      reason: "no evidence supplied",
    };
  }

  const checks = evidence.map((e) => verifyEvidence(e, segments));

  const ok = (c: EvidenceCheck) =>
    c.verdict === "EXACT" ||
    c.verdict === "NORMALISED" ||
    (options.allowFoundElsewhere && c.foundElsewhere);

  const keptEvidence = evidence.filter((_, i) => ok(checks[i]));

  if (options.requireAll && keptEvidence.length !== evidence.length) {
    return {
      passed: false,
      checks,
      keptEvidence: [],
      reason: "not all evidence could be verified",
    };
  }

  if (keptEvidence.length === 0) {
    const misattributed = checks.some((c) => c.foundElsewhere);
    return {
      passed: false,
      checks,
      keptEvidence: [],
      reason: misattributed
        ? "quote exists but not in the cited turns (mis-attributed)"
        : "quote does not appear in the transcript",
    };
  }

  return { passed: true, checks, keptEvidence, reason: null };
}

/** Aggregate counters, surfaced as the evidence-drop rate in `reports/metrics`. */
export interface VerificationStats {
  factsChecked: number;
  factsDropped: number;
  quotesExact: number;
  quotesNormalised: number;
  quotesUnverified: number;
  quotesMisattributed: number;
  unknownSegmentRefs: number;
}

export function emptyStats(): VerificationStats {
  return {
    factsChecked: 0,
    factsDropped: 0,
    quotesExact: 0,
    quotesNormalised: 0,
    quotesUnverified: 0,
    quotesMisattributed: 0,
    unknownSegmentRefs: 0,
  };
}

export function accumulate(stats: VerificationStats, result: FactVerification): void {
  stats.factsChecked += 1;
  if (!result.passed) stats.factsDropped += 1;
  for (const c of result.checks) {
    if (c.verdict === "EXACT") stats.quotesExact += 1;
    else if (c.verdict === "NORMALISED") stats.quotesNormalised += 1;
    else stats.quotesUnverified += 1;
    if (c.foundElsewhere) stats.quotesMisattributed += 1;
    stats.unknownSegmentRefs += c.unknownSegmentIds.length;
  }
}
