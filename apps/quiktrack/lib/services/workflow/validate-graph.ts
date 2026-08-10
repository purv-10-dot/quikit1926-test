/**
 * Graph validation for the publish gate (Phase 2). Pure logic — no DB — so it
 * unit-tests directly and can also run client-side for live editor feedback.
 *
 * A workflow may be published only if:
 *   1. Exactly one INITIAL transition exists, and its target is the initial node.
 *   2. Every status node is reachable from the initial status (BFS; a GLOBAL
 *      transition's target is reachable from everywhere).
 *   3. Every transition target and every source status is a node in the workflow.
 *   4. No two transitions share a name (case-insensitive).
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §8.
 */
import type { GraphTransition } from "./types";

/** The transition fields graph validation needs (rules are irrelevant here). */
export type ValidatableTransition = Pick<
  GraphTransition,
  "id" | "name" | "type" | "toStatusId" | "fromStatusIds"
>;

/** A workflow being validated (draft or live), by status id. */
export interface ValidatableGraph {
  /** Status ids that are nodes in this workflow. */
  statusIds: string[];
  transitions: ValidatableTransition[];
}

export interface ValidationError {
  code:
    | "NO_INITIAL"
    | "MULTIPLE_INITIAL"
    | "INITIAL_TARGET_NOT_NODE"
    | "UNREACHABLE_STATUS"
    | "TARGET_NOT_NODE"
    | "SOURCE_NOT_NODE"
    | "DUPLICATE_TRANSITION_NAME";
  message: string;
  /** The offending status, when the error is about one (for editor highlight). */
  statusId?: string;
  /** The offending transition, when the error is about one. */
  transitionId?: string;
}

/**
 * Warnings don't block publish but are surfaced in the editor. A DONE-category
 * status with no resolution-setting post-function is the canonical case (Phase 3
 * fills the post-function catalogue; the check lives here so it's reusable).
 */
export interface ValidationWarning {
  code: "DONE_WITHOUT_RESOLUTION";
  message: string;
  statusId?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export function validateWorkflowGraph(
  graph: ValidatableGraph,
): ValidationResult {
  const errors: ValidationError[] = [];
  const nodeSet = new Set(graph.statusIds);

  // (1) exactly one INITIAL, its target must be a node.
  const initials = graph.transitions.filter((t) => t.type === "INITIAL");
  let initialStatusId: string | null = null;
  if (initials.length === 0) {
    errors.push({ code: "NO_INITIAL", message: "The workflow needs an initial transition (the status new issues start in)." });
  } else if (initials.length > 1) {
    errors.push({ code: "MULTIPLE_INITIAL", message: `Only one initial transition is allowed; found ${initials.length}.` });
  } else {
    initialStatusId = initials[0].toStatusId;
    if (!nodeSet.has(initialStatusId)) {
      errors.push({
        code: "INITIAL_TARGET_NOT_NODE",
        message: "The initial transition points to a status that is not in the workflow.",
        statusId: initialStatusId,
        transitionId: initials[0].id,
      });
      initialStatusId = null;
    }
  }

  // (3) every target and every source must be a node; (4) unique names.
  const seenNames = new Set<string>();
  for (const t of graph.transitions) {
    if (!nodeSet.has(t.toStatusId)) {
      errors.push({
        code: "TARGET_NOT_NODE",
        message: `Transition "${t.name}" targets a status that is not in the workflow.`,
        statusId: t.toStatusId,
        transitionId: t.id,
      });
    }
    for (const s of t.fromStatusIds) {
      if (!nodeSet.has(s)) {
        errors.push({
          code: "SOURCE_NOT_NODE",
          message: `Transition "${t.name}" starts from a status that is not in the workflow.`,
          statusId: s,
          transitionId: t.id,
        });
      }
    }
    const key = t.name.trim().toLowerCase();
    if (seenNames.has(key)) {
      errors.push({
        code: "DUPLICATE_TRANSITION_NAME",
        message: `More than one transition is named "${t.name}".`,
        transitionId: t.id,
      });
    }
    seenNames.add(key);
  }

  // (2) reachability from the initial status. A GLOBAL transition's target is
  // reachable from anywhere, so those targets seed the frontier unconditionally.
  if (initialStatusId) {
    const reachable = new Set<string>([initialStatusId]);
    for (const t of graph.transitions) {
      if (t.type === "GLOBAL" && nodeSet.has(t.toStatusId)) reachable.add(t.toStatusId);
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of graph.transitions) {
        if (t.type === "INITIAL") continue;
        const sources = t.type === "GLOBAL" ? graph.statusIds : t.fromStatusIds;
        const active = sources.some((s) => reachable.has(s));
        if (active && nodeSet.has(t.toStatusId) && !reachable.has(t.toStatusId)) {
          reachable.add(t.toStatusId);
          grew = true;
        }
      }
    }
    for (const id of graph.statusIds) {
      if (!reachable.has(id)) {
        errors.push({
          code: "UNREACHABLE_STATUS",
          message: "This status can't be reached from the initial status by any transition.",
          statusId: id,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings: [] };
}
