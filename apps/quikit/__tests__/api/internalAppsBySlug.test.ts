import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";

import { GET } from "@/app/api/internal/apps/[slug]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = "test-internal-secret";

function makeRequest(secret?: string | null) {
  const headers = new Headers();
  if (secret !== null && secret !== undefined) headers.set("x-internal-secret", secret);
  return new NextRequest(new URL("http://localhost:3006/api/internal/apps/quikscale"), {
    method: "GET",
    headers,
  } as never);
}

function call(slug: string, secret?: string | null) {
  return GET(makeRequest(secret), { params: { slug } });
}

const PRODUCT_APP = {
  id: "app-1",
  slug: "quikscale",
  name: "QuikScale",
  description: "Strategy execution",
  iconUrl: "/app-icons/quikscale.svg",
  baseUrl: "https://uatscale.quikit.ai",
  status: "active",
  requiresOrgAdmin: false,
  oauthClient: { clientId: "client-abc" },
};

const OPS_APP = {
  ...PRODUCT_APP,
  id: "app-2",
  slug: "admin",
  name: "Admin Portal",
  baseUrl: "https://uatorgadmin.quikit.ai",
  requiresOrgAdmin: true,
};

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/internal/apps/[slug]", () => {
  const originalSecret = process.env.INTERNAL_SECRET;

  beforeEach(() => {
    resetMockDb();
    process.env.INTERNAL_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.INTERNAL_SECRET;
    else process.env.INTERNAL_SECRET = originalSecret;
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when the x-internal-secret header is absent", async () => {
    const res = await call("quikscale", null);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    // Must not reach the DB on an unauthenticated call.
    expect(mockDb.app.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when the x-internal-secret header is wrong", async () => {
    const res = await call("quikscale", "not-the-secret");
    expect(res.status).toBe(401);
    expect(mockDb.app.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed with 500 when INTERNAL_SECRET is not configured", async () => {
    delete process.env.INTERNAL_SECRET;
    const res = await call("quikscale", "anything");
    expect(res.status).toBe(500);
    expect(mockDb.app.findUnique).not.toHaveBeenCalled();
  });

  // ── Ops-surface exclusion ─────────────────────────────────────────────────

  it("treats a requiresOrgAdmin app as non-existent (404, not 403)", async () => {
    mockDb.app.findUnique.mockResolvedValue(OPS_APP as never);

    const res = await call("admin", SECRET);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    // The response must not disclose the app's existence or its baseUrl.
    expect(JSON.stringify(body)).not.toContain("uatorgadmin");
    expect(JSON.stringify(body)).not.toContain("Admin Portal");
  });

  it("returns the same 404 shape for an unknown slug as for an ops surface", async () => {
    mockDb.app.findUnique.mockResolvedValue(null as never);
    const unknown = await call("does-not-exist", SECRET);

    mockDb.app.findUnique.mockResolvedValue(OPS_APP as never);
    const ops = await call("admin", SECRET);

    expect(unknown.status).toBe(ops.status);
    // Both messages are slug-echoing only — indistinguishable in kind, so a
    // caller cannot use the response to enumerate which apps are ops surfaces.
    const unknownBody = await unknown.json();
    const opsBody = await ops.json();
    expect(unknownBody.error).toBe("No routable app with slug 'does-not-exist'");
    expect(opsBody.error).toBe("No routable app with slug 'admin'");
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns slug -> baseUrl for a routable product app", async () => {
    mockDb.app.findUnique.mockResolvedValue(PRODUCT_APP as never);

    const res = await call("quikscale", SECRET);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      slug: "quikscale",
      name: "QuikScale",
      baseUrl: "https://uatscale.quikit.ai",
      status: "active",
      hasOAuthClient: true,
    });
    expect(mockDb.app.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "quikscale" } }),
    );
  });

  it("never leaks OAuth credentials — only a presence flag", async () => {
    mockDb.app.findUnique.mockResolvedValue(PRODUCT_APP as never);

    const res = await call("quikscale", SECRET);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("client-abc");
    expect(raw).not.toContain("clientSecret");
    expect(raw).toContain("hasOAuthClient");
  });

  it("reports hasOAuthClient=false when the app has no OAuth client", async () => {
    mockDb.app.findUnique.mockResolvedValue({ ...PRODUCT_APP, oauthClient: null } as never);

    const res = await call("quikscale", SECRET);
    const body = await res.json();
    expect(body.data.hasOAuthClient).toBe(false);
  });

  it("returns a non-active app rather than filtering it, so the caller decides", async () => {
    mockDb.app.findUnique.mockResolvedValue({ ...PRODUCT_APP, status: "suspended" } as never);

    const res = await call("quikscale", SECRET);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("suspended");
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 422 for a blank slug", async () => {
    const res = await call("   ", SECRET);
    expect(res.status).toBe(422);
    expect(mockDb.app.findUnique).not.toHaveBeenCalled();
  });
});
