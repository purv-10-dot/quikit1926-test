import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mockDb, setSession } from "../helpers/mockDb";

const db = mockDb();

const createDefaultTaskForLead = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getPipelineConfig = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ stages: ["New"], statuses: ["Open"], dependentRules: [] }),
);
const allowedStagesForSource = vi.hoisted(() => vi.fn().mockReturnValue([]));
const allowedStatusesForStage = vi.hoisted(() => vi.fn().mockReturnValue([]));
const validateDynamicFields = vi.hoisted(() =>
  vi.fn().mockReturnValue({ values: {}, errors: {} }),
);
const listLeadFields = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const findDuplicateLead = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("@/lib/services/workspace/pipeline-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/workspace/pipeline-config")>();
  // Keep the real validateLeadPipelineCascade (pure) — only the DB-backed
  // getPipelineConfig and the dependent-rule lookups are stubbed.
  return {
    ...actual,
    getPipelineConfig,
    allowedStagesForSource,
    allowedStatusesForStage,
  };
});
vi.mock("@/lib/services/fields/repo", () => ({
  listLeadFields,
}));
vi.mock("@/lib/services/fields/validate", () => ({
  validateDynamicFields,
}));
vi.mock("@/lib/services/leads/duplicate", () => ({
  findDuplicateLead,
}));
vi.mock("@/lib/services/leads/change-log", () => ({
  recordLeadChange: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/leads/realtime", () => ({
  publishLeadEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/automation/triggers", () => ({
  onLeadCreated: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/leads/auto-task", () => ({
  createDefaultTaskForLead,
}));
vi.mock("@/lib/services/leads/log-lead-system-activities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/leads/log-lead-system-activities")>();
  return {
    ...actual,
    logLeadSystemActivitiesOnCreate: vi.fn().mockResolvedValue(undefined),
  };
});

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/leads/route");
  const req = new Request("http://test/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as import("next/server").NextRequest);
}

const baseLeadInput = {
  name: "Acme Lead",
  email: "lead@acme.test",
  mobile: "+919999999999",
  // A complete B2B payload. company/firstName/lastName are OPTIONAL on the
  // manual create path (B2C motion — see the company-less test below); they're
  // included here to exercise the full-field happy path.
  company: "Acme Inc",
  firstName: "Acme",
  lastName: "Lead",
  ownerName: "Test Owner",
  source: "Web",
  stage: "New",
  status: "Open",
};

const flushMicrotasks = () => new Promise((r) => setImmediate(r));

describe("POST /api/leads — auto-task side effect", () => {
  beforeEach(() => {
    createDefaultTaskForLead.mockReset();
    createDefaultTaskForLead.mockImplementation(() => Promise.resolve(undefined));
    getPipelineConfig.mockResolvedValue({
      stages: ["New"],
      statuses: ["Open"],
      dependentRules: [],
    });
    allowedStagesForSource.mockReturnValue([]);
    allowedStatusesForStage.mockReturnValue([]);
    validateDynamicFields.mockReturnValue({ values: {}, errors: {} });
    listLeadFields.mockResolvedValue([]);
    findDuplicateLead.mockResolvedValue(null);
    db.crmLead.create.mockReset();
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
  });

  it("dispatches createDefaultTaskForLead after a lead is created", async () => {
    const lead = {
      id: "lead-1",
      tenantId: "t1",
      name: "Acme Lead",
      ownerId: "u-owner",
      stage: "New",
    };
    db.crmLead.create.mockResolvedValue(lead as never);

    const res = await callPost(baseLeadInput);
    await flushMicrotasks();

    expect(res.status).toBe(201);
    expect(createDefaultTaskForLead).toHaveBeenCalledTimes(1);
    expect(createDefaultTaskForLead).toHaveBeenCalledWith(lead);
  });

  it("does NOT fail the lead POST when auto-task dispatch throws", async () => {
    db.crmLead.create.mockResolvedValue({
      id: "lead-4",
      tenantId: "t1",
      name: "Resilient Lead",
      ownerId: "u-owner",
      stage: "New",
      source: "Web",
      createdAt: new Date(),
    } as never);
    createDefaultTaskForLead.mockImplementation(() =>
      Promise.reject(new Error("dispatch failed")),
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await callPost({ ...baseLeadInput, email: "resilient@acme.test" });
    await flushMicrotasks();

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("lead-4");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auto-task] dispatch failed",
      expect.any(Error),
    );
    consoleErrorSpy.mockRestore();
  });

  // Regression guard for the B2C / company-less motion (launch-blocking item 1).
  // The manual create path must accept individual leads with no company,
  // firstName, or lastName — only an identity (email or mobile) is required.
  it("creates a company-less B2C lead (no company/firstName/lastName)", async () => {
    const lead = {
      id: "lead-b2c",
      tenantId: "t1",
      name: "Individual Lead",
      mobile: "+919888888888",
      ownerName: "Test Owner",
      stage: "New",
    };
    db.crmLead.create.mockResolvedValue(lead as never);

    const res = await callPost({
      name: "Individual Lead",
      mobile: "+919888888888",
      source: "Web",
      ownerName: "Test Owner",
    });
    await flushMicrotasks();

    expect(res.status).toBe(201);
    expect(db.crmLead.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a create with neither email nor mobile", async () => {
    const res = await callPost({
      name: "No Identity Lead",
      source: "Web",
      ownerName: "Test Owner",
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
    expect(db.crmLead.create).not.toHaveBeenCalled();
  });
});
