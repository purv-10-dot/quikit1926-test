import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Hand-rolled rather than vitest-mock-extended: verify-token touches exactly two
// Prisma models, so a deep mock would add a dependency to apps/auth for no gain.

const h = vi.hoisted(() => ({
  verifyJWT: vi.fn(),
  touchAuthSession: vi.fn(async () => undefined),
  orgFindUnique: vi.fn(),
  orgMemberFindUnique: vi.fn(),
}));

vi.mock("@quikit/database", () => ({
  db: {
    org: { findUnique: h.orgFindUnique },
    orgMember: { findUnique: h.orgMemberFindUnique },
  },
}));

vi.mock("@quikit/auth/jwt", () => ({ verifyJWT: h.verifyJWT }));
vi.mock("@quikit/auth/session-store", () => ({ touchAuthSession: h.touchAuthSession }));

import { GET } from "@/app/api/verify-token/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = "test-internal-secret";
const USER_ID = "user-1";
const ORG_ID = "org-1";

function makeRequest(secret: string | null = SECRET) {
  const headers = new Headers();
  if (secret !== null) headers.set("x-internal-secret", secret);
  return new NextRequest(new URL("http://localhost:3001/api/verify-token"), {
    method: "GET",
    headers,
  } as never);
}

/** A decoded human session token. */
function humanToken(extra: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: "member@test.com",
    orgId: ORG_ID,
    membershipRole: "member",
    isSuperAdmin: false,
    ...extra,
  };
}

const ACTIVE_ORG = { status: "active", subscription: null };

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/verify-token", () => {
  beforeEach(() => {
    process.env.INTERNAL_SECRET = SECRET;
    h.verifyJWT.mockReset();
    h.orgFindUnique.mockReset();
    h.orgMemberFindUnique.mockReset();
    h.orgFindUnique.mockResolvedValue(ACTIVE_ORG);
    h.orgMemberFindUnique.mockResolvedValue({ customPermissions: [] });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 403 when the internal secret does not match", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(h.verifyJWT).not.toHaveBeenCalled();
  });

  it("returns { valid: false } for an undecodable token", async () => {
    h.verifyJWT.mockResolvedValue(null);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.customPermissions).toBeUndefined();
  });

  // ── R1: customPermissions ─────────────────────────────────────────────────

  it("surfaces OrgMember.customPermissions for the token's active org", async () => {
    h.verifyJWT.mockResolvedValue(humanToken());
    h.orgMemberFindUnique.mockResolvedValue({
      customPermissions: ["kpi.write", "priority.delete"],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.customPermissions).toEqual(["kpi.write", "priority.delete"]);
  });

  it("scopes the permission lookup by BOTH orgId and userId", async () => {
    h.verifyJWT.mockResolvedValue(humanToken());

    await GET(makeRequest());

    expect(h.orgMemberFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId_userId: { orgId: ORG_ID, userId: USER_ID } },
      }),
    );
  });

  it("returns [] — never null — when the member has no extra permissions", async () => {
    h.verifyJWT.mockResolvedValue(humanToken());
    h.orgMemberFindUnique.mockResolvedValue(null);

    const body = await (await GET(makeRequest())).json();
    expect(body.customPermissions).toEqual([]);
  });

  it("returns [] and skips the lookup when the token has no active org", async () => {
    h.verifyJWT.mockResolvedValue(humanToken({ orgId: undefined }));

    const body = await (await GET(makeRequest())).json();
    expect(body.activeOrgId).toBeNull();
    expect(body.customPermissions).toEqual([]);
    expect(h.orgMemberFindUnique).not.toHaveBeenCalled();
  });

  it("reads permissions live from the DB, not from a JWT claim", async () => {
    // A stale claim on the token must not win over the current DB row —
    // that is the whole point of reading live (revocation takes effect now).
    h.verifyJWT.mockResolvedValue(humanToken({ customPermissions: ["stale.permission"] }));
    h.orgMemberFindUnique.mockResolvedValue({ customPermissions: ["current.permission"] });

    const body = await (await GET(makeRequest())).json();
    expect(body.customPermissions).toEqual(["current.permission"]);
  });

  // ── R2: actor claims ──────────────────────────────────────────────────────

  it("defaults actingAs to 'user' and actingAgentId to null for a human session", async () => {
    h.verifyJWT.mockResolvedValue(humanToken());

    const body = await (await GET(makeRequest())).json();
    expect(body.actingAs).toBe("user");
    expect(body.actingAgentId).toBeNull();
  });

  it("surfaces actingAs and actingAgentId from an agent-minted token", async () => {
    h.verifyJWT.mockResolvedValue(
      humanToken({ actingAs: "ai_agent", actingAgentId: "quikassist-tool-runner" }),
    );

    const body = await (await GET(makeRequest())).json();
    expect(body.actingAs).toBe("ai_agent");
    expect(body.actingAgentId).toBe("quikassist-tool-runner");
  });

  it("surfaces the other actingAs values unchanged", async () => {
    for (const actingAs of ["platform_service", "scheduled_job"]) {
      h.verifyJWT.mockResolvedValue(humanToken({ actingAs }));
      const body = await (await GET(makeRequest())).json();
      expect(body.actingAs).toBe(actingAs);
    }
  });

  // ── Backward compatibility ────────────────────────────────────────────────

  it("keeps every pre-existing field in the response", async () => {
    h.verifyJWT.mockResolvedValue(humanToken());

    const body = await (await GET(makeRequest())).json();
    expect(body).toMatchObject({
      valid: true,
      userId: USER_ID,
      email: "member@test.com",
      activeOrgId: ORG_ID,
      orgRole: "member",
      isSuperAdmin: false,
      orgActive: true,
      subscriptionActive: true,
      trialExpired: false,
    });
  });

  it("still reports orgActive=false for a suspended org", async () => {
    h.verifyJWT.mockResolvedValue(humanToken());
    h.orgFindUnique.mockResolvedValue({ status: "suspended", subscription: null });

    const body = await (await GET(makeRequest())).json();
    expect(body.orgActive).toBe(false);
    // The new field must still be populated on the suspended path.
    expect(body.customPermissions).toEqual([]);
  });
});
