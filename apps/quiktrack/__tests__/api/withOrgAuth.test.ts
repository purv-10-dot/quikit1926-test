import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { EncryptJWT } from "jose";
import hkdf from "@panva/hkdf";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hashPatToken } from "@/lib/api/patToken";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

vi.mock("@quikit/shared/rateLimit", () => ({
  rateLimitAsync: vi.fn(),
}));

const mockRateLimitAsync = vi.mocked(rateLimitAsync);

const RAW_TOKEN = "test-raw-token-value";
const ORG = "org_1";
const PROJECT = "proj_1";
const CREATED_BY = "user_1";
const PAT_NAME = "Claude Code — laptop";
const AGENT_NEXTAUTH_SECRET = "test-nextauth-secret-for-agent-jwt";

async function mintAgentJwt(
  claims: Record<string, unknown>,
  opts: { ttlSeconds?: number } = {},
) {
  const key = await hkdf("sha256", AGENT_NEXTAUTH_SECRET, "", "NextAuth.js Generated Encryption Key", 32);
  const now = Math.floor(Date.now() / 1000);
  const { ttlSeconds = 300 } = opts;
  return new EncryptJWT(claims)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .encrypt(key);
}

function buildRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = token;
  return new NextRequest("http://localhost/api/mcp", { headers });
}

function mockValidPat() {
  mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
    id: "pat_1",
    orgId: ORG,
    projectId: PROJECT,
    createdById: CREATED_BY,
    tokenHash: hashPatToken(RAW_TOKEN),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    revokedAt: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    name: PAT_NAME,
    // One below the auto-revoke threshold, so a single failed access-recheck
    // in the "lost project access" test below crosses it and revokes.
    failedAccessChecks: 2,
  } as never);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
  mockRateLimitAsync.mockResolvedValue({ ok: true, remaining: 59, resetAt: Date.now() + 60_000, retryAfterSeconds: 0 });
  mockDb.qtPersonalAccessToken.update.mockResolvedValue({} as never);
  // Default: loadProjectAccess's live-access recheck succeeds (project
  // exists, PAT creator is a plain active project member).
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
});

describe("withOrgAuth({ allowPat: true })", () => {
  it("resolves a valid PAT to projectId + actorType 'agent' + actingAgentId (the PAT's own name)", async () => {
    mockValidPat();
    const seen: { projectId?: string | null; actorType?: string; actingAgentId?: string } = {};
    const handler = withOrgAuth(
      async (ctx) => {
        seen.projectId = ctx.projectId;
        seen.actorType = ctx.actorType;
        seen.actingAgentId = ctx.actingAgentId;
        return NextResponse.json({ success: true });
      },
      { allowPat: true },
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(200);
    expect(seen).toEqual({ projectId: PROJECT, actorType: "agent", actingAgentId: PAT_NAME });
  });

  it("returns the MCP-style 401 (not the app's generic shape) when the PAT is invalid", async () => {
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue(null);
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowPat: true });
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(401);
    const wwwAuthenticate = res.headers.get("www-authenticate");
    expect(wwwAuthenticate).toContain('error="invalid_token"');
    // RFC 9728 challenge so an OAuth-capable client can discover the IdP.
    expect(wwwAuthenticate).toContain("resource_metadata=");
    expect(wwwAuthenticate).toContain("/.well-known/oauth-protected-resource");
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_token" });
  });

  it("returns the MCP-style 401 when there's no bearer token at all, without falling back to a session cookie", async () => {
    setSession({ id: CREATED_BY, orgId: ORG, role: "owner" }); // present, but must never be consulted
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowPat: true });
    const res = await handler(buildRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_token" });
  });

  it("returns 429 with a retry-after header when the PAT is rate-limited", async () => {
    mockRateLimitAsync.mockResolvedValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowPat: true });
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    const body = await res.json();
    expect(body).toEqual({ error: "rate_limited" });
  });

  it("auto-revokes and rejects a PAT whose creator has lost project access", async () => {
    mockValidPat();
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowPat: true });
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(401);
    expect(mockDb.qtPersonalAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pat_1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  // PAT auto-revoke regression: a transient failure of the live-access
  // recheck (DB timeout/blip) must NOT be treated as "creator lost access."
  // Only an actual negative answer from the check revokes.
  it("rejects the request but does NOT revoke the PAT when the access recheck throws on every attempt", async () => {
    mockValidPat();
    // The recheck's own project lookup throws every time — a stand-in for a
    // transient DB error, not a real "project not found" answer.
    mockDb.qtProject.findFirst.mockRejectedValue(new Error("connection reset"));
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowPat: true });
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(401);
    // The load-bearing assertion: revokedAt is never written on a failed
    // check, only on a genuine negative one.
    expect(mockDb.qtPersonalAccessToken.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.anything() }) }),
    );
  });

  it("retries the access recheck and succeeds if a later attempt returns cleanly", async () => {
    mockValidPat();
    mockDb.qtProject.findFirst
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ id: PROJECT } as never);
    const seen: { actorType?: string } = {};
    const handler = withOrgAuth(
      async (ctx) => {
        seen.actorType = ctx.actorType;
        return NextResponse.json({ success: true });
      },
      { allowPat: true },
    );
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(200);
    expect(seen.actorType).toBe("agent");
    expect(mockDb.qtPersonalAccessToken.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.anything() }) }),
    );
  });
});

describe("withOrgAuth({ allowAgentJwt: true })", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = AGENT_NEXTAUTH_SECRET;
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET;
  });

  it("resolves a valid agent JWT to actorType 'agent' + actingAgentId, with no projectId (org-wide, unlike a PAT)", async () => {
    const token = await mintAgentJwt({
      sub: CREATED_BY,
      orgId: ORG,
      actingAs: "ai_agent",
      actingAgentId: "ai-runtime",
    });
    const seen: { userId?: string; orgId?: string; actorType?: string; actingAgentId?: string; projectId?: string | null } = {};
    const handler = withOrgAuth(
      async (ctx) => {
        seen.userId = ctx.userId;
        seen.orgId = ctx.orgId;
        seen.actorType = ctx.actorType;
        seen.actingAgentId = ctx.actingAgentId;
        seen.projectId = ctx.projectId;
        return NextResponse.json({ success: true });
      },
      { allowAgentJwt: true },
    );
    const res = await handler(buildRequest(`Bearer ${token}`));
    expect(res.status).toBe(200);
    expect(seen).toEqual({
      userId: CREATED_BY,
      orgId: ORG,
      actorType: "agent",
      actingAgentId: "ai-runtime",
      projectId: undefined,
    });
  });

  it("returns 401 without consulting loadProjectAccess/the DB — the JWT's own exp is the only recheck", async () => {
    const token = await mintAgentJwt({
      sub: CREATED_BY,
      orgId: ORG,
      actingAs: "ai_agent",
      actingAgentId: "ai-runtime",
    });
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowAgentJwt: true });
    const res = await handler(buildRequest(`Bearer ${token}`));
    expect(res.status).toBe(200);
    expect(mockDb.qtProject.findFirst).not.toHaveBeenCalled();
  });

  it("returns 401 for an expired agent JWT", async () => {
    const token = await mintAgentJwt(
      { sub: CREATED_BY, orgId: ORG, actingAs: "ai_agent", actingAgentId: "ai-runtime" },
      { ttlSeconds: -10 },
    );
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowAgentJwt: true });
    const res = await handler(buildRequest(`Bearer ${token}`));
    expect(res.status).toBe(401);
  });

  // allowAgentJwt is ADDITIVE, not exclusive. This test previously asserted the
  // opposite — that a session caller with no bearer got 401 — which is what
  // made b9d6dfc82 ship: opting the eight read routes in silently turned them
  // agent-JWT-only and 401'd every logged-in user of the browser app.
  it("falls through to the session cookie when no bearer token is present", async () => {
    setSession({ id: CREATED_BY, orgId: ORG, role: "owner" });
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowAgentJwt: true });
    const res = await handler(buildRequest());
    expect(res.status).toBe(200);
  });

  it("returns 401 when there is neither a bearer token nor a session", async () => {
    setSession(null);
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowAgentJwt: true });
    const res = await handler(buildRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 401 when a PAT is sent as the bearer token — allowAgentJwt does not also accept PATs", async () => {
    mockValidPat();
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowAgentJwt: true });
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(401);
  });
});

describe("withOrgAuth without allowAgentJwt — the security property this feature depends on", () => {
  it("rejects an agent JWT sent as a Bearer token on a route that did not opt into allowAgentJwt", async () => {
    process.env.NEXTAUTH_SECRET = AGENT_NEXTAUTH_SECRET;
    const token = await mintAgentJwt({
      sub: CREATED_BY,
      orgId: ORG,
      actingAs: "ai_agent",
      actingAgentId: "ai-runtime",
    });
    const handler = withOrgAuth(async () => NextResponse.json({ success: true, data: "should never run" }));
    const res = await handler(buildRequest(`Bearer ${token}`));
    // Falls through to the ordinary Bearer-API-token branch, which rejects
    // it as an unrecognized token — never even attempts JWE decryption.
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
    delete process.env.NEXTAUTH_SECRET;
  });
});

describe("withOrgAuth({ allowPat: true }) — OAuth access tokens (QuikIT launcher IdP)", () => {
  const OAUTH_TOKEN = "qk_test_access_token";

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockUserinfo(claims: Record<string, unknown> | null, status = 200) {
    vi.stubEnv("QUIKIT_URL", "https://quikit.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(claims ? JSON.stringify(claims) : "{}", { status })),
    );
  }

  it("resolves a valid OAuth access token to projectId: null + actorType 'agent', without ever trying PAT lookup", async () => {
    mockUserinfo({ sub: "oauth_user_1", tenant_id: "org_1", email: "a@example.com" });
    const seen: { userId?: string; orgId?: string; projectId?: string | null; actorType?: string } = {};
    const handler = withOrgAuth(
      async (ctx) => {
        seen.userId = ctx.userId;
        seen.orgId = ctx.orgId;
        seen.projectId = ctx.projectId;
        seen.actorType = ctx.actorType;
        return NextResponse.json({ success: true });
      },
      { allowPat: true },
    );
    const res = await handler(buildRequest(`Bearer ${OAUTH_TOKEN}`));
    expect(res.status).toBe(200);
    expect(seen).toEqual({ userId: "oauth_user_1", orgId: "org_1", projectId: null, actorType: "agent" });
    expect(mockDb.qtPersonalAccessToken.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an OAuth token quikit itself rejects, with the RFC 9728 challenge header", async () => {
    mockUserinfo(null, 401);
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowPat: true });
    const res = await handler(buildRequest(`Bearer ${OAUTH_TOKEN}`));
    expect(res.status).toBe(401);
    const wwwAuthenticate = res.headers.get("www-authenticate");
    expect(wwwAuthenticate).toContain('error="invalid_token"');
    expect(wwwAuthenticate).toContain("resource_metadata=");
  });

  it("rejects a valid OAuth token whose user is no longer an active org member", async () => {
    mockUserinfo({ sub: "oauth_user_1", tenant_id: "org_1", email: "a@example.com" });
    mockDb.orgMember.findFirst.mockResolvedValue(null);
    const handler = withOrgAuth(async () => NextResponse.json({ success: true }), { allowPat: true });
    const res = await handler(buildRequest(`Bearer ${OAUTH_TOKEN}`));
    expect(res.status).toBe(401);
  });
});

describe("withOrgAuth without allowPat — the security property this fix depends on", () => {
  it("rejects a PAT sent as a Bearer token on a route that did not opt into allowPat", async () => {
    mockValidPat();
    const handler = withOrgAuth(async () => NextResponse.json({ success: true, data: "should never run" }));
    const res = await handler(buildRequest(`Bearer ${RAW_TOKEN}`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Unauthorized" });
    // A PAT never even gets looked up on a route that didn't ask for one.
    expect(mockDb.qtPersonalAccessToken.findFirst).not.toHaveBeenCalled();
  });

  it("still authenticates a normal session-cookie caller exactly as before", async () => {
    setSession({ id: CREATED_BY, orgId: ORG, role: "owner" });
    const seen: { userId?: string; orgId?: string; actorType?: string; projectId?: string | null } = {};
    const handler = withOrgAuth(async (ctx) => {
      seen.userId = ctx.userId;
      seen.orgId = ctx.orgId;
      seen.actorType = ctx.actorType;
      seen.projectId = ctx.projectId;
      return NextResponse.json({ success: true });
    });
    const res = await handler(buildRequest());
    expect(res.status).toBe(200);
    expect(seen).toEqual({ userId: CREATED_BY, orgId: ORG, actorType: "user", projectId: undefined });
  });
});
