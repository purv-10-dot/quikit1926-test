/**
 * Pure graph logic for the workflow engine (Phase 1) — NO database access, so
 * it is fully unit-testable. Given a WorkflowGraph and the issue's current
 * status, decide which transitions are legal. Conditions/validators/post-
 * functions (Phase 3) layer on top of these primitives; classic Phase 1 only
 * evaluates edge availability (source match OR GLOBAL).
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §6.
 */
import type {
  AvailableTransition,
  GraphTransition,
  WorkflowGraph,
} from "./types";
import { TransitionNotAllowedError } from "./types";

/**
 * Is this transition usable when the issue currently sits in `fromStatusId`?
 * - GLOBAL: from any status.
 * - NORMAL: the current status must be one of its source statuses.
 * - INITIAL: never available as a move (only runs on issue creation).
 *
 * A self-loop (target === current) is only legal if the transition explicitly
 * lists the current status as a source (or is GLOBAL) — we never fabricate a
 * no-op transition.
 */
export function isTransitionAvailableFrom(
  transition: GraphTransition,
  fromStatusId: string | null,
): boolean {
  if (transition.type === "INITIAL") return false;
  if (transition.type === "GLOBAL") return true;
  // NORMAL
  if (fromStatusId == null) return false;
  return transition.fromStatusIds.includes(fromStatusId);
}

/**
 * All transitions legal from `fromStatusId`, de-duplicated by target status
 * (a status the board can drop onto). Ordering follows the graph's transition
 * order as supplied by the caller.
 */
export function listAvailableTransitions(
  graph: WorkflowGraph,
  fromStatusId: string | null,
): AvailableTransition[] {
  const out: AvailableTransition[] = [];
  const seenTargets = new Set<string>();
  for (const t of graph.transitions) {
    if (!isTransitionAvailableFrom(t, fromStatusId)) continue;
    if (seenTargets.has(t.toStatusId)) continue;
    seenTargets.add(t.toStatusId);
    out.push({ id: t.id, name: t.name, toStatusId: t.toStatusId });
  }
  return out;
}

/**
 * Find a transition that moves the issue from `fromStatusId` to `toStatusId`.
 * Returns the matching transition, or null if the move is not allowed.
 */
export function findTransition(
  graph: WorkflowGraph,
  fromStatusId: string | null,
  toStatusId: string,
): GraphTransition | null {
  for (const t of graph.transitions) {
    if (t.toStatusId !== toStatusId) continue;
    if (isTransitionAvailableFrom(t, fromStatusId)) return t;
  }
  return null;
}

/**
 * Assert a move is legal along the workflow. Throws TransitionNotAllowedError
 * when there is no transition from `fromStatusId` to `toStatusId`. A no-op move
 * (from === to) is always allowed and short-circuits (reorders / same-column
 * drops must never be blocked by the engine).
 */
export function assertTransitionAllowed(
  graph: WorkflowGraph,
  fromStatusId: string | null,
  toStatusId: string,
): void {
  if (fromStatusId === toStatusId) return;
  if (!findTransition(graph, fromStatusId, toStatusId)) {
    throw new TransitionNotAllowedError(fromStatusId, toStatusId);
  }
}
