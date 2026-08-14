/**
 * Tests — public (PKCE-only) OAuth clients on /authorize and /token.
 *
 * Confirms the two changes made to unblock MCP clients (Claude Desktop,
 * Cursor, etc.), which are public clients by nature: no shared secret is
 * required when the registered OAuthClient has none, and PKCE becomes
 * mandatory (not just optional) in that case. Confidential-client behavior
 * (the existing 13 first-party apps) is covered by the pre-existing
 * oauthAuthorizeAccess.test.ts / oauthTokenRateLimit.test.ts and is
 * deliberately not re-asserted here.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(async () => ({ sessionId: "sess-1" })),
}));

import { GET as authorize } from "@/app/api/oauth/authorize/route";
import { POST as token } from "@/app/api/oauth/token/route";

const CLIENT_ID = "quiktrack-mcp-test";
const REDIRECT_URI = "http://localhost:53219/callback";
const REDIRECT_URI_WILDCARD = "http://localhost:*/callback";

function authorizeReq(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/oauth/authorize");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function tokenReq(body: Record<string, string>) {
  return new NextRequest(new URL("/api/oauth/token", "http://localhost:3000"), {
    method: "POST",
    body: new URLSearchParams(body),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  } as never);
}

beforeEach(() => {
  resetMockDb();
  // No App is linked to this test client — skips the app-access gate
  // entirely, which is irrelevant to what these tests exercise.
  mockDb.app.findFirst.mockResolvedValue(null);
});

describe("GET /api/oauth/authorize — public client", () => {
  const BASE_PARAMS = {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    state: "xyz",
  };

  it("rejects a public client's request with no code_challenge", async () => {
    setSession({ id: "user-1", email: "u@test.com", orgId: "org-1" });
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      redirectUris: [REDIRECT_URI_WILDCARD],
      scopes: ["openid"],
      clientSecret: null,
    } as never);

    const res = await authorize(authorizeReq(BASE_PARAMS));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
    expect(mockDb.oAuthCode.create).not.toHaveBeenCalled();
  });

  it("issues a code for a public client that sends a code_challenge, against a wildcard-port redirect_uri", async () => {
    setSession({ id: "user-1", email: "u@test.com", orgId: "org-1" });
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      redirectUris: [REDIRECT_URI_WILDCARD],
      scopes: ["openid"],
      clientSecret: null,
    } as never);
    mockDb.oAuthCode.create.mockResolvedValue({} as never);

    const res = await authorize(
      authorizeReq({ ...BASE_PARAMS, code_challenge: "abc123", code_challenge_method: "S256" }),
    );

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("code")).toBeTruthy();
    expect(mockDb.oAuthCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ codeChallenge: "abc123", redirectUri: REDIRECT_URI }),
      }),
    );
  });

  it("rejects a redirect_uri that doesn't match the registered wildcard pattern", async () => {
    setSession({ id: "user-1", email: "u@test.com", orgId: "org-1" });
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      redirectUris: [REDIRECT_URI_WILDCARD],
      scopes: ["openid"],
      clientSecret: null,
    } as never);

    const res = await authorize(
      authorizeReq({ ...BASE_PARAMS, redirect_uri: "http://localhost:53219/wrong-path", code_challenge: "abc123" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toMatch(/redirect_uri not registered/);
  });
});

describe("POST /api/oauth/token — public client", () => {
  function mockValidCode(overrides: Partial<Record<string, unknown>> = {}) {
    mockDb.oAuthCode.findUnique.mockResolvedValue({
      id: "code-1",
      code: "the-code",
      clientId: CLIENT_ID,
      userId: "user-1",
      orgId: "org-1",
      scopes: ["openid"],
      codeChallenge: null,
      codeChallengeMethod: null,
      redirectUri: REDIRECT_URI,
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
      sessionId: "sess-1",
      ...overrides,
    } as never);
  }

  beforeEach(() => {
    mockDb.oAuthClient.findUnique.mockResolvedValue({
      clientSecret: null,
      scopes: ["openid"],
    } as never);
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "u@test.com",
      firstName: "Test",
      lastName: "User",
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  });

  it("issues tokens without a client_secret when PKCE verifies", async () => {
    const codeVerifier = "test-verifier-1234567890";
    const crypto = await import("node:crypto");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    mockValidCode({ codeChallenge, codeChallengeMethod: "S256" });
    mockDb.oAuthCode.update.mockResolvedValue({} as never);
    mockDb.oAuthRefreshToken.create.mockResolvedValue({} as never);

    const res = await token(
      tokenReq({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code: "the-code",
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toMatch(/^qk_/);
    expect(body.token_type).toBe("Bearer");
  });

  it("rejects a public client's code that was never issued a code_challenge", async () => {
    mockValidCode({ codeChallenge: null });

    const res = await token(
      tokenReq({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code: "the-code",
        redirect_uri: REDIRECT_URI,
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toMatch(/PKCE required for public clients/);
    expect(mockDb.oAuthRefreshToken.create).not.toHaveBeenCalled();
  });

  it("rejects a wrong code_verifier the same as it would for a confidential client", async () => {
    const codeChallenge = "expected-challenge-value";
    mockValidCode({ codeChallenge, codeChallengeMethod: "S256" });

    const res = await token(
      tokenReq({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code: "the-code",
        redirect_uri: REDIRECT_URI,
        code_verifier: "wrong-verifier",
      }),
    );

    expect(res.status).toBe(400);
    expect(mockDb.oAuthRefreshToken.create).not.toHaveBeenCalled();
  });
});
