import { describe, it, expect } from "vitest";
import { validateTemplate } from "@/lib/templates/validate";

/**
 * Automated template validation — passes only when the graph is a real, runnable
 * workflow (trigger + event, ≥1 action, every action implemented, valid edges).
 * This is what "Auto-test" runs across the gallery.
 */
const clientMasterGraph = [
  { id: "trigger", kind: "trigger", config: { app: "quikscale", event: "clientMaster.created" } },
  { id: "step_1", kind: "action", config: { actionId: "calendar.event.create", params: { kind: "daily" } } },
  { id: "step_2", kind: "action", config: { actionId: "calendar.event.create", params: { kind: "weekly" } } },
];
const clientMasterEdges = [
  { from: "trigger", to: "step_1" },
  { from: "step_1", to: "step_2" },
];

describe("validateTemplate", () => {
  it("passes a real Client Master → Teams template (implemented actions, valid graph)", () => {
    const r = validateTemplate(clientMasterGraph, clientMasterEdges);
    expect(r.passed).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it("passes the Fathom transcript template", () => {
    const r = validateTemplate(
      [
        { id: "trigger", kind: "trigger", config: { app: "fathom", event: "fathom.meeting.transcribed" } },
        { id: "step_1", kind: "action", config: { actionId: "quikscale.save_transcript" } },
      ],
      [{ from: "trigger", to: "step_1" }],
    );
    expect(r.passed).toBe(true);
  });

  it("FAILS a placeholder template with no graph (only gallery labels)", () => {
    const r = validateTemplate([], []);
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.label === "Has a trigger")?.ok).toBe(false);
  });

  it("FAILS when an action is a simulated stub (not implemented)", () => {
    const r = validateTemplate(
      [
        { id: "trigger", kind: "trigger", config: { app: "quikscale", event: "kpi.below_target" } },
        { id: "step_1", kind: "action", config: { actionId: "notify.slack.send" } },
      ],
      [{ from: "trigger", to: "step_1" }],
    );
    expect(r.passed).toBe(false);
    const impl = r.checks.find((c) => c.label === "All actions are implemented");
    expect(impl?.ok).toBe(false);
    expect(impl?.detail).toContain("notify.slack.send");
  });

  it("FAILS when an edge references a missing node", () => {
    const r = validateTemplate(clientMasterGraph, [{ from: "trigger", to: "ghost" }]);
    expect(r.checks.find((c) => c.label === "Graph edges are valid")?.ok).toBe(false);
  });
});
