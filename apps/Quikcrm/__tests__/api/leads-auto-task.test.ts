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

vi.mock("@/lib/services/workspace/pipeline-config", () => ({
  getPipelineConfig,
  allowedStagesForSource,
  allowedStatusesForStage,
}));
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
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
  });

  it("dispatches createDefaultTaskForLead after a lead is created", async () => {
    const lead = {
      id: "lead-1",
      orgId: "t1",
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
      orgId: "t1",
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
});
