/**
 * [P3.B4 — SUPERSEDED] Publish-time loop detection.
 *
 * DESIGN DECISION (Rishabh, 2026-07-27): the publish-time loop check no longer
 * BLOCKS anything. It always reports `{ loops: false }`. Any automation — with
 * any conditions, nested conditions, and any action — publishes freely.
 *
 * WHY THIS IS SAFE (and why it is the correct, permanent fix rather than a
 * workaround):
 *
 *   Loop safety was NEVER owned by this static publish-time check. The ACTUAL
 *   backstop is the RUNTIME per-lead/day cap in `loop-guard.ts` (P2.1): it
 *   counts every automated lead-mutating write per lead per UTC day, and once
 *   the cap (default 50) is exceeded it marks the lead Terminated and the engine
 *   stops writing for that lead. That cap is shared across BOTH the workflow
 *   engine and the legacy disposition engine, so even a cross-engine ping-pong
 *   is bounded. A genuinely self-looping rule therefore cannot churn a lead
 *   indefinitely — it fires a bounded number of times and stops. No infinite
 *   loop, no runaway, no data corruption.
 *
 *   The old static check tried to PROVE, at publish time, that a rule could not
 *   loop — by enumerating "known-safe" shapes (in/eq no-op, then neq gate, …).
 *   That approach is fundamentally whack-a-mole: proving termination for an
 *   arbitrary condition/action graph is undecidable in general, so ANY finite
 *   list of recognized-safe patterns will inevitably FALSE-BLOCK some valid,
 *   provably-terminating rule the list doesn't cover (as happened with the
 *   "disqualify, gated by stage != Disqualified" rule). Every new rule shape the
 *   client needs would risk re-triggering the block. Removing the block removes
 *   that entire class of recurring false-positives permanently — which is the
 *   requirement: no valid rule is ever blocked at publish again.
 *
 *   Net safety posture: publish is unrestricted (correctness/authoring concern,
 *   handled by the user + the runtime cap), and the runtime cap is the single,
 *   sufficient loop-safety mechanism (the place safety belongs — it observes
 *   ACTUAL behavior rather than guessing statically). The two mechanisms are not
 *   redundant; the static one was always the weaker, conservative, false-prone
 *   one, and it is now retired.
 *
 * The function and its return type are retained (not deleted) so existing
 * callers — `lifecycle.publish()` and any tests — keep compiling and simply see
 * "no loop" every time. If a future need arises for a NON-BLOCKING advisory
 * (e.g. surface a soft "this may loop" hint in the builder without preventing
 * publish), compute it here and thread it as a warning — never as a hard block.
 */
import type { WorkflowGraph } from "@/types/workflow";

export interface LoopFinding {
  loops: boolean;
  /** Retained for API compatibility. Never set now (publish is never blocked). */
  reason?: string;
}

/**
 * Publish-time loop analysis. By decision this NEVER blocks: it always returns
 * `{ loops: false }`. Runtime safety is owned entirely by the per-lead/day cap
 * in `loop-guard.ts` (see file header for the full rationale). Parameters are
 * kept for signature stability with existing callers.
 */
export function detectPublishLoop(
  _graph: WorkflowGraph,
  _triggerType: string | null | undefined,
): LoopFinding {
  return { loops: false };
}
