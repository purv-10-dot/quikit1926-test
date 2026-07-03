/**
 * Tests for the API-key-authenticated public API (`/api/public/*`).
 *
 * These routes do NOT use the session guard — they authenticate via the
 * `CrmApiKey` model looked up through the mocked `@/lib/db`. So instead of
 * `setSession`, we drive `db.crmApiKey.findUnique` to represent a valid /
 * inactive / unknown key.
 *
 * Covers, per app CLAUDE.md testing rules: 401 unauthenticated, 403 inactive
 * key, org-isolation (queries scoped to the key's orgId), and happy paths.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { mockDb } from "../../helpers/mockDb";
import { hashApiKey } from "@/lib/api/public-api-auth";

const db = mockDb();

const RAW_KEY = "qcrm_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const ORG_ID = "org_alpha";

function makeReq(
  url: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new Request(url, { headers }) as unknown as NextRequest;
}

/** Stub a valid, active API key resolving to ORG_ID. */
function stubValidKey(): void {
  db.crmApiKey.findUnique.mockResolvedValue({
    id: "key_1",
    orgId: ORG_ID,
    keyHash: hashApiKey(RAW_KEY),
    isActive: true,
    revokedAt: null,
  } as never);
  db.crmApiKey.update.mockResolvedValue({} as never);
}

const AUTH_BEARER = { authorization: `Bearer ${RAW_KEY}` };
const AUTH_XAPIKEY = { "x-api-key": RAW_KEY };

beforeEach(() => {
  db.crmApiKey.findUnique.mockReset();
  db.crmApiKey.update.mockReset();
});

describe("public API authentication", () => {
  it("returns 401 when no API key header is present", async () => {
    const { GET } = await import("@/app/api/public/me/route");
    const res = await GET(makeReq("http://test/api/public/me"));
    expect(res.status).toBe(401);
    expect(db.crmApiKey.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 for an unknown API key", async () => {
    db.crmApiKey.findUnique.mockResolvedValue(null as never);
    const { GET } = await import("@/app/api/public/me/route");
    const res = await GET(makeReq("http://test/api/public/me", AUTH_BEARER));
    expect(res.status).toBe(401);
  });

  it("returns 403 for an inactive key", async () => {
    db.crmApiKey.findUnique.mockResolvedValue({
      id: "key_1",
      orgId: ORG_ID,
      keyHash: hashApiKey(RAW_KEY),
      isActive: false,
      revokedAt: null,
    } as never);
    const { GET } = await import("@/app/api/public/me/route");
    const res = await GET(makeReq("http://test/api/public/me", AUTH_BEARER));
    expect(res.status).toBe(403);
  });

  it("returns 403 for a revoked key", async () => {
    db.crmApiKey.findUnique.mockResolvedValue({
      id: "key_1",
      orgId: ORG_ID,
      keyHash: hashApiKey(RAW_KEY),
      isActive: true,
      revokedAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);
    const { GET } = await import("@/app/api/public/me/route");
    const res = await GET(makeReq("http://test/api/public/me", AUTH_BEARER));
    expect(res.status).toBe(403);
  });

  it("accepts the key via the X-Api-Key header", async () => {
    stubValidKey();
    db.org.findUnique.mockResolvedValue({ id: ORG_ID, name: "Alpha" } as never);
    const { GET } = await import("@/app/api/public/me/route");
    const res = await GET(makeReq("http://test/api/public/me", AUTH_XAPIKEY));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/public/me", () => {
  it("returns orgId + orgName on a valid key", async () => {
    stubValidKey();
    db.org.findUnique.mockResolvedValue({ id: ORG_ID, name: "Alpha Inc" } as never);
    const { GET } = await import("@/app/api/public/me/route");
    const res = await GET(makeReq("http://test/api/public/me", AUTH_BEARER));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: ORG_ID, orgName: "Alpha Inc" });
  });
});

describe("GET /api/public/contacts", () => {
  it("returns 400 without count=true", async () => {
    stubValidKey();
    const { GET } = await import("@/app/api/public/contacts/route");
    const res = await GET(makeReq("http://test/api/public/contacts", AUTH_BEARER));
    expect(res.status).toBe(400);
  });

  it("counts contacts scoped to the key's org", async () => {
    stubValidKey();
    db.crmContact.count.mockResolvedValue(123 as never);
    const { GET } = await import("@/app/api/public/contacts/route");
    const res = await GET(
      makeReq("http://test/api/public/contacts?count=true", AUTH_BEARER),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 123 });
    // Org isolation: the count is scoped to the API key's org, not global.
    expect(db.crmContact.count).toHaveBeenCalledWith({
      where: { orgId: ORG_ID, deletedAt: null },
    });
  });

  it("applies the createdAfter filter as UTC midnight", async () => {
    stubValidKey();
    db.crmContact.count.mockResolvedValue(15 as never);
    const { GET } = await import("@/app/api/public/contacts/route");
    const res = await GET(
      makeReq(
        "http://test/api/public/contacts?count=true&createdAfter=2026-06-22",
        AUTH_BEARER,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 15 });
    expect(db.crmContact.count).toHaveBeenCalledWith({
      where: {
        orgId: ORG_ID,
        deletedAt: null,
        createdAt: { gte: new Date("2026-06-22T00:00:00.000Z") },
      },
    });
  });

  it("returns 400 for a malformed createdAfter", async () => {
    stubValidKey();
    const { GET } = await import("@/app/api/public/contacts/route");
    const res = await GET(
      makeReq(
        "http://test/api/public/contacts?count=true&createdAfter=June-22",
        AUTH_BEARER,
      ),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/public/deals", () => {
  it("maps opportunities into the public deal contract", async () => {
    stubValidKey();
    db.crmOpportunity.findMany.mockResolvedValue([
      {
        id: "o1",
        name: "Acme Q4",
        account: { id: "a1", name: "Acme" },
        leadId: null,
        stage: "Negotiation",
        amount: "5000.00",
        currency: "USD",
        probability: 75,
        weightedAmount: "3750.00",
        closeDate: new Date("2026-07-15T00:00:00.000Z"),
        ownerId: null,
        ownerName: null,
        lastStageChangeAt: null,
        lastActivityAt: null,
        deletedAt: null,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      {
        id: "o2",
        name: "Won deal",
        account: null,
        leadId: null,
        stage: "ClosedWon",
        amount: null,
        currency: "INR",
        probability: 100,
        weightedAmount: null,
        closeDate: null,
        ownerId: null,
        ownerName: null,
        lastStageChangeAt: null,
        lastActivityAt: null,
        deletedAt: null,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ] as never);
    db.crmOpportunity.count.mockResolvedValue(2 as never);

    const { GET } = await import("@/app/api/public/deals/route");
    const res = await GET(makeReq("http://test/api/public/deals", AUTH_BEARER));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(1);
    expect(body.items).toEqual([
      {
        id: "o1",
        amount: 5000,
        stage: "Negotiation",
        closeDate: "2026-07-15",
        createDate: "2026-06-01",
        status: "open",
      },
      {
        id: "o2",
        amount: null,
        stage: "Won",
        closeDate: null,
        createDate: "2026-05-01",
        status: "won",
      },
    ]);

    // Org isolation: only this org's non-trashed opportunities are queried.
    const call = db.crmOpportunity.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ orgId: ORG_ID, deletedAt: null });
  });
});

describe("GET /api/public/pipelines", () => {
  it("returns the canonical sales pipeline", async () => {
    stubValidKey();
    const { GET } = await import("@/app/api/public/pipelines/route");
    const res = await GET(makeReq("http://test/api/public/pipelines", AUTH_BEARER));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "sales", name: "Sales Pipeline" }]);
  });
});
