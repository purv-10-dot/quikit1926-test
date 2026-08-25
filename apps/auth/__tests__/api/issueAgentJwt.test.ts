import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Same hand-rolled style as verifyToken.test.ts — this route touches three
// Prisma models, so a deep mock would add a dependency for no gain.
//
// NOTE: the route imports `db` from "@/lib/db", which re-exports from
// "@quikit/database". Mocking the package covers both paths.

const h = vi.hoisted(() => ({
  orgMemberFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  agentJwtIssuanceCreate: vi.fn(
    async (_args: { data: Record<string, unknown> }): Promise<unknown> => ({}),
  ),
}));

vi.mock("@quikit/database", () => ({
  db: {
    orgMember: { findFirst: h.orgMemberFindFirst },
    user: { findUnique: h.userFindUnique },
    agentJwtIssuance: { create: h.agentJwtIssuanceCreate },
  },
}));

import { POST } from "@/app/api/auth/internal/issue-agent-jwt/route";
import { AGENT_JWT_ISSUER } from "@quikit/shared";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INTERNAL_SECRET = "test-internal-secret";
const NEXTAUTH_SECRET = "test-nextauth-secret-for-issue-agent-jwt";
const USER_ID = "usr_1";
const ORG_ID = "org_1";

type Body = Record<string, unknown>;

function validBody(extra: Body = {}): Body {
  return {
    userId: USER_ID,
    orgId: ORG_ID,
    requestingService: "ai-runtime",
    reason: "test",
    actingAs: "ai_agent",
    actingAgentId: "agent_001",
    ...extra,
  };
}

function makeRequest(body: Body | string, secret: string | null = INTERNAL_SECRET) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set("x-internal-secret", secret);
  return new NextRequest(
    new URL("http://localhost:3001/api/auth/internal/issue-agent-jwt"),
    {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    } as never,
  );
}

/** Decode a minted token with next-auth's real `decode` — not a hand-rolled one. */
async function decodeMinted(token: string) {
  return decode({ token, secret: NEXTAUTH_SECRET });
}

/** The single audit row written for this request. */
function auditRow() {
  expect(h.agentJwtIssuanceCreate).toHaveBeenCalledTimes(1);
  return h.agentJwtIssuanceCreate.mock.calls[0][0].data;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/internal/issue-agent-jwt", () => {
  beforeEach(() => {
    process.env.INTERNAL_SECRET = INTERNAL_SECRET;
    process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;
    h.orgMemberFindFirst.mockReset();
    h.userFindUnique.mockReset();
    h.agentJwtIssuanceCreate.mockReset();
    h.agentJwtIssuanceCreate.mockResolvedValue({});
    h.orgMemberFindFirst.mockResolvedValue({ role: "org_admin" });
    h.userFindUnique.mockResolvedValue({
      id: USER_ID,
      email: "member@test.com",
      isSuperAdmin: false,
    });
  });

  // ── Auth gate ──────────────────────────────────────────────────────────────

  it("returns 401 when the internal secret is missing", async () => {
    const res = await POST(makeRequest(validBody(), null));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    // No body audit row — the route deliberately does not trust the body yet.
    expect(h.agentJwtIssuanceCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when the internal secret does not match", async () => {
    const res = await POST(makeRequest(validBody(), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(h.agentJwtIssuanceCreate).not.toHaveBeenCalled();
  });

  // ── Allowlist ──────────────────────────────────────────────────────────────

  it("returns 403 for a service not on the internal allowlist, and audits it", async () => {
    const res = await POST(makeRequest(validBody({ requestingService: "not-a-service" })));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(auditRow()).toMatchObject({ status: "forbidden", errorCode: "FORBIDDEN" });
  });

  // ── Membership ─────────────────────────────────────────────────────────────

  it("returns 404 when (userId, orgId) is not an active membership, and audits it", async () => {
    h.orgMemberFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(auditRow()).toMatchObject({ status: "not_found", errorCode: "NOT_FOUND" });
  });

  it("only mints for an ACTIVE membership", async () => {
    await POST(makeRequest(validBody()));
    expect(h.orgMemberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, orgId: ORG_ID, status: "active" },
      }),
    );
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("returns 422 for a non-JSON body", async () => {
    const res = await POST(makeRequest("this is not json"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when actingAs is ai_agent but actingAgentId is absent, and audits it", async () => {
    const res = await POST(makeRequest(validBody({ actingAgentId: undefined })));
    expect(res.status).toBe(422);
    expect(auditRow()).toMatchObject({ status: "validation_error" });
  });

  it.each([
    ["below the floor", 59],
    ["above the ceiling", 901],
  ])("returns 422 for a ttlSeconds %s", async (_label, ttlSeconds) => {
    const res = await POST(makeRequest(validBody({ ttlSeconds })));
    expect(res.status).toBe(422);
  });

  it("returns 422 for an actingAs outside the closed enum", async () => {
    const res = await POST(makeRequest(validBody({ actingAs: "root" })));
    expect(res.status).toBe(422);
  });

  // ── The minted claim set — the regression this whole change exists for ─────

  it("mints sub AND id, both carrying the user id", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const { token } = await res.json();
    const claims = await decodeMinted(token);

    // The bug: `id` was present, `sub` was not, and QuikTrack's verifier
    // required `sub`. Both must be present and identical.
    expect(claims?.sub).toBe(USER_ID);
    expect(claims?.id).toBe(USER_ID);
    expect(claims?.sub).toBe(claims?.id);
  });

  it("mints the issuer claim", async () => {
    const res = await POST(makeRequest(validBody()));
    const { token } = await res.json();
    expect((await decodeMinted(token))?.iss).toBe(AGENT_JWT_ISSUER);
  });

  it("mints the full documented claim set", async () => {
    const res = await POST(makeRequest(validBody()));
    const claims = await decodeMinted((await res.json()).token);
    expect(claims).toMatchObject({
      id: USER_ID,
      sub: USER_ID,
      iss: AGENT_JWT_ISSUER,
      email: "member@test.com",
      orgId: ORG_ID,
      membershipRole: "org_admin",
      isSuperAdmin: false,
      actingAs: "ai_agent",
      actingAgentId: "agent_001",
    });
  });

  it("never mints a sessionId — agent tokens stay out of the Redis session store", async () => {
    const res = await POST(makeRequest(validBody()));
    const claims = await decodeMinted((await res.json()).token);
    expect(claims?.sessionId).toBeUndefined();
  });

  it("omits actingAgentId for platform_service / scheduled_job rather than inventing one", async () => {
    for (const actingAs of ["platform_service", "scheduled_job"]) {
      h.agentJwtIssuanceCreate.mockClear();
      const res = await POST(
        makeRequest(validBody({ actingAs, actingAgentId: undefined })),
      );
      expect(res.status, `${actingAs} should mint`).toBe(200);
      const claims = await decodeMinted((await res.json()).token);
      expect(claims?.actingAs).toBe(actingAs);
      expect(claims?.actingAgentId).toBeUndefined();
    }
  });

  it("defaults actingAs to 'user' when omitted — a token no agent-JWT verifier will accept", async () => {
    // Documented deliberately: this default is a live trap. The token mints
    // successfully (200) but QuikTrack's verifier rejects `actingAs: "user"`,
    // producing a silent 401 at the far end. Callers must send actingAs.
    const res = await POST(
      makeRequest(validBody({ actingAs: undefined, actingAgentId: undefined })),
    );
    expect(res.status).toBe(200);
    expect((await decodeMinted((await res.json()).token))?.actingAs).toBe("user");
  });

  // ── TTL + audit ────────────────────────────────────────────────────────────

  it("defaults ttlSeconds to 300 and reports a matching expiresAt", async () => {
    const res = await POST(makeRequest(validBody()));
    const { token, expiresAt } = await res.json();
    const claims = await decodeMinted(token);
    const exp = claims?.exp as number;
    const iat = claims?.iat as number;
    expect(exp - iat).toBe(300);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    expect(auditRow()).toMatchObject({ ttlSeconds: 300 });
  });

  it("writes a success audit row carrying the trace id", async () => {
    const req = makeRequest(validBody());
    req.headers.set("x-trace-id", "trace-123");
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(auditRow()).toMatchObject({
      requestingService: "ai-runtime",
      userId: USER_ID,
      orgId: ORG_ID,
      agentId: "agent_001",
      actingAs: "ai_agent",
      traceId: "trace-123",
      status: "success",
      errorCode: null,
    });
  });

  it("still mints when the audit write fails — availability beats the audit row", async () => {
    h.agentJwtIssuanceCreate.mockRejectedValue(new Error("audit table down"));
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
  });

  // ── Config ─────────────────────────────────────────────────────────────────

  it("returns 500 when NEXTAUTH_SECRET is absent", async () => {
    delete process.env.NEXTAUTH_SECRET;
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    expect(auditRow()).toMatchObject({ status: "internal_error" });
  });
});
