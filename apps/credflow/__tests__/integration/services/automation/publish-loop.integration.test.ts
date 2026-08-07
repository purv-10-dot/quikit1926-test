/**
 * [P3.B4 — SUPERSEDED] Publish lifecycle — real-DB proof against autotest.
 *
 * DESIGN CHANGE (2026-07-27): publish-time loop BLOCKING is removed. `publish()`
 * calls detectPublishLoop(), which now always returns { loops: false }, so any
 * Draft — including shapes that previously blocked — publishes to Active. Loop
 * safety is owned by the runtime per-lead/day cap (loop-guard.ts). See
 * loop-detect.ts header for the full rationale.
 *
 * These tests prove, end-to-end through the real DB + publish(), that:
 *   - a shape that USED to be rejected now publishes (no LifecycleError);
 *   - the no-op self-target still publishes;
 *   - the negative-gated self-target (the rule that motivated the change) publishes.
 *
 * Synthetic tenant + throwaway definitions. Run: npm run test:integration
 */
import { describe, it, expect, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import { publish } from "@/lib/services/automation/lifecycle";

const TENANT = `int_b4_${Date.now()}`;

async function draft(id: string, nodes: unknown[], edges: unknown[]) {
  return integrationPrisma.qcfWorkflowDefinition.create({
    data: {
      id: `${TENANT}_${id}`,
      tenantId: TENANT,
      name: id,
      status: "Draft",
      triggerType: "trigger_lead_updated",
      graphNodes: nodes as never,
      graphEdges: edges as never,
    },
  });
}

afterAll(async () => {
  await integrationPrisma.qcfWorkflowDefinition.deleteMany({ where: { tenantId: TENANT } });
  await integrationPrisma.$disconnect();
});

describe("publish lifecycle · real DB · loop block removed", () => {
  it("PUBLISHES a formerly-blocked self-target rewrite (now allowed; runtime cap is the backstop)", async () => {
    const def = await draft(
      "formerly_loop",
      [
        { id: "if1", kind: "if_else", config: { conditions: [{ field: "status", op: "is_defined" }] } },
        { id: "a1", kind: "update_lead_field", config: { field: "status", value: "Reprocessed" } },
      ],
      [{ from: "if1", to: "a1", branch: "true" }],
    );

    const result = await publish(TENANT, def.id);
    expect(result.status).toBe("Active");
    expect(result.lastPublishedOn).toBeInstanceOf(Date);
  });

  it("PUBLISHES a no-op self-target rule (R2/R15-class)", async () => {
    const def = await draft(
      "safe",
      [
        { id: "if1", kind: "if_else", config: { conditions: [{ field: "substatus", op: "in", value: ["Student Lead"] }] } },
        { id: "a1", kind: "update_lead_field", config: { field: "substatus", value: "Student Lead" } },
      ],
      [{ from: "if1", to: "a1", branch: "true" }],
    );

    const result = await publish(TENANT, def.id);
    expect(result.status).toBe("Active");
    expect(result.lastPublishedOn).toBeInstanceOf(Date);
  });

  it("PUBLISHES the negative-gated disqualify rule (stage != Disqualified → set Disqualified)", async () => {
    const def = await draft(
      "disqualify",
      [
        { id: "if1", kind: "if_else", config: { conditions: [{ field: "stage", op: "neq", value: "Disqualified" }] } },
        { id: "a1", kind: "update_lead_field", config: { field: "stage", value: "Disqualified" } },
      ],
      [{ from: "if1", to: "a1", branch: "true" }],
    );

    const result = await publish(TENANT, def.id);
    expect(result.status).toBe("Active");
    expect(result.lastPublishedOn).toBeInstanceOf(Date);
  });
});
