/**
 * API tests for GET /api/email/mailbox/callback.
 *
 * Regression: the redirect_uri registered with Azure carries NO query string
 * (AADSTS50011 on any mismatch). So the callback must (a) derive the provider
 * from the HMAC-signed `state`, not `?provider=`, and (b) exchange the code
 * against a query-less redirect URI. Covers: state-derived provider happy path,
 * query-less redirect_uri on exchange, legacy `?provider=` agreement + mismatch,
 * and invalid state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Hoisted so the (hoisted) vi.mock factories below can safely reference them.
const { exchangeCode, getProfileEmail, saveConnection } = vi.hoisted(() => ({
  exchangeCode: vi.fn(async () => ({
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: undefined,
    scope: "Mail.Read",
  })),
  getProfileEmail: vi.fn(async () => "rep@company.com"),
  saveConnection: vi.fn(async () => undefined),
}));

// No DB session for these; the callback trusts the signed state.
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/services/email/providers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/email/providers")>(
    "@/lib/services/email/providers",
  );
  return {
    ...actual,
    getProvider: () => ({ exchangeCode, getProfileEmail }),
  };
});
vi.mock("@/lib/services/email/mailbox", () => ({ saveConnection }));

import { GET } from "@/app/api/email/mailbox/callback/route";
import { signState } from "@/lib/services/email/oauth-state";

const BASE = "http://localhost:3008";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_APP_URL = BASE;
  delete process.env.MAILBOX_OAUTH_REDIRECT_BASE;
});

function callbackReq(params: Record<string, string>): NextRequest {
  const u = new URL(`${BASE}/api/email/mailbox/callback`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new NextRequest(u);
}

function loc(res: Response): string {
  return res.headers.get("location") ?? "";
}

describe("GET /api/email/mailbox/callback", () => {
  it("derives the provider from the signed state (no ?provider= needed) and connects", async () => {
    const state = signState({ userId: "u1", orgId: "o1", provider: "microsoft", nonce: "n" });
    const res = await GET(callbackReq({ code: "abc", state }));
    expect(loc(res)).toContain("connected=1");
    expect(saveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", orgId: "o1", provider: "microsoft" }),
    );
  });

  it("exchanges the code against a QUERY-LESS redirect_uri (Azure exact match)", async () => {
    const state = signState({ userId: "u1", orgId: "o1", provider: "microsoft", nonce: "n" });
    await GET(callbackReq({ code: "abc", state }));
    expect(exchangeCode).toHaveBeenCalledWith({
      code: "abc",
      redirectUri: `${BASE}/api/email/mailbox/callback`,
    });
  });

  it("accepts a legacy ?provider= that agrees with the state", async () => {
    const state = signState({ userId: "u1", orgId: "o1", provider: "microsoft", nonce: "n" });
    const res = await GET(callbackReq({ code: "abc", state, provider: "microsoft" }));
    expect(loc(res)).toContain("connected=1");
  });

  it("rejects a legacy ?provider= that disagrees with the state", async () => {
    const state = signState({ userId: "u1", orgId: "o1", provider: "microsoft", nonce: "n" });
    const res = await GET(callbackReq({ code: "abc", state, provider: "gmail" }));
    expect(loc(res)).toContain("error=provider_mismatch");
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("redirects to invalid_state on a tampered state", async () => {
    const res = await GET(callbackReq({ code: "abc", state: "garbage.sig" }));
    expect(loc(res)).toContain("error=invalid_state");
  });
});
