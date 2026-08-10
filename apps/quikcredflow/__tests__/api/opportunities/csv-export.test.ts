import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";
import { accountScopeFilter } from "@/lib/auth/account-acl";

const db = mockDb();
const BOM = "﻿";

async function readBodyWithBom(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
}

describe("GET /api/opportunities?format=csv", () => {
  beforeEach(() => {
    db.qcfOpportunity.findMany.mockReset();
    db.qcfOpportunity.count.mockReset();
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
    vi.mocked(accountScopeFilter).mockReset();
    vi.mocked(accountScopeFilter).mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/opportunities/route");
    const req = new Request("http://test/api/opportunities?format=csv");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns 403 when reports.export is denied", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser", email: "u@x.co", name: "U" });
    vi.mocked(assertModule).mockImplementation(async (_user, module, action) => {
      if (module === "reports" && action === "export") {
        const err = new Error("Forbidden: export on reports") as Error & { statusCode?: number };
        err.statusCode = 403;
        throw err;
      }
      return undefined;
    });

    const { GET } = await import("@/app/api/opportunities/route");
    const req = new Request("http://test/api/opportunities?format=csv");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Export permission required" });
  });

  it("streams CSV with curated columns on happy path", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    db.qcfOpportunity.findMany.mockResolvedValueOnce([
      {
        id: "o1",
        name: "Acme Q4",
        account: { name: "Acme" },
        leadId: null,
        stage: "Prospecting",
        amount: "100000.00",
        currency: "INR",
        probability: 25,
        weightedAmount: "25000.00",
        closeDate: null,
        ownerName: "Sales Owner",
        createdAt: new Date("2025-01-15T10:00:00Z"),
      } as never,
    ]);
    db.qcfOpportunity.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/opportunities/route");
    const req = new Request("http://test/api/opportunities?format=csv");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);

    const body = await readBodyWithBom(res as unknown as Response);
    expect(body.startsWith(BOM)).toBe(true);
    const lines = body.slice(BOM.length).split("\r\n").filter(Boolean);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Account");
    expect(lines[0]).toContain("Stage");
    expect(lines[1]).toContain("Acme Q4");
    expect(lines[1]).toContain("Acme");
    expect(lines[1]).toContain("100000");
  });

  it("forwards account ACL filter into the cursor query", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser", email: "u@x.co", name: "U" });
    vi.mocked(accountScopeFilter).mockResolvedValueOnce({
      OR: [{ accountId: { in: ["acct-allowed"] } }, { accountId: null }],
    });
    db.qcfOpportunity.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/opportunities/route");
    const req = new Request("http://test/api/opportunities?format=csv");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const call = db.qcfOpportunity.findMany.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const where = call!.where as Record<string, unknown>;
    expect(where.orgId).toBe("t1");
    // The ACL clause is merged into the same where (spread) — its OR
    // restriction should appear at the top level.
    expect(where.OR).toEqual([
      { accountId: { in: ["acct-allowed"] } },
      { accountId: null },
    ]);
  });
});
