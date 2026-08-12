/**
 * [P3.B4 — SUPERSEDED] Publish-time loop detection.
 *
 * DESIGN CHANGE (2026-07-27): the publish-time loop check no longer blocks.
 * `detectPublishLoop` always returns `{ loops: false }`, so ANY automation
 * publishes — any conditions, nested conditions, any action. Loop safety is
 * owned entirely by the RUNTIME per-lead/day cap (`loop-guard.ts`, covered by
 * loop-guard.test.ts), which bounds actual repeated writes and can never be
 * false-positive against a valid rule. See loop-detect.ts header for the full
 * rationale (static termination proof is undecidable in general, so any
 * pattern-list blocker inevitably false-blocks some valid rule).
 *
 * These tests therefore assert the inverse of the old contract: every graph
 * shape that USED to block must now publish freely. The representative shapes
 * (self-target rewrite, no-op self-target, outside-set rewrite) are retained so
 * the decision is documented and locked in — if someone reintroduces a blocking
 * path, these fail and flag the regression.
 */
import { describe, expect, it } from "vitest";
import { detectPublishLoop } from "@/lib/services/automation/loop-detect";
import type { WorkflowGraph } from "@/types/workflow";

const T = "trigger_lead_updated";

function graph(nodes: WorkflowGraph["nodes"], edges: WorkflowGraph["edges"] = []): WorkflowGraph {
  return { nodes, edges };
}

describe("detectPublishLoop · never blocks (publish is unrestricted)", () => {
  it("does not block a created-trigger automation", () => {
    const g = graph([
      { id: "if1", kind: "if_else", config: { conditions: [{ field: "status", op: "is_defined" }] } },
      { id: "a1", kind: "update_lead_field", config: { field: "status", value: "X" } },
    ], [{ from: "if1", to: "a1", branch: "true" }]);
    expect(detectPublishLoop(g, "trigger_lead_created").loops).toBe(false);
  });

  it("does not block a self-target rewrite (runtime cap owns loop safety now)", () => {
    // Previously blocked: action rewrites a condition-keyed field to a new value.
    // Now allowed at publish; the runtime per-lead/day cap bounds any real loop.
    const g = graph([
      { id: "if1", kind: "if_else", config: { conditions: [{ field: "status", op: "is_defined" }] } },
      { id: "a1", kind: "update_lead_field", config: { field: "status", value: "Reprocessed" } },
    ], [{ from: "if1", to: "a1", branch: "true" }]);
    const finding = detectPublishLoop(g, T);
    expect(finding.loops).toBe(false);
    expect(finding.reason).toBeUndefined();
  });

  it("does not block the R2/R15 no-op self-target", () => {
    const g = graph([
      { id: "if1", kind: "if_else", config: { conditions: [{ field: "substatus", op: "in", value: ["Student Lead"] }] } },
      { id: "a1", kind: "update_lead_field", config: { field: "substatus", value: "Student Lead" } },
    ], [{ from: "if1", to: "a1", branch: "true" }]);
    expect(detectPublishLoop(g, T).loops).toBe(false);
  });

  it("does not block a negative-gated self-target (write == excluded value, e.g. stage != Disqualified → set Disqualified)", () => {
    // The rule that motivated the change: condition `stage neq Disqualified`,
    // action `stage = Disqualified`. Provably terminating; must publish.
    const g = graph([
      { id: "if1", kind: "if_else", config: { conditions: [{ field: "stage", op: "neq", value: "Disqualified" }] } },
      { id: "a1", kind: "update_lead_field", config: { field: "stage", value: "Disqualified" } },
    ], [{ from: "if1", to: "a1", branch: "true" }]);
    expect(detectPublishLoop(g, T).loops).toBe(false);
  });

  it("does not block a rule that writes a field no condition keys on", () => {
    const g = graph([
      { id: "if1", kind: "if_else", config: { conditions: [{ field: "stage", op: "eq", value: "New" }] } },
      { id: "a1", kind: "update_lead_field", config: { field: "status", value: "Contacted" } },
    ], [{ from: "if1", to: "a1", branch: "true" }]);
    expect(detectPublishLoop(g, T).loops).toBe(false);
  });

  it("does not block a rewrite to a value outside the condition's satisfying set", () => {
    // Previously blocked (C ∉ {A,B}); now allowed — runtime cap is the backstop.
    const g = graph([
      { id: "if1", kind: "if_else", config: { conditions: [{ field: "substatus", op: "in", value: ["A", "B"] }] } },
      { id: "a1", kind: "update_lead_field", config: { field: "substatus", value: "C" } },
    ], [{ from: "if1", to: "a1", branch: "true" }]);
    expect(detectPublishLoop(g, T).loops).toBe(false);
  });

  it("does not block an empty graph", () => {
    expect(detectPublishLoop(graph([]), T).loops).toBe(false);
  });
});

/**
 * Automation 1 (CrmExpress — "Move to Disqualified"), exactly as specified by the
 * team. This is the concrete rule that hit the old publish block; it is captured
 * here so the shape is a permanent regression guard — if a blocking path is ever
 * reintroduced, this test fails and names the exact business rule that breaks.
 *
 *   Trigger : activity on the lead  → trigger_lead_updated (an activity/disposition
 *             is a lead update; there is no separate activity trigger).
 *   If      : substatus is any of [7 dead-end reasons]
 *             AND stage is any of [the 15 non-terminal contact stages]
 *   Then    : stage = Disqualified
 *
 * Note the action writes `stage` while a condition keys on `stage` — the exact
 * pattern the retired static check blocked. It must now publish; the runtime
 * per-lead/day cap (loop-guard.ts) is the safety net for the (bounded) extra
 * re-evaluation.
 */
describe("Automation 1 · Move to Disqualified (team spec) · must publish", () => {
  const DEAD_END_SUBSTATUSES = [
    "Not using Tally/ Busy",
    "Invalid client details ( number/email)",
    "other ( self notes)",
    "Student Lead",
    "Language Barrier",
    "Looking to buy Tally/ Busy",
    "Unable to sync (Oracle user)",
  ];
  const SCOPED_STAGES = [
    "New Lead",
    "Not Connected",
    "Interested -Follow Up",
    "Demo Scheduled",
    "Demo Completed-demo data",
    "Demo Completed-demo Syncing",
    "Payment Done",
    "Customer",
    "Discussion Pending",
    "Negotiation",
    "Not Connected (New Lead)",
    "Not Connected (Discussion pending)",
    "Not Connected (Demo Scheduled)",
    "Interested Followup Counselling",
    "Future Lead",
  ];

  const automation1 = graph(
    [
      {
        id: "if1",
        kind: "if_else",
        config: {
          connector: "AND",
          conditions: [
            { field: "substatus", op: "in", value: DEAD_END_SUBSTATUSES },
            { field: "stage", op: "in", value: SCOPED_STAGES },
          ],
        },
      },
      { id: "a1", kind: "update_lead_field", config: { field: "stage", value: "Disqualified" } },
    ],
    [{ from: "if1", to: "a1", branch: "true" }],
  );

  it("publishes (loops:false) despite writing `stage` while a condition keys on `stage`", () => {
    const finding = detectPublishLoop(automation1, T);
    expect(finding.loops).toBe(false);
    expect(finding.reason).toBeUndefined();
  });

  it("also publishes with the loop-safe `stage does not equal Disqualified` scope variant", () => {
    // The refinement built in the UI: instead of the positive stage list, gate on
    // stage != Disqualified. Behaviourally broader (all non-disqualified stages),
    // and provably terminating. Must also publish.
    const variant = graph(
      [
        {
          id: "if1",
          kind: "if_else",
          config: {
            connector: "AND",
            conditions: [
              { field: "substatus", op: "in", value: DEAD_END_SUBSTATUSES },
              { field: "stage", op: "neq", value: "Disqualified" },
            ],
          },
        },
        { id: "a1", kind: "update_lead_field", config: { field: "stage", value: "Disqualified" } },
      ],
      [{ from: "if1", to: "a1", branch: "true" }],
    );
    expect(detectPublishLoop(variant, T).loops).toBe(false);
  });
});
