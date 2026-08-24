/**
 * Fact consolidation — turning per-chunk facts into meeting-level facts.
 *
 * A 6-hour meeting fans out to ~23 chunks, each extracted independently. The
 * same deployment blocker discussed in chunks 4, 17 and 22 arrives as three
 * separate facts. Consolidation turns those into ONE recurring blocker carrying
 * THREE evidence references — which is what the requirement doc asks for, and
 * what makes recurrence counts meaningful rather than an artefact of where the
 * chunk boundaries happened to fall.
 *
 * THREE STAGES, CHEAPEST FIRST (doc 17 §D.7)
 * ------------------------------------------
 *   1. EXACT      identical normalised key                     — free
 *   2. NEAR       token-set Jaccard ≥ 0.6, or Jaro ≥ 0.90      — free
 *   3. ADJUDICATE ambiguous pairs only, bounded, via one LLM call
 *
 * Stages 1 and 2 handle the overwhelming majority. Stage 3 exists only for the
 * genuinely ambiguous middle band and is capped, so consolidation costs roughly
 * one extra call per meeting regardless of length.
 *
 * THE ASYMMETRY THAT GOVERNS EVERY THRESHOLD
 * ------------------------------------------
 * Two blockers wrongly SPLIT produce a slightly redundant report.
 * Two distinct blockers wrongly MERGED produce a FALSE one, and destroy an
 * evidence trail — the merged fact now claims a recurrence that never happened.
 *
 * So the rule is **never merge on doubt**: `UNSURE` from the adjudicator means
 * do not merge, thresholds are set conservatively, and a merge requires
 * compatible subjects, not merely similar wording. "Deployment issue" raised by
 * Rahul and "deployment issue" raised by Priya are two facts, not one.
 *
 * Every merge is audited (`MeetingFactMerge`) and merged facts are soft-deleted
 * rather than removed, so a bad merge is inspectable and reversible.
 */

// Plain Jaro, not Jaro-Winkler. Doc 15 section 16 records why: Winkler adds a
// prefix bonus that scores "Ajay Baheti" against "Ajay Bhatt" at 0.921, above
// any useful threshold. The same hazard applies to blocker descriptions that
// share an opening phrase, and over-merging is the failure mode to avoid.
import { jaro } from "@/lib/ai/participantMatch";

/**
 * Words carrying no discriminating power in a meeting context. Removing them
 * before comparison stops "the deployment issue" and "a deployment issue"
 * looking like different blockers.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "and", "or", "but", "if", "then", "than", "that", "this", "these", "those",
  "to", "of", "in", "on", "at", "for", "with", "from", "by", "about", "as",
  "it", "its", "we", "our", "us", "i", "me", "my", "you", "your", "they",
  "there", "here", "have", "has", "had", "do", "does", "did", "will", "would",
  "can", "could", "should", "may", "might", "must", "not", "no", "so", "up",
  "out", "into", "over", "under", "again", "still", "some", "any", "all",
]);

/**
 * Extremely light stemming — plural and gerund/past endings only.
 *
 * Deliberately not a real stemmer: aggressive stemming collapses words whose
 * difference changes meaning ("shipped" vs "shipping" is a real distinction in
 * a status update), and an over-eager stem here becomes an over-eager merge.
 */
function stem(word: string): string {
  if (word.length <= 4) return word;

  // PLURALS ONLY. An earlier version also stripped "ed" and "ing", which
  // collapsed "shipped" and "shipping" to the same token — a real distinction
  // in a status update, and precisely the kind of over-eager fold that becomes
  // an over-eager merge. Tense stays.

  // "issues" -> "issue", not "issu": a bare "es" strip is wrong whenever the
  // singular already ends in "e", which covers most of the words that matter
  // here (issue, release, update, escalate).
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * Canonical key for a description.
 *
 * Lowercase → strip punctuation → drop stopwords → stem → sort → join. Sorting
 * makes word order irrelevant, so "issue with deployment" and "deployment
 * issue" produce the same key. Exported because it is stored on the fact row
 * and drives cross-week recurrence, not just within-meeting merging.
 */
export function normalizeKey(text: string): string {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 0 && !STOPWORDS.has(w))
        .map(stem),
    ),
  )
    .sort()
    .join(" ");
}

/** Token-set Jaccard: |A ∩ B| / |A ∪ B|. */
export function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

export const MERGE_RULES = {
  EXACT_KEY: "EXACT_KEY",
  TOKEN_SIMILARITY: "TOKEN_SIMILARITY",
  JARO: "JARO",
  LLM_ADJUDICATED: "LLM_ADJUDICATED",
  OVERLAP_DUPLICATE: "OVERLAP_DUPLICATE",
} as const;
export type MergeRule = (typeof MERGE_RULES)[keyof typeof MERGE_RULES];

/**
 * Thresholds. Tuned so that a merge needs strong evidence and a split needs
 * none — see the asymmetry note at the top.
 */
export const THRESHOLDS = {
  /** At or above: merge deterministically. */
  jaccardMerge: 0.6,
  jaroMerge: 0.9,
  /** Between this and the merge threshold: hand to the adjudicator. */
  candidateFloor: 0.4,
} as const;

/** The minimum a fact must expose to be consolidated. */
export interface MergeableFact {
  id: string;
  normalizedKey: string;
  description: string;
  /**
   * Who or what the fact is ABOUT. Two facts merge only when their subjects are
   * compatible — equal, or one unknown. Similar wording is not enough: the same
   * blocker raised by two people is two facts, and merging them would erase a
   * real signal about how widely the problem is felt.
   */
  subject: string | null;
  chunkIdx: number | null;
  fromOverlap: boolean;
  confidence: number;
}

export interface MergeDecision {
  survivorId: string;
  mergedId: string;
  rule: MergeRule;
  similarity: number | null;
  decidedBy: "deterministic" | "llm";
  confidence: number | null;
}

export interface CandidatePair {
  a: MergeableFact;
  b: MergeableFact;
  similarity: number;
}

export interface ConsolidationResult<T extends MergeableFact> {
  /** Facts that survived, in input order. */
  survivors: T[];
  /** Merge decisions, for the audit table. */
  merges: MergeDecision[];
  /** Ambiguous pairs for stage 3. Empty when nothing needs adjudication. */
  candidates: CandidatePair[];
  /** survivorId → ids folded into it, for evidence union. */
  mergedInto: Map<string, string[]>;
}

/**
 * Are these two facts about the same subject?
 *
 * `null` means unknown, and unknown is compatible with anything — refusing to
 * merge a fact whose speaker could not be resolved would leave duplicates
 * behind purely because attribution failed.
 */
function subjectsCompatible(a: MergeableFact, b: MergeableFact): boolean {
  if (a.subject === null || b.subject === null) return true;
  return a.subject.toLowerCase() === b.subject.toLowerCase();
}

/**
 * Pick which of two facts survives.
 *
 * Preference order, and each has a reason:
 *   1. NOT from overlap — overlap is re-read context, so the owning chunk's
 *      instance is the canonical one and overlap never inflates counts.
 *   2. Higher confidence.
 *   3. Earlier chunk — the first mention is where the topic was introduced.
 *   4. Longer description — more detail survives a merge than less.
 */
function preferred<T extends MergeableFact>(a: T, b: T): [T, T] {
  if (a.fromOverlap !== b.fromOverlap) return a.fromOverlap ? [b, a] : [a, b];
  if (Math.abs(a.confidence - b.confidence) > 0.05) {
    return a.confidence >= b.confidence ? [a, b] : [b, a];
  }
  const ac = a.chunkIdx ?? Number.MAX_SAFE_INTEGER;
  const bc = b.chunkIdx ?? Number.MAX_SAFE_INTEGER;
  if (ac !== bc) return ac < bc ? [a, b] : [b, a];
  return a.description.length >= b.description.length ? [a, b] : [b, a];
}

/**
 * Run the two deterministic stages and collect candidates for the third.
 *
 * O(n²) over facts of one type. A 6-hour meeting yields a few hundred, so this
 * is milliseconds; if a type ever exceeds ~1,000, block by subject first.
 */
export function consolidateDeterministic<T extends MergeableFact>(
  facts: T[],
): ConsolidationResult<T> {
  const merges: MergeDecision[] = [];
  const candidates: CandidatePair[] = [];
  const mergedInto = new Map<string, string[]>();
  /** mergedId → survivorId, so a chain folds into one final survivor. */
  const absorbed = new Map<string, string>();

  const resolve = (id: string): string => {
    let cur = id;
    const seen = new Set<string>();
    while (absorbed.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = absorbed.get(cur) as string;
    }
    return cur;
  };

  const record = (
    survivor: T,
    merged: T,
    rule: MergeRule,
    similarity: number | null,
  ) => {
    const survivorId = resolve(survivor.id);
    if (survivorId === merged.id) return;
    absorbed.set(merged.id, survivorId);
    merges.push({
      survivorId,
      mergedId: merged.id,
      rule,
      similarity,
      decidedBy: "deterministic",
      confidence: null,
    });
    mergedInto.set(survivorId, [...(mergedInto.get(survivorId) ?? []), merged.id]);
  };

  for (let i = 0; i < facts.length; i++) {
    const a = facts[i];
    if (absorbed.has(a.id)) continue;

    for (let j = i + 1; j < facts.length; j++) {
      const b = facts[j];
      if (absorbed.has(b.id)) continue;
      if (!subjectsCompatible(a, b)) continue;

      const [keep, drop] = preferred(a, b);

      // Stage 1 — exact normalised key.
      if (a.normalizedKey && a.normalizedKey === b.normalizedKey) {
        // An overlap duplicate is recorded under its own rule so the audit can
        // distinguish "the same thing was said twice" from "two things were
        // judged the same".
        const rule =
          a.fromOverlap !== b.fromOverlap
            ? MERGE_RULES.OVERLAP_DUPLICATE
            : MERGE_RULES.EXACT_KEY;
        record(keep, drop, rule, 1);
        continue;
      }

      // Stage 2 — near match on tokens, then on raw string shape.
      const jac = jaccard(a.normalizedKey, b.normalizedKey);
      if (jac >= THRESHOLDS.jaccardMerge) {
        record(keep, drop, MERGE_RULES.TOKEN_SIMILARITY, jac);
        continue;
      }

      const jaroScore = jaro(a.normalizedKey, b.normalizedKey);
      if (jaroScore >= THRESHOLDS.jaroMerge) {
        record(keep, drop, MERGE_RULES.JARO, jaroScore);
        continue;
      }

      // The ambiguous band — too close to ignore, too far to merge blind.
      const best = Math.max(jac, jaroScore);
      if (best >= THRESHOLDS.candidateFloor) {
        candidates.push({ a, b, similarity: best });
      }
    }
  }

  const survivors = facts.filter((f) => !absorbed.has(f.id));
  return { survivors, merges, candidates, mergedInto };
}

/** One adjudicator verdict. `UNSURE` must never merge. */
export type AdjudicationVerdict = "SAME" | "DIFFERENT" | "UNSURE";

export interface Adjudication {
  aId: string;
  bId: string;
  verdict: AdjudicationVerdict;
  confidence: number;
}

/**
 * Apply stage-3 verdicts on top of a deterministic result.
 *
 * `UNSURE` is treated exactly as `DIFFERENT`: on doubt we keep two facts. A
 * redundant row is a cosmetic problem; a wrongly merged pair is a false report.
 */
export function applyAdjudications<T extends MergeableFact>(
  result: ConsolidationResult<T>,
  verdicts: Adjudication[],
): ConsolidationResult<T> {
  const byId = new Map(result.survivors.map((f) => [f.id, f]));
  const absorbed = new Set<string>();
  const merges = [...result.merges];
  const mergedInto = new Map(result.mergedInto);

  for (const v of verdicts) {
    if (v.verdict !== "SAME") continue;

    const a = byId.get(v.aId);
    const b = byId.get(v.bId);
    if (!a || !b) continue;
    if (absorbed.has(a.id) || absorbed.has(b.id)) continue;

    const [keep, drop] = preferred(a, b);
    absorbed.add(drop.id);
    merges.push({
      survivorId: keep.id,
      mergedId: drop.id,
      rule: MERGE_RULES.LLM_ADJUDICATED,
      similarity: null,
      decidedBy: "llm",
      confidence: v.confidence,
    });
    mergedInto.set(keep.id, [...(mergedInto.get(keep.id) ?? []), drop.id]);
  }

  return {
    survivors: result.survivors.filter((f) => !absorbed.has(f.id)),
    merges,
    candidates: [],
    mergedInto,
  };
}

/**
 * Union evidence from every merged fact into its survivor.
 *
 * Load-bearing for the requirement doc: the deployment blocker from chunks 4,
 * 17 and 22 must end up as one fact carrying THREE evidence references with
 * three timestamps. Losing the merged facts' evidence would turn a recurring
 * issue into a single mention and erase the recurrence entirely.
 *
 * Duplicate quotes are collapsed, since overlap can legitimately produce the
 * same quote twice.
 */
export function unionEvidence<E extends { quote: string }>(
  survivorEvidence: E[],
  mergedEvidence: E[][],
): E[] {
  const seen = new Set<string>();
  const out: E[] = [];
  for (const list of [survivorEvidence, ...mergedEvidence]) {
    for (const e of list) {
      const key = e.quote.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

/**
 * Occurrence count for a survivor: itself plus everything folded into it.
 *
 * This is the number the report shows as "# of Occurrences" for a recurring
 * stuck, so it must count facts, not evidence quotes — one fact can carry
 * several quotes from a single discussion.
 */
export function occurrenceCount(
  survivorId: string,
  mergedInto: Map<string, string[]>,
): number {
  return 1 + (mergedInto.get(survivorId)?.length ?? 0);
}
