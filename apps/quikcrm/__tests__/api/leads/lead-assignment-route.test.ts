/**
 * API tests for GET /api/leads/assignable-users
 * and assignment-guard integration in POST /api/leads + PATCH /api/leads/[id].
 *
 * Covers:
 *   - 401 when unauthenticated
 *   - 200 with role-filtered list for assignable-users
 *   - 403 when a SalesManager tries to assign outside their groups (POST + PATCH)
 *   - 403 when a SalesUser tries to assign to someone else (PATCH)
 *   - 201 when Administrator assigns to any user (POST)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

// ── stub lead-assignment service so route tests don't need full DB setup ──────
// Use delegate pattern: the arrow function wrapper is not a vi.fn() so
// vi.restoreAllMocks() in setup.ts afterEach doesn't reset it. The named
// variables ARE vi.fn() and are reset; beforeEach re-registers them.
const mockGetAssignableUsers = vi.fn().mockResolvedValue([]);
const mockAssertCanAssignLeadTo = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/services/leads/lead-assignment", () => ({
  getAssignableUsers: (...args: unknown[]) => mockGetAssignableUsers(...args),
  assertCanAssignLeadTo: (...args: unknown[]) => mockAssertCanAssignLeadTo(...args),
}));

// Same delegate pattern for create-record — vi.restoreAllMocks() resets the
// direct vi.fn() values inside the factory, so we hoist named references.
const mockCreateCrmLead = vi.fn();
const mockUpdateCrmLead = vi.fn();

// ── stub heavy lead-creation side-effects ─────────────────────────────────────
// Use plain async functions (NOT vi.fn()) so vi.clearAllMocks() / vi.restoreAllMocks()
// in setup.ts cannot reset them between tests. These mocks are only used to keep
// the route from throwing — no assertions are made on them.
vi.mock("@/lib/services/automation/triggers", () => ({
  onLeadCreated: async () => undefined,
  onLeadUpdated: async () => undefined,
}));
vi.mock("@/lib/services/leads/realtime", () => ({
  publishLeadEvent: async () => undefined,
}));
vi.mock("@/lib/services/leads/change-log", () => ({
  recordLeadChange: async () => undefined,
}));
vi.mock("@/lib/services/leads/auto-task", () => ({
  createDefaultTaskForLead: async () => undefined,
}));
vi.mock("@/lib/services/fields/repo", () => ({
  listLeadFields: async () => [],
}));
vi.mock("@/lib/services/fields/validate", () => ({
  validateDynamicFields: () => ({ values: {}, errors: {} }),
}));
vi.mock("@/lib/services/leads/duplicate", () => ({
  findDuplicateLead: async () => null,
}));
vi.mock("@/lib/services/workspace/pipeline-config", () => ({
  getPipelineConfig: async () => ({
    stages: ["New", "Contacted"],
    statuses: ["Open", "Working"],
    dependentRules: {},
  }),
  allowedStagesForSource: () => [],
  allowedStatusesForStage: () => [],
}));
vi.mock("@/lib/services/leads/create-record", () => ({
  createCrmLead: (...args: unknown[]) => mockCreateCrmLead(...args),
  updateCrmLead: (...args: unknown[]) => mockUpdateCrmLead(...args),
}));
vi.mock("@/lib/services/leads/lead-scoring/integration", () => ({
  shouldUseAutoLeadScore: async () => false,
  syncLeadScoreAfterChange: async () => undefined,
}));
vi.mock("@/lib/services/leads/log-lead-system-activities", () => ({
  LEAD_CREATION_CHANNELS: ["manual", "website", "csv_import", "facebook_ads", "whatsapp_campaign", "api_sync"],
  inferLeadCreationChannel: () => "manual",
  isLeadCreationChannel: () => true,
}));
vi.mock("@/lib/notifications/rules/engine", () => ({
  evaluateRulesForEvent: async () => undefined,
}));
vi.mock("@/lib/notifications/lead-triggers", () => ({
  fireLeadOwnerChangeNotifications: async () => undefined,
}));
vi.mock("@/lib/services/reports/csv-columns", () => ({
  LEAD_CSV_SELECT: {},
  leadCsvColumns: () => [],
  readTzFromCookieHeader: () => "UTC",
}));
vi.mock("@/lib/services/reports/format-dispatch", () => ({
  dispatchExport: () => undefined,
  parseReportFormat: () => null,
}));
vi.mock("@/lib/services/reports/prisma-cursor", () => ({
  createPrismaCursorIterator: () => undefined,
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

async function callAssignableUsers() {
  const { GET } = await import("@/app/api/leads/assignable-users/route");
  const req = new Request("http://test/api/leads/assignable-users");
  return GET();
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/leads/route");
  const req = new Request("http://test/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as import("next/server").NextRequest);
}

async function callPatch(leadId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/leads/[id]/route");
  const req = new Request(`http://test/api/leads/${leadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req as unknown as import("next/server").NextRequest, {
    params: Promise.resolve({ id: leadId }),
  });
}

// ─── GET /api/leads/assignable-users ─────────────────────────────────────────

describe("GET /api/leads/assignable-users", () => {
  beforeEach(() => {
    mockGetAssignableUsers.mockReset();
    mockAssertCanAssignLeadTo.mockReset().mockResolvedValue(undefined);
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await callAssignableUsers();
    expect(res.status).toBe(401);
  });

  it("returns 200 with role-filtered list for SalesUser", async () => {
    setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
    mockGetAssignableUsers.mockResolvedValueOnce([
      { id: "u1", name: "Sales Rep", email: "rep@example.com", role: "SalesUser" },
    ]);

    const res = await callAssignableUsers();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("u1");
  });

  it("returns 200 with empty list for MarketingUser (cannot assign)", async () => {
    setSession({ userId: "u2", orgId: "org1", role: "MarketingUser" });
    mockGetAssignableUsers.mockResolvedValueOnce([]);

    const res = await callAssignableUsers();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });
});

// ─── POST /api/leads — assignment guard ──────────────────────────────────────

/** Minimal valid POST body — all required schema fields populated. */
const VALID_POST_BASE = {
  name: "Test Lead",
  email: "lead@example.com",
  mobile: "+919876543210",
  company: "Test Corp",
  firstName: "Test",
  lastName: "Lead",
  source: "Website",
};

describe("POST /api/leads — assignment guard", () => {
  beforeEach(() => {
    mockGetAssignableUsers.mockReset();
    mockAssertCanAssignLeadTo.mockReset().mockResolvedValue(undefined);
    mockCreateCrmLead.mockReset().mockResolvedValue({ id: "lead-1", stage: "New", ownerId: "u1" });
    mockUpdateCrmLead.mockReset().mockResolvedValue({ id: "lead-1", stage: "New", ownerId: "u1", name: "Test" });
    db.crmLead.findFirst.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await callPost({ name: "Test Lead" });
    expect(res.status).toBe(401);
  });

  it("calls assertCanAssignLeadTo when ownerId differs from actor", async () => {
    setSession({ userId: "u-manager", orgId: "org1", role: "SalesManager" });

    await callPost({
      ...VALID_POST_BASE,
      ownerId: "u-salesrep",
    });

    expect(mockAssertCanAssignLeadTo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-manager" }),
      "u-salesrep",
    );
  });

  it("skips assertCanAssignLeadTo when ownerId is self", async () => {
    setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });

    await callPost({
      ...VALID_POST_BASE,
      email: "my@example.com",
      ownerId: "u1",
    });

    expect(mockAssertCanAssignLeadTo).not.toHaveBeenCalled();
  });

  it("returns 403 when SalesManager assigns outside their groups", async () => {
    setSession({ userId: "u-manager", orgId: "org1", role: "SalesManager" });
    const err = new Error("Cannot assign lead to users outside your managed sales groups") as Error & { statusCode: number };
    err.statusCode = 403;
    mockAssertCanAssignLeadTo.mockRejectedValueOnce(err);

    const res = await callPost({
      ...VALID_POST_BASE,
      ownerId: "u-outside-group",
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/outside your managed sales groups/i);
  });
});

// ─── PATCH /api/leads/[id] — assignment guard ─────────────────────────────────

describe("PATCH /api/leads/[id] — assignment guard", () => {
  const EXISTING_LEAD = {
    id: "lead-1",
    orgId: "org1",
    ownerId: "u-current-owner",
    accountId: null,
    deletedAt: null,
    stage: "New",
    name: "Test Lead",
  };

  beforeEach(() => {
    mockGetAssignableUsers.mockReset();
    mockAssertCanAssignLeadTo.mockReset().mockResolvedValue(undefined);
    mockUpdateCrmLead.mockReset().mockResolvedValue({ id: "lead-1", stage: "New", ownerId: "u1", name: "Test" });
    db.crmLead.findUnique.mockReset();
    db.crmLead.findUnique.mockResolvedValue(EXISTING_LEAD as never);
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await callPatch("lead-1", { stage: "Contacted" });
    expect(res.status).toBe(401);
  });

  it("calls assertCanAssignLeadTo when ownerId changes", async () => {
    setSession({ userId: "u-manager", orgId: "org1", role: "SalesManager" });

    await callPatch("lead-1", { ownerId: "u-new-owner" });

    expect(mockAssertCanAssignLeadTo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-manager" }),
      "u-new-owner",
    );
  });

  it("skips assertCanAssignLeadTo when ownerId is unchanged", async () => {
    setSession({ userId: "u-manager", orgId: "org1", role: "SalesManager" });

    // PATCH with same ownerId as existing
    await callPatch("lead-1", { ownerId: "u-current-owner" });

    expect(mockAssertCanAssignLeadTo).not.toHaveBeenCalled();
  });

  it("skips assertCanAssignLeadTo when ownerId is not in payload", async () => {
    setSession({ userId: "u-salesuser", orgId: "org1", role: "SalesUser" });

    await callPatch("lead-1", { stage: "Contacted" });

    expect(mockAssertCanAssignLeadTo).not.toHaveBeenCalled();
  });

  it("returns 403 when SalesUser reassigns to another user", async () => {
    setSession({ userId: "u-salesuser", orgId: "org1", role: "SalesUser" });
    const err = new Error("Sales users can only assign leads to themselves") as Error & { statusCode: number };
    err.statusCode = 403;
    mockAssertCanAssignLeadTo.mockRejectedValueOnce(err);

    const res = await callPatch("lead-1", { ownerId: "u-someone-else" });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/only assign leads to themselves/i);
  });

  it("returns 403 when SalesManager reassigns to user outside their groups", async () => {
    setSession({ userId: "u-manager", orgId: "org1", role: "SalesManager" });
    const err = new Error("Cannot assign lead to users outside your managed sales groups") as Error & { statusCode: number };
    err.statusCode = 403;
    mockAssertCanAssignLeadTo.mockRejectedValueOnce(err);

    const res = await callPatch("lead-1", { ownerId: "u-outside" });

    expect(res.status).toBe(403);
  });

  it("returns 200 when Administrator reassigns to any user", async () => {
    setSession({ userId: "u-admin", orgId: "org1", role: "Administrator" });
    // assertCanAssignLeadTo is not called for Admins (handled inside service),
    // mock stays as .mockResolvedValue(undefined) — no error thrown.

    const res = await callPatch("lead-1", { ownerId: "u-any-user" });
    const body = await res.json();
    // eslint-disable-next-line no-console
    if (res.status !== 200) console.error("PATCH admin 500 body:", JSON.stringify(body));
    expect(res.status).toBe(200);
  });
});
