/**
 * Stamping surviving facts with the workstream they belong to.
 *
 * Runs once per meeting, AFTER merging, for the same reason TEAM promotion does
 * (doc 17 §P5): the input should be one fact per real thing, not one per chunk
 * that happened to hear it.
 *
 * The matching itself is pure and lives in `topics.ts`. This module only fetches
 * and writes, so the interesting logic stays testable without a database.
 */

import { db } from "@/lib/db";

import { assignTopic, buildTopicVocabulary } from "./topics";

export interface TopicStampResult {
  /** The meeting's distinct workstreams, in label order. */
  vocabulary: string[];
  stamped: number;
  /** Facts that matched nothing. They reduce together, untopiced. */
  unmatched: number;
}

/**
 * Assign `topicKey` to every surviving stuck, gap and discussion.
 *
 * A meeting whose chunks reported no topics is a no-op: every fact stays null
 * and reduction falls back to grouping by type alone, which is the correct
 * behaviour for a twenty-minute daily huddle that has exactly one subject.
 */
export async function stampTopics(
  orgId: string,
  run: { id: string; transcriptId: string },
): Promise<TopicStampResult> {
  const chunks = await db.meetingChunk.findMany({
    where: { orgId, runId: run.id, status: "COMPLETED" },
    select: { topicsOpen: true },
  });

  const vocabulary = buildTopicVocabulary(chunks.map((c) => c.topicsOpen ?? []));
  if (vocabulary.length === 0) {
    return { vocabulary: [], stamped: 0, unmatched: 0 };
  }

  const where = { orgId, runId: run.id, deletedAt: null, mergedIntoId: null };

  const [stucks, gaps, discussions] = await Promise.all([
    db.meetingStuckFact.findMany({ where, select: { id: true, description: true } }),
    db.meetingGapFact.findMany({ where, select: { id: true, gap: true } }),
    db.meetingDiscussionFact.findMany({ where, select: { id: true, summary: true } }),
  ]);

  let stamped = 0;
  let unmatched = 0;

  const apply = async (
    id: string,
    text: string,
    update: (id: string, topicKey: string) => Promise<unknown>,
  ) => {
    const topic = assignTopic(text, vocabulary);
    if (!topic) {
      unmatched += 1;
      return;
    }
    await update(id, topic);
    stamped += 1;
  };

  for (const s of stucks) {
    await apply(s.id, s.description, (id, topicKey) =>
      db.meetingStuckFact.update({ where: { id }, data: { topicKey } }),
    );
  }
  for (const g of gaps) {
    await apply(g.id, g.gap, (id, topicKey) =>
      db.meetingGapFact.update({ where: { id }, data: { topicKey } }),
    );
  }
  for (const d of discussions) {
    await apply(d.id, d.summary, (id, topicKey) =>
      db.meetingDiscussionFact.update({ where: { id }, data: { topicKey } }),
    );
  }

  return { vocabulary: vocabulary.map((t) => t.label), stamped, unmatched };
}
