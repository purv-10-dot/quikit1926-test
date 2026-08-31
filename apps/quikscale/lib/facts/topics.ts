/**
 * Assigning facts to workstreams, so reduction has coherent groups.
 *
 * WHY A TOPIC AT ALL
 * ------------------
 * A six-hour weekly meeting produces hundreds of facts across several
 * workstreams. Those facts have to be REDUCED before the analysis call (doc 17
 * §R1), and a reduction is only honest inside a coherent group: reducing a
 * hiring gap against a deployment gap would merge two unrelated problems into
 * one sentence and call it a summary.
 *
 * THE SIGNAL WAS ALREADY THERE
 * ----------------------------
 * The chunk extractor returns `topicsOpen` on every chunk — what was under
 * discussion in that window. Nothing persisted it. This module turns that list
 * into a per-fact `topicKey`.
 *
 * NULL IS A REAL ANSWER
 * ---------------------
 * A fact that matches no topic confidently stays `null` and reduces inside the
 * untopiced group. Guessing would be worse than not knowing: a wrong topic
 * silently reduces two unrelated facts against each other, which is the exact
 * failure the topic dimension exists to prevent. The threshold is therefore set
 * high, and a tie between two topics resolves to null rather than to the first.
 */

import { jaro } from "@/lib/ai/participantMatch";

import { normalizeKey, jaccard } from "./consolidate";

/**
 * Minimum similarity for a fact to join a topic.
 *
 * Deliberately above the merge thresholds in `consolidate.ts`. Merging two
 * facts is a claim they are the same thing; assigning a topic is a weaker
 * claim, but its blast radius is larger — a mis-topiced fact can be reduced
 * against everything else in that group. So the bar is higher, not lower.
 */
export const TOPIC_MATCH_THRESHOLD = 0.5;

/** A topic label as it will be stored, and the normalised form used to match it. */
export interface TopicCandidate {
  /** The label as some chunk actually reported it. */
  label: string;
  normalized: string;
}

/**
 * Which of two spellings of the same workstream should the report use?
 *
 * The one people said MOST, and on a tie the shorter one. Frequency is a real
 * signal about what the team calls this thing; length is not — an earlier rule
 * of "keep the longest" preferred "the Atlas rollout project" over "Project
 * Atlas rollout", rewarding filler words rather than clarity.
 */
function preferredLabel(
  a: { label: string; count: number },
  b: { label: string; count: number },
): string {
  if (a.count !== b.count) return a.count > b.count ? a.label : b.label;
  return a.label.length <= b.label.length ? a.label : b.label;
}

/**
 * Build the meeting's topic vocabulary from every chunk's list.
 *
 * Near-identical labels from different chunks collapse to one entry — "Project
 * Atlas rollout" and "the Atlas rollout" are one workstream, and two entries
 * would split its facts into two groups that then reduce separately.
 */
export function buildTopicVocabulary(chunkTopics: string[][]): TopicCandidate[] {
  const byKey = new Map<string, TopicCandidate & { count: number }>();

  for (const label of chunkTopics.flat()) {
    const trimmed = label.trim();
    // "AI", "Q3" match half the meeting and would group facts that have nothing
    // to do with each other.
    if (trimmed.length < 3) continue;

    const normalized = normalizeKey(trimmed);
    if (!normalized) continue;

    const existing = byKey.get(normalized);
    if (!existing) {
      byKey.set(normalized, { label: trimmed, normalized, count: 1 });
      continue;
    }
    existing.label = preferredLabel(existing, { label: trimmed, count: 1 });
    existing.count += 1;
  }

  // Second pass: fold labels that are near-duplicates of one another, so two
  // chunks phrasing the same workstream differently do not produce two groups.
  const folded: Array<TopicCandidate & { count: number }> = [];
  for (const candidate of byKey.values()) {
    const near = folded.find(
      (f) =>
        jaccard(f.normalized, candidate.normalized) >= 0.6 ||
        jaro(f.normalized, candidate.normalized) >= 0.9,
    );
    if (near) {
      near.label = preferredLabel(near, candidate);
      near.count += candidate.count;
      continue;
    }
    folded.push({ ...candidate });
  }

  return folded
    .map(({ label, normalized }) => ({ label, normalized }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Which topic does this fact belong to?
 *
 * Returns the stored label, or null when nothing matched clearly. A tie between
 * two topics returns null: two plausible homes means we do not know which, and
 * a coin flip would be indistinguishable from knowledge downstream.
 */
export function assignTopic(
  factText: string,
  vocabulary: TopicCandidate[],
): string | null {
  if (vocabulary.length === 0) return null;

  const key = normalizeKey(factText);
  if (!key) return null;

  let best: { label: string; score: number } | null = null;
  let runnerUp = 0;

  for (const topic of vocabulary) {
    // Jaccard over token sets, because a topic label is a phrase and a fact is a
    // sentence: overlap of the words that matter beats character similarity.
    const score = Math.max(
      jaccard(key, topic.normalized),
      // Jaro rescues the short-label case, where token overlap is thin but the
      // fact plainly names the workstream.
      topic.normalized.length <= 20 && key.includes(topic.normalized) ? 1 : 0,
    );

    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { label: topic.label, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  if (!best || best.score < TOPIC_MATCH_THRESHOLD) return null;
  // Two topics fitting equally well means we do not know which. Say so.
  if (best.score - runnerUp < 0.05) return null;

  return best.label;
}
