import type { EngineEvent, RunResult } from "./types";
import { matchWorkflows, matchScheduledWorkflow } from "./matcher";
import { runWorkflow } from "./runner";
import { loadContext } from "./record";
import { evaluateRuleGroup, type RuleGroup } from "./conditions";

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
  // Load the triggering record ONCE — shared by the trigger filter of every
  // matched workflow and by each run's condition/token evaluation.
  const context = await loadContext(event);
  // Scheduler ticks are pre-targeted to a single workflow; everything else
  // fans out via app+event matching.
  const workflows =
    event.event === "schedule.tick"
      ? await matchScheduledWorkflow(event)
      : await matchWorkflows(event);
  const results: RunResult[] = [];
  for (const wf of workflows) {
    // Trigger data filter (doc §9 step 2): drop non-matching workflows early,
    // before spending a run. Absent filter ⇒ always matches.
    const trigger = (wf.trigger ?? {}) as { filter?: RuleGroup };
    if (!evaluateRuleGroup(trigger.filter, context.data)) continue;

    const runDedupeKey = `${event.dedupeKey}:${wf.id}`;
    const result = await runWorkflow(wf, event, runDedupeKey, context);
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
  const context = await loadContext(event);
  return runWorkflow(workflow, event, event.dedupeKey, context);
}
