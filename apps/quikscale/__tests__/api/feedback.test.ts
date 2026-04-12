import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/performance/feedback/route";

const USER = "ckactor00000000000000000001";
const OTHER = "ckother00000000000000000001";
const TENANT = "tenant-feedback-1";

// ---- Helpers ----------------------------------------------------------------

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/performance/feedback${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/performance/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

const validBody = {
  toUserId: OTHER,
  category: "kudos",
  content: "Great job on the release!",
  visibility: "private",
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/performance/feedback — auth
// ═══════════════════════════════════════════════

describe("GET /api/performance/feedback — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/performance/feedback — happy path
// ═══════════════════════════════════════════════

describe("GET /api/performance/feedback — happy path", () => {
  beforeEach(asAdmin);

  it("returns feedback entries where user is sender or receiver", async () => {
    const mockEntry = {
      id: "fb1",
      fromUserId: USER,
      toUserId: OTHER,
      category: "kudos",
      visibility: "private",
      content: "Great job!",
      relatedType: null,
      relatedId: null,
      createdAt: new Date(),
      fromUser: { id: USER, firstName: "Test", lastName: "User", email: "t@t.com" },
      toUser: { id: OTHER, firstName: "Other", lastName: "User", email: "o@t.com" },
    };
    mockDb.feedbackEntry.count.mockResolvedValue(1);
    mockDb.feedbackEntry.findMany.mockResolvedValue([mockEntry] as any);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    // Verify tenant isolation
    expect(mockDb.feedbackEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });

  it("forces shared visibility when viewing others' feedback", async () => {
    mockDb.feedbackEntry.count.mockResolvedValue(0);
    mockDb.feedbackEntry.findMany.mockResolvedValue([]);

    // toUserId and fromUserId are both OTHER (caller is not involved)
    await GET(buildGET(`toUserId=${OTHER}&fromUserId=${OTHER}`), { params: {} as any });

    expect(mockDb.feedbackEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visibility: "shared" }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/feedback — auth
// ═══════════════════════════════════════════════

describe("POST /api/performance/feedback — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/feedback — validation
// ═══════════════════════════════════════════════

describe("POST /api/performance/feedback — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when content is empty", async () => {
    const res = await POST(
      buildPOST({ ...validBody, content: "" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when toUserId is not a cuid", async () => {
    const res = await POST(
      buildPOST({ ...validBody, toUserId: "not-a-cuid" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when category is invalid", async () => {
    const res = await POST(
      buildPOST({ ...validBody, category: "invalid-cat" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/feedback — self-feedback rejection
// ═══════════════════════════════════════════════

describe("POST /api/performance/feedback — self-feedback", () => {
  beforeEach(asAdmin);

  it("returns 400 when user tries to leave feedback on themselves", async () => {
    const res = await POST(
      buildPOST({ ...validBody, toUserId: USER }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot leave feedback on yourself/i);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/feedback — recipient membership
// ═══════════════════════════════════════════════

describe("POST /api/performance/feedback — recipient membership", () => {
  beforeEach(asAdmin);

  it("returns 400 when recipient is not an active member", async () => {
    // The first findFirst resolves for withTenantAuth (asAdmin).
    // The second call (recipient check) returns null.
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce(null); // recipient not found

    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not an active member/i);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/feedback — happy path
// ═══════════════════════════════════════════════

describe("POST /api/performance/feedback — happy path", () => {
  beforeEach(asAdmin);

  it("creates feedback entry with 201", async () => {
    // Recipient membership OK
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      status: "active",
    } as any);

    const createdEntry = {
      id: "new-fb1",
      fromUserId: USER,
      toUserId: OTHER,
      category: "kudos",
      visibility: "private",
      createdAt: new Date(),
    };
    mockDb.feedbackEntry.create.mockResolvedValue(createdEntry as any);

    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-fb1");
    expect(body.data.fromUserId).toBe(USER);
    expect(body.data.toUserId).toBe(OTHER);
  });
});
