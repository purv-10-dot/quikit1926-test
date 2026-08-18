import { afterEach, describe, expect, it, vi } from "vitest";
import { looksLikeOAuthAccessToken, verifyOAuthAccessToken } from "@/lib/api/oauthToken";

const QUIKIT_URL = "https://quikit.example.com";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("looksLikeOAuthAccessToken", () => {
  it("recognizes the qk_ prefix quikit issues", () => {
    expect(looksLikeOAuthAccessToken("qk_abc123")).toBe(true);
  });
  it("rejects tokens without the prefix", () => {
    expect(looksLikeOAuthAccessToken("abc123")).toBe(false);
    expect(looksLikeOAuthAccessToken("")).toBe(false);
  });
});

describe("verifyOAuthAccessToken", () => {
  it("returns null when QUIKIT_URL is not configured", async () => {
    vi.stubEnv("QUIKIT_URL", "");
    vi.stubEnv("QUIKIT_ISSUER_URL", "");
    const result = await verifyOAuthAccessToken("qk_abc123");
    expect(result).toBeNull();
  });

  it("maps sub/tenant_id/email to userId/orgId/email on a valid userinfo response", async () => {
    vi.stubEnv("QUIKIT_URL", QUIKIT_URL);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ sub: "user_1", tenant_id: "org_1", email: "a@example.com" }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyOAuthAccessToken("qk_abc123");
    expect(result).toEqual({ userId: "user_1", orgId: "org_1", email: "a@example.com" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${QUIKIT_URL}/api/oauth/userinfo`,
      expect.objectContaining({ headers: { authorization: "Bearer qk_abc123" } }),
    );
  });

  it("returns null when quikit rejects the token", async () => {
    vi.stubEnv("QUIKIT_URL", QUIKIT_URL);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 })),
    );
    expect(await verifyOAuthAccessToken("qk_abc123")).toBeNull();
  });

  it("returns null when the response is missing a required claim", async () => {
    vi.stubEnv("QUIKIT_URL", QUIKIT_URL);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: "user_1" }), { status: 200 })),
    );
    expect(await verifyOAuthAccessToken("qk_abc123")).toBeNull();
  });

  it("returns null (not a throw) on a network failure", async () => {
    vi.stubEnv("QUIKIT_URL", QUIKIT_URL);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(verifyOAuthAccessToken("qk_abc123")).resolves.toBeNull();
  });

  it("returns null for an empty token", async () => {
    expect(await verifyOAuthAccessToken("")).toBeNull();
  });
});
