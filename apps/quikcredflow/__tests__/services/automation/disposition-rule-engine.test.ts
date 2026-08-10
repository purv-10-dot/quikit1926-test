/**
 * FR-D3 / FR-D4 / FR-D5 — Disposition Automation Rule Engine
 *
 * Each test maps to a concrete requirement:
 *   FR-D3-1   Basic trigger match → set_lead_status fires
 *   FR-D3-2   No matching rule    → lead untouched
 *   FR-D3-3   First-match-wins    → only the first set_lead_status executes
 *   FR-D3-4   No cascade          → engine runs exactly once per call
 *   FR-D3-5   create_task         → task due at activityDatetime (AC-5)
 *   FR-D3-6   Normalization       → case-insensitive + trim match (Condition 1)
 *   FR-D3-7   Inactive rules      → skipped (isActive=false filtered at DB)
 *   FR-D5-1   Audit log           → QcfAuditLog entry with rule as actor
 *   FR-D3-M   create_task does not set status
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { runAfterActivityLogged } from "@/lib/services/automation/disposition-rule-engine";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";

vi.mock("@/lib/services/leadsquared/outbound-trigger", () => ({
  triggerOutboundSync: vi.fn(),
}));

const db = mockDb();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TENANT = "tenant_test_d3";
const ACTIVITY_ID = "act_001";
const ACTIVITY_DT = new Date("2026-06-18T15:00:00Z");

// Minimal QcfLead shape — only fields the engine selects (status, name, ownerId).
// Cast as any to avoid requiring all 40+ QcfLead columns in the mock fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseLead: any = {
  id: "lead_001",
  status: "New",
  name: "Test Lead",
  ownerId: "owner_001",
};

const baseCtx = {
  orgId: TENANT,
  leadId: baseLead.id,
  activityId: ACTIVITY_ID,
  activityDatetime: ACTIVITY_DT,
  ownerId: "owner_001",
};

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule_001",
    orgId: TENANT,
    name: "Test Rule",
    trigger: {
      type: "activity_logged",
      activity_type: "call",
      disposition: "not_interested",
    },
    action: { type: "set_lead_status", status: "Disqualified" },
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FR-D3 — Disposition Automation Rule Engine", () => {
  beforeEach(() => {
    db.qcfAutomationRule.findMany.mockReset();
    db.qcfLead.findUnique.mockReset();
    db.qcfLead.update.mockReset();
    db.qcfAuditLog.create.mockReset();
    db.qcfTask.create.mockReset();
    vi.mocked(triggerOutboundSync).mockReset();
  });

  // ── FR-D3-1: basic trigger match ───────────────────────────────────────────

  it("FR-D3-1: sets lead status when disposition matches trigger", async () => {
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([makeRule()]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfLead.update.mockResolvedValueOnce({ ...baseLead, status: "Disqualified" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfAuditLog.create.mockResolvedValueOnce({} as any);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "not_interested" });

    expect(db.qcfLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: baseLead.id },
        data: { status: "Disqualified" },
      }),
    );
    // Outbound sync fires after the status update (this bug-fix's coverage).
    expect(triggerOutboundSync).toHaveBeenCalledWith({ orgId: TENANT, crmLeadId: baseLead.id });
  });

  // Coverage: no outbound sync when the update never happens (no match).
  it("does NOT trigger outbound sync when no rule matches", async () => {
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([makeRule()]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "demo_scheduled" });
    expect(triggerOutboundSync).not.toHaveBeenCalled();
  });

  // ── FR-D3-2: no rule matches ───────────────────────────────────────────────

  it("FR-D3-2: leaves lead untouched when no rule matches the disposition", async () => {
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([makeRule()]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "demo_scheduled" });

    expect(db.qcfLead.update).not.toHaveBeenCalled();
    expect(db.qcfAuditLog.create).not.toHaveBeenCalled();
  });

  // ── FR-D3-3: first-match-wins-and-stop for set_lead_status ────────────────

  it("FR-D3-3: only the first matching set_lead_status fires (sortOrder 1 wins over 2)", async () => {
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([
      makeRule({ id: "rule_1", sortOrder: 1, action: { type: "set_lead_status", status: "Contacted" } }),
      makeRule({ id: "rule_2", sortOrder: 2, action: { type: "set_lead_status", status: "Qualified" } }),
    ]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfLead.update.mockResolvedValueOnce({ ...baseLead, status: "Contacted" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfAuditLog.create.mockResolvedValueOnce({} as any);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "not_interested" });

    expect(db.qcfLead.update).toHaveBeenCalledTimes(1);
    expect(db.qcfLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "Contacted" } }),
    );
  });

  // ── FR-D3-4: no cascade — engine runs exactly once per invocation ──────────

  it("FR-D3-4: engine queries rules exactly once — rule-made change does not re-trigger", async () => {
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([makeRule()]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfLead.update.mockResolvedValueOnce({ ...baseLead, status: "Disqualified" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfAuditLog.create.mockResolvedValueOnce({} as any);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "not_interested" });

    // findMany called once = engine ran once = no cascade re-entry
    expect(db.qcfAutomationRule.findMany).toHaveBeenCalledTimes(1);
    // One status write, not two
    expect(db.qcfLead.update).toHaveBeenCalledTimes(1);
  });

  // ── FR-D3-5 / AC-5: create_task due at activityDatetime ───────────────────

  it("FR-D3-5: creates task due at activityDatetime with expanded title (AC-5)", async () => {
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([
      makeRule({
        trigger: { type: "activity_logged", activity_type: "call", disposition: "callback_requested" },
        action: { type: "create_task", due: "activity_datetime", title: "Callback: {lead.name}" },
      }),
    ]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfTask.create.mockResolvedValueOnce({} as any);

    await runAfterActivityLogged({
      ...baseCtx,
      dispositionCode: "callback_requested",
      activityDatetime: ACTIVITY_DT,
    });

    expect(db.qcfTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dueDate: ACTIVITY_DT,
          subject: "Callback: Test Lead",
          leadId: baseLead.id,
          orgId: TENANT,
        }),
      }),
    );
    // create_task must not touch lead.status
    expect(db.qcfLead.update).not.toHaveBeenCalled();
  });

  // ── FR-D3-6: Condition 1 — normalization ──────────────────────────────────

  it("FR-D3-6: matches disposition code case-insensitively and trim-normalized", async () => {
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([
      makeRule({ trigger: { type: "activity_logged", activity_type: "call", disposition: "  NOT_INTERESTED  " } }),
    ]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfLead.update.mockResolvedValueOnce({ ...baseLead, status: "Disqualified" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfAuditLog.create.mockResolvedValueOnce({} as any);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "not_interested" });

    expect(db.qcfLead.update).toHaveBeenCalled();
  });

  // ── FR-D3-7: inactive rules are filtered at DB level ──────────────────────

  it("FR-D3-7: inactive rules are not evaluated (DB filters isActive=false)", async () => {
    // Simulates what the DB returns when all rules are inactive: empty array
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([]);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "not_interested" });

    expect(db.qcfLead.findUnique).not.toHaveBeenCalled();
    expect(db.qcfLead.update).not.toHaveBeenCalled();
  });

  // ── FR-D5-1: audit log with rule as actor ─────────────────────────────────

  it("FR-D5-1: writes CrmAuditLog with ruleId in metadata for every rule-made status change", async () => {
    const rule = makeRule({ id: "rule_audit_001" });
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([rule]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfLead.update.mockResolvedValueOnce({ ...baseLead, status: "Disqualified" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfAuditLog.create.mockResolvedValueOnce({} as any);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "not_interested" });

    expect(db.qcfAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: TENANT,
          userId: null,
          module: "leads",
          action: "status_changed",
          resourceId: baseLead.id,
          before: { status: "New" },
          after: { status: "Disqualified" },
          metadata: expect.objectContaining({
            ruleId: "rule_audit_001",
            actor: "rule:rule_audit_001",
            activityId: ACTIVITY_ID,
          }),
        }),
      }),
    );
  });

  // ── FR-D3-M: mixed actions in one rule ────────────────────────────────────

  it("FR-D3-M: rule with both set_lead_status and create_task fires both actions", async () => {
    // Two separate rules, one per action type, both matching same disposition
    db.qcfAutomationRule.findMany.mockResolvedValueOnce([
      makeRule({ id: "r1", sortOrder: 1, action: { type: "set_lead_status", status: "Disqualified" } }),
      makeRule({
        id: "r2",
        sortOrder: 2,
        action: { type: "create_task", due: "activity_datetime", title: "Check back" },
      }),
    ]);
    db.qcfLead.findUnique.mockResolvedValueOnce(baseLead);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfLead.update.mockResolvedValueOnce({ ...baseLead, status: "Disqualified" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfAuditLog.create.mockResolvedValueOnce({} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.qcfTask.create.mockResolvedValueOnce({} as any);

    await runAfterActivityLogged({ ...baseCtx, dispositionCode: "not_interested" });

    // Status updated once (first-match-wins)
    expect(db.qcfLead.update).toHaveBeenCalledTimes(1);
    // Task created once (not gated by first-match-wins)
    expect(db.qcfTask.create).toHaveBeenCalledTimes(1);
  });
});
