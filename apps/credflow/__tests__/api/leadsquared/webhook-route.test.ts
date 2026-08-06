import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { NextRequest } from "next/server";
import type { CrmLead } from "@quikit/database";

const asLead = (partial: Partial<CrmLead>): CrmLead => partial as unknown as CrmLead;

const db = mockDb();

const URL = "http://test/api/leadsquared/webhook";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const ENV_KEYS = [
  "LEADSQUARED_WEBHOOK_SECRET",
  "WEBHOOK_REQUIRE_SECRET",
  "LEADSQUARED_DEFAULT_ORG_ID",
  "REDIS_URL",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  delete process.env.REDIS_URL; // force the inline path
  process.env.LEADSQUARED_DEFAULT_ORG_ID = "shield";
  delete process.env.LEADSQUARED_WEBHOOK_SECRET;
  delete process.env.WEBHOOK_REQUIRE_SECRET;
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("POST /api/leadsquared/webhook", () => {
  it("returns 200 for an empty verification payload and does NOT process", async () => {
    const { POST } = await import("@/app/api/leadsquared/webhook/route");
    const res = await POST(post({}));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, verification: true });
    expect(db.leadSquaredSyncMap.findFirst).not.toHaveBeenCalled();
    expect(db.crmLead.upsert).not.toHaveBeenCalled();
  });

  it("returns 200 for an empty payload EVEN when a secret is required (verification must pass)", async () => {
    process.env.LEADSQUARED_WEBHOOK_SECRET = "s3cret";
    process.env.WEBHOOK_REQUIRE_SECRET = "true";
    const { POST } = await import("@/app/api/leadsquared/webhook/route");

    const res = await POST(post({})); // empty, no secret header
    expect(res.status).toBe(200);
  });

  it("rejects a missing secret when the secret is required", async () => {
    process.env.LEADSQUARED_WEBHOOK_SECRET = "s3cret";
    process.env.WEBHOOK_REQUIRE_SECRET = "true";
    const { POST } = await import("@/app/api/leadsquared/webhook/route");

    const res = await POST(post({ ProspectID: "P1", EmailAddress: "a@b.co" }));
    expect(res.status).toBe(401);
    expect(db.crmLead.upsert).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret when the secret is required", async () => {
    process.env.LEADSQUARED_WEBHOOK_SECRET = "s3cret";
    process.env.WEBHOOK_REQUIRE_SECRET = "true";
    const { POST } = await import("@/app/api/leadsquared/webhook/route");

    const res = await POST(
      post({ ProspectID: "P1", EmailAddress: "a@b.co" }, { "x-webhook-secret": "wrong" }),
    );
    expect(res.status).toBe(401);
  });

  it("processes inline (Redis disabled) with a valid secret and returns 200", async () => {
    process.env.LEADSQUARED_WEBHOOK_SECRET = "s3cret";
    process.env.WEBHOOK_REQUIRE_SECRET = "true";
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.crmLead.upsert.mockResolvedValue(asLead({ id: "lead-new", tenantId: "shield" }));

    const { POST } = await import("@/app/api/leadsquared/webhook/route");
    const res = await POST(
      post(
        { ProspectID: "P1", FirstName: "Ann", EmailAddress: "a@b.co", Phone: "+919000000000" },
        { "x-webhook-secret": "s3cret" },
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: "created", crmLeadId: "lead-new" });
    expect(db.leadSquaredSyncMap.upsert).toHaveBeenCalled();
    expect(db.leadSquaredSyncMap.upsert.mock.calls[0][0].create).toMatchObject({
      syncOrigin: "leadsquared",
    });
  });

  it("allows processing in dev when no secret is configured (not required)", async () => {
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.crmLead.upsert.mockResolvedValue(asLead({ id: "lead-dev", tenantId: "shield" }));

    const { POST } = await import("@/app/api/leadsquared/webhook/route");
    const res = await POST(post({ ProspectID: "P2", EmailAddress: "d@e.co" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: "created" });
  });

  it("REQUIRES a secret in a non-dev/test environment even without WEBHOOK_REQUIRE_SECRET", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const savedEnv = mutableEnv.NODE_ENV;
    // Simulate staging/preview: NODE_ENV is neither development nor test.
    mutableEnv.NODE_ENV = "staging";
    try {
      const { POST } = await import("@/app/api/leadsquared/webhook/route");
      // No secret configured on the server → fail closed (503).
      const res = await POST(post({ ProspectID: "P3", EmailAddress: "s@e.co" }));
      expect(res.status).toBe(503);
      expect(db.crmLead.upsert).not.toHaveBeenCalled();
    } finally {
      mutableEnv.NODE_ENV = savedEnv;
    }
  });

  it("rejects an oversized payload with 413", async () => {
    const { POST } = await import("@/app/api/leadsquared/webhook/route");
    const req = new Request(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(5_000_000) },
      body: JSON.stringify({ ProspectID: "P4" }),
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("processes a batch array and returns a batch summary", async () => {
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.crmLead.findUnique.mockResolvedValue(null);
    db.crmLead.upsert
      .mockResolvedValueOnce(asLead({ id: "lead-a", tenantId: "shield" }))
      .mockResolvedValueOnce(asLead({ id: "lead-b", tenantId: "shield" }));

    const { POST } = await import("@/app/api/leadsquared/webhook/route");
    const res = await POST(
      post([
        { ProspectID: "PB-1", EmailAddress: "b1@e.co" },
        { ProspectID: "PB-2", EmailAddress: "b2@e.co" },
      ]),
    );

    expect(res.status).toBe(200);
    const bodyJson = await res.json();
    expect(bodyJson).toMatchObject({ ok: true, batch: true });
    expect(bodyJson.results).toHaveLength(2);
  });
});
