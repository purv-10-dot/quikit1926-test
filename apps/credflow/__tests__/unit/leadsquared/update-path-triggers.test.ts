/**
 * Outbound-sync triggers on the update paths that bypass updateCrmLead.
 * Verifies each mutating path calls triggerOutboundSync after the commit
 * (per-lead for bulk), and that a rolled-back transaction enqueues nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import type { QcfLead, QcfWorkflowDefinition } from "@quikit/database";
import type { NextRequest } from "next/server";

vi.mock("@/lib/services/leadsquared/outbound-trigger", () => ({ triggerOutboundSync: vi.fn() }));
vi.mock("@/lib/services/automation/distribution", () => ({ pickNextUser: vi.fn() }));
// distribute_lead now records a loop-guard count + attribution row; mock both so
// the deep-mock DB doesn't throw and skip the owner write. ([P2.1]/[P2.2])
vi.mock("@/lib/services/automation/loop-guard", () => ({
  recordWriteAndCheck: vi.fn().mockResolvedValue({ count: 1, terminated: false, cap: 50 }),
}));
vi.mock("@/lib/services/automation/attribution", () => ({
  recordAttribution: vi.fn(),
  snapshotOf: vi.fn(() => ({})),
}));
vi.mock("@/lib/services/accounts", () => ({ deriveOwnerName: vi.fn() }));
vi.mock("@/lib/services/forms/form-rule-evaluator", () => ({ evaluateFormRules: vi.fn() }));
vi.mock("@/lib/services/leads/duplicate", () => ({ findDuplicateLeadRecord: vi.fn() }));

import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { pickNextUser } from "@/lib/services/automation/distribution";
import { deriveOwnerName } from "@/lib/services/accounts";
import { evaluateFormRules } from "@/lib/services/forms/form-rule-evaluator";
import { findDuplicateLeadRecord } from "@/lib/services/leads/duplicate";

const db = mockDb();
const trigger = vi.mocked(triggerOutboundSync);

function post(body: unknown): NextRequest {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  trigger.mockReset();
  setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@b.co", name: "A" });
});

describe("workflow-engine · distribute_lead (owner update)", () => {
  it("triggers outbound sync after the owner update commits", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue({
      id: "wf1",
      tenantId: "t1",
      status: "Active",
      graphNodes: [{ id: "n1", kind: "distribute_lead", config: { candidateUserIds: ["u2"] } }],
      graphEdges: [],
    } as unknown as QcfWorkflowDefinition);
    db.qcfLead.findFirst.mockResolvedValue({ id: "lead-1", tenantId: "t1", ownerId: null } as unknown as QcfLead);
    db.qcfLead.update.mockResolvedValue({} as never);
    vi.mocked(pickNextUser).mockResolvedValue("u2");

    const { runFrom } = await import("@/lib/services/automation/workflow-engine");
    await runFrom("t1", "wf1", "lead-1", "n1");

    expect(trigger).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "lead-1" });
  });
});

describe("convert route (transaction path)", () => {
  const lead = { id: "lead-1", tenantId: "t1", linkedContactId: null, status: "New", accountId: null };

  it("triggers outbound sync AFTER the transaction commits (successful convert)", async () => {
    db.qcfLead.findFirst.mockResolvedValue(lead as unknown as QcfLead);
    // Mock at the $transaction boundary — the committed result, callback bypassed.
    db.$transaction.mockResolvedValue({
      alreadyConverted: false,
      lead: { id: "lead-1" },
      contactId: "c1",
      opportunityId: null,
      accountId: null,
    } as never);

    const { POST } = await import("@/app/api/leads/[id]/convert/route");
    await POST(post({}), { params: Promise.resolve({ id: "lead-1" }) });

    expect(trigger).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "lead-1" });
  });

  it("does NOT enqueue when the transaction ROLLS BACK", async () => {
    db.qcfLead.findFirst.mockResolvedValue(lead as unknown as QcfLead);
    db.$transaction.mockRejectedValue(new Error("tx boom")); // rollback

    const { POST } = await import("@/app/api/leads/[id]/convert/route");
    const res = await POST(post({}), { params: Promise.resolve({ id: "lead-1" }) });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when the lead was already converted (claim count 0)", async () => {
    db.qcfLead.findFirst.mockResolvedValue(lead as unknown as QcfLead);
    db.$transaction.mockResolvedValue({ alreadyConverted: true } as never);

    const { POST } = await import("@/app/api/leads/[id]/convert/route");
    await POST(post({}), { params: Promise.resolve({ id: "lead-1" }) });

    expect(trigger).not.toHaveBeenCalled();
  });
});

describe("form-rule-apply · applyFormRules (set_stage → status/substatus)", () => {
  it("triggers outbound sync after the status update", async () => {
    db.qcfFormRule.findMany.mockResolvedValue([] as never); // rules unused (evaluator mocked)
    db.qcfLead.findUnique.mockResolvedValue({ stage: "New", status: "New", substatus: null } as never);
    db.qcfLead.update.mockResolvedValue({} as never);
    db.qcfAuditLog.create.mockResolvedValue({} as never);
    vi.mocked(evaluateFormRules).mockReturnValue({
      setStage: { status: "Qualified", subStatus: null },
    } as never);

    const { applyFormRules } = await import("@/lib/services/forms/form-rule-apply.service");
    await applyFormRules({ tenantId: "t1", leadId: "lead-9", activityId: null, formSetVersionId: "v1" });

    expect(trigger).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "lead-9" });
  });
});

describe("bulk-assign route (updateMany fan-out)", () => {
  it("triggers outbound sync ONCE PER reassigned lead", async () => {
    vi.mocked(deriveOwnerName).mockResolvedValue("New Owner");
    db.qcfLead.findMany.mockResolvedValue([
      { id: "l1", ownerId: null, ownerName: null },
      { id: "l2", ownerId: null, ownerName: null },
    ] as unknown as QcfLead[]);
    db.$transaction.mockResolvedValue([{ count: 2 }, {}] as never);
    db.qcfAuditLog.create.mockResolvedValue({} as never); // recordLeadChange

    const { POST } = await import("@/app/api/accounts/[id]/leads/bulk-assign/route");
    await POST(post({ leadIds: ["l1", "l2"], ownerId: "o1" }), {
      params: Promise.resolve({ id: "acc1" }),
    });

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "l1" });
    expect(trigger).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "l2" });
  });
});

describe("bulk import (upsertImportedLeadRow · dedupe update)", () => {
  it("triggers outbound sync after an externalId-match UPDATE", async () => {
    db.qcfLead.findUnique.mockResolvedValue({ id: "imp-1", dynamicFields: null } as never);
    db.qcfLead.update.mockResolvedValue({ id: "imp-1", tenantId: "t1" } as never);

    const { upsertImportedLeadRow } = await import("@/lib/services/import/lead-import-row");
    const res = await upsertImportedLeadRow(
      { tenantId: "t1", name: "Imp One", email: "imp1@x.co", externalId: "EXT-1", sourceSystem: "leadsquared" },
      { userId: "u1" },
    );

    expect(res.action).toBe("updated");
    expect(trigger).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "imp-1" });
  });

  it("triggers outbound sync after an email/phone dedupe-match UPDATE", async () => {
    vi.mocked(findDuplicateLeadRecord).mockResolvedValue({ id: "imp-2" } as never);
    db.qcfLead.findUnique.mockResolvedValue({ dynamicFields: null } as never); // dupe.id fetch
    db.qcfLead.update.mockResolvedValue({ id: "imp-2", tenantId: "t1" } as never);

    const { upsertImportedLeadRow } = await import("@/lib/services/import/lead-import-row");
    const res = await upsertImportedLeadRow(
      { tenantId: "t1", name: "Imp Two", email: "imp2@x.co" }, // no externalId → dedupe branch
      { userId: "u1" },
    );

    expect(res.action).toBe("updated");
    expect(trigger).toHaveBeenCalledWith({ tenantId: "t1", crmLeadId: "imp-2" });
  });
});
