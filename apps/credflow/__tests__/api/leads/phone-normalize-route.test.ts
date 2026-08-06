import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

// Capture what the PATCH route hands to the write layer so we can assert the
// phone was normalized to E.164 before persist. updateCrmLead just wraps
// prisma.crmLead.update; mocking it keeps the test hermetic (no scoring /
// change-log round-trips) while still proving the route's normalization wiring.
const { updateCrmLeadMock } = vi.hoisted(() => ({ updateCrmLeadMock: vi.fn() }));
vi.mock("@/lib/services/leads/create-record", () => ({
  updateCrmLead: updateCrmLeadMock,
  createCrmLead: vi.fn(),
}));
vi.mock("@/lib/services/leads/lead-scoring/integration", () => ({
  shouldUseAutoLeadScore: vi.fn(async () => false),
  syncLeadScoreAfterChange: vi.fn(async () => undefined),
}));
vi.mock("@/lib/services/leads/change-log", () => ({
  recordLeadChange: vi.fn(async () => undefined),
}));

function adminSession() {
  setSession({
    userId: "u1",
    tenantId: "t1",
    role: "Administrator",
    email: "a@b.co",
    name: "Alice",
  });
}

function existingLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    tenantId: "t1",
    name: "Test Lead",
    stage: "New",
    status: "Open",
    source: "Web",
    accountId: null,
    ownerId: "u1",
    ownerName: "Alice",
    phone: null,
    mobile: null,
    dynamicFields: null,
    deletedAt: null,
    ...overrides,
  };
}

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/leads/[id]/route");
  const req = new Request("http://test/api/leads/l1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req as unknown as import("next/server").NextRequest, {
    params: Promise.resolve({ id: "l1" }),
  });
}

describe("PATCH /api/leads/[id] — phone normalization", () => {
  beforeEach(() => {
    db.crmLead.findUnique.mockReset();
    updateCrmLeadMock.mockReset();
    setSession(null);
  });

  it("normalizes a bare-digit phone to E.164 before write", async () => {
    adminSession();
    db.crmLead.findUnique.mockResolvedValue(existingLead() as never);
    updateCrmLeadMock.mockImplementation(async (_id: string, data: Record<string, unknown>) => ({
      ...existingLead(),
      ...data,
    }));

    const res = await patch({ phone: "7631957103" });
    expect(res.status).toBe(200);
    expect(updateCrmLeadMock).toHaveBeenCalledTimes(1);
    const data = updateCrmLeadMock.mock.calls[0]![1] as { phone?: string };
    expect(data.phone).toBe("+917631957103");
  });

  it("rejects an invalid phone with the leads { error, errors } shape", async () => {
    adminSession();
    db.crmLead.findUnique.mockResolvedValue(existingLead() as never);

    const res = await patch({ phone: "12345" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.errors.phone)).toBe(true);
    expect(updateCrmLeadMock).not.toHaveBeenCalled();
  });
});
