/**
 * Tests — POST /api/oauth/register (RFC 7591 Dynamic Client Registration).
 *
 * Unauthenticated by design (no session/super-admin gate — a client has no
 * token yet at registration time). Covers validation, app resolution via
 * `resource`, public (default) vs confidential registration, and the rate
 * limiter — mirroring oauthTokenRateLimit.test.ts's pattern.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { _resetDefaultStore } from "@quikit/shared/rateLimit";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

import { POST, OPTIONS } from "@/app/api/oauth/register/route";
import { logAudit } from "@/lib/auditLog";

const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

beforeEach(() => {
  resetMockDb();
  _resetDefaultStore();
  delete process.env.REDIS_URL;
  vi.mocked(logAudit).mockClear();
});

afterEach(() => {
  if (ORIGINAL_REDIS_URL === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = ORIGINAL_REDIS_URL;
});

function registerReq(body: unknown, ip = "203.0.113.9") {
  return new NextRequest(new URL("/api/oauth/register", "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  } as never);
}

const QUIKTRACK_APP = { id: "app-qt", slug: "quiktrack", baseUrl: "http://localhost:3004" };

describe("POST /api/oauth/register", () => {
  it("rejects a missing redirect_uris", async () => {
    const res = await POST(registerReq({ resource: "http://localhost:3004/api/mcp" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_redirect_uri");
  });

  it("rejects a redirect_uris entry that isn't a valid URL", async () => {
    const res = await POST(
      registerReq({ redirect_uris: ["not-a-url"], resource: "http://localhost:3004/api/mcp" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_redirect_uri");
  });

  it("rejects a missing resource", async () => {
    const res = await POST(registerReq({ redirect_uris: ["http://localhost:*/callback"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_client_metadata");
  });

  it("rejects a resource that matches no registered app", async () => {
    mockDb.app.findMany.mockResolvedValue([QUIKTRACK_APP] as never);
    const res = await POST(
      registerReq({
        redirect_uris: ["http://localhost:*/callback"],
        resource: "http://localhost:9999/api/mcp",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_client_metadata");
    expect(body.error_description).toMatch(/resource does not match/);
  });

  it("rejects an unsupported token_endpoint_auth_method", async () => {
    mockDb.app.findMany.mockResolvedValue([QUIKTRACK_APP] as never);
    const res = await POST(
      registerReq({
        redirect_uris: ["http://localhost:*/callback"],
        resource: "http://localhost:3004/api/mcp",
        token_endpoint_auth_method: "private_key_jwt",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_client_metadata");
  });

  it("registers a public client by default (no client_secret in the response)", async () => {
    mockDb.app.findMany.mockResolvedValue([QUIKTRACK_APP] as never);
    mockDb.oAuthClient.create.mockResolvedValue({
      id: "oc-dyn-1",
      clientId: "mcp-claude-desktop-abc123",
      createdAt: new Date(),
    } as never);

    const res = await POST(
      registerReq({
        redirect_uris: ["http://localhost:*/callback"],
        resource: "http://localhost:3004/api/mcp",
        client_name: "Claude Desktop",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toMatch(/^mcp-claude-desktop-/);
    expect(body.token_endpoint_auth_method).toBe("none");
    expect(body.client_secret).toBeUndefined();
    expect(body.redirect_uris).toEqual(["http://localhost:*/callback"]);

    const createCall = mockDb.oAuthClient.create.mock.calls[0]?.[0];
    expect(createCall?.data.appId).toBe("app-qt");
    expect(createCall?.data.purpose).toBe("dynamic");
    expect(createCall?.data.clientName).toBe("Claude Desktop");
    expect(createCall?.data.clientSecret).toBeNull();

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entityType: "oauth_client", actorId: "dynamic-registration" }),
    );
  });

  it("registers a confidential client and returns a one-time plaintext secret", async () => {
    mockDb.app.findMany.mockResolvedValue([QUIKTRACK_APP] as never);
    mockDb.oAuthClient.create.mockResolvedValue({
      id: "oc-dyn-2",
      clientId: "mcp-some-tool-def456",
      createdAt: new Date(),
    } as never);

    const res = await POST(
      registerReq({
        redirect_uris: ["https://tool.example.com/callback"],
        resource: "http://localhost:3004/api/mcp",
        token_endpoint_auth_method: "client_secret_post",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(typeof body.client_secret).toBe("string");
    expect(body.client_secret.length).toBeGreaterThan(20);
    expect(body.client_secret_expires_at).toBe(0);

    const createCall = mockDb.oAuthClient.create.mock.calls[0]?.[0];
    // Hashed in DB, not plain.
    expect(createCall?.data.clientSecret).not.toBe(body.client_secret);
  });

  it("matches resource against a per-app env override, not just the DB baseUrl", async () => {
    process.env.QUIKTRACK_URL = "http://localhost:5050";
    try {
      mockDb.app.findMany.mockResolvedValue([QUIKTRACK_APP] as never);
      mockDb.oAuthClient.create.mockResolvedValue({
        id: "oc-dyn-3",
        clientId: "mcp-client-x",
        createdAt: new Date(),
      } as never);

      const res = await POST(
        registerReq({
          redirect_uris: ["http://localhost:*/callback"],
          resource: "http://localhost:5050/api/mcp",
        }),
      );
      expect(res.status).toBe(201);
    } finally {
      delete process.env.QUIKTRACK_URL;
    }
  });

  it("rate-limits registration attempts per IP block", async () => {
    mockDb.app.findMany.mockResolvedValue([QUIKTRACK_APP] as never);
    mockDb.oAuthClient.create.mockResolvedValue({
      id: "oc-dyn-rl",
      clientId: "mcp-rl-test",
      createdAt: new Date(),
    } as never);

    const IP = "198.51.100.77";
    const body = { redirect_uris: ["http://localhost:*/callback"], resource: "http://localhost:3004/api/mcp" };

    const results: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await POST(registerReq(body, IP));
      results.push(r.status);
    }
    expect(results.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(results[10]).toBe(429);
  });
});

describe("CORS on /api/oauth/register", () => {
  it("OPTIONS returns a 204 preflight response with CORS headers", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("includes CORS headers on the real POST response", async () => {
    mockDb.app.findMany.mockResolvedValue([QUIKTRACK_APP] as never);
    const res = await POST(
      registerReq({ redirect_uris: ["http://localhost:*/callback"], resource: "http://localhost:3004/api/mcp" }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
