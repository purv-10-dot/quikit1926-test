import type { EngineEvent, RunResult } from "./types";
import { matchWorkflows } from "./matcher";
import { runWorkflow } from "./runner";

export type { EngineEvent, RunResult } from "./types";

/**
 * Dispatch an event: find matching Live workflows and run each. This is the
 * single entry point the BullMQ worker (and the "Run now" path) call. It is
 * transport-agnostic — it neither knows nor cares how the event was delivered.
 *
 * Idempotency is per (orgId, runDedupeKey); a run's dedupe key combines the
 * event's dedupeKey with the workflow id so one event can fan out to several
 * workflows without colliding on WfRun's unique (orgId, dedupeKey).
 */
export async function dispatchEvent(event: EngineEvent): Promise<RunResult[]> {
  const workflows = await matchWorkflows(event);
  const results: RunResult[] = [];
  for (const wf of workflows) {
    const runDedupeKey = `${event.dedupeKey}:${wf.id}`;
    const result = await runWorkflow(wf, event, runDedupeKey);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Run a single workflow directly (the "Run now" testing path), bypassing the
 * matcher. Still idempotent per the provided dedupeKey.
 */
export async function runSingleWorkflow(
  workflow: { id: string; trigger?: unknown; graphNodes: unknown; graphEdges: unknown },
  event: EngineEvent,
): Promise<RunResult | null> {
  return runWorkflow(workflow, event, event.dedupeKey);
}
