import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();
const BOM = "﻿";

async function readBodyWithBom(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
}

describe("GET /api/leads?format=csv", () => {
  beforeEach(() => {
    db.crmLead.findMany.mockReset();
    db.crmLead.count.mockReset();
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/leads/route");
    const req = new Request("http://test/api/leads?format=csv");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns 403 with the spec'd error body when reports.export is denied", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser", email: "u@x.co", name: "U" });
    vi.mocked(assertModule).mockImplementation(async (_user, module, action) => {
      if (module === "reports" && action === "export") {
        const err = new Error("Forbidden: export on reports") as Error & { statusCode?: number };
        err.statusCode = 403;
        throw err;
      }
      return undefined;
    });

    const { GET } = await import("@/app/api/leads/route");
    const req = new Request("http://test/api/leads?format=csv");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: "Export permission required" });
  });

  it("streams CSV with BOM + matching header row on the happy path", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    db.crmLead.findMany.mockResolvedValueOnce([
      {
        id: "l1",
        name: "Alice",
        email: "alice@x.co",
        phone: null,
        mobile: "+911234567890",
        company: "Acme",
        source: "Web",
        stage: "New",
        status: "Open",
        ownerName: "Owner",
        score: 50,
        country: "IN",
        createdAt: new Date("2025-01-15T10:00:00Z"),
        updatedAt: new Date("2025-01-15T10:00:00Z"),
      } as never,
    ]);
    // Second findMany call (cursor next page) returns empty → streaming ends.
    db.crmLead.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/leads/route");
    const req = new Request("http://test/api/leads?format=csv");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toMatch(/leads-\d{4}-\d{2}-\d{2}\.csv/);

    const body = await readBodyWithBom(res as unknown as Response);
    expect(body.startsWith(BOM)).toBe(true);
    const lines = body.slice(BOM.length).split("\r\n").filter(Boolean);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Email");
    expect(lines[0]).toContain("Owner");
    expect(lines[1]).toContain("Alice");
    expect(lines[1]).toContain("alice@x.co");
  });

  it("filters by tenant — findMany receives the caller's tenantId in where", async () => {
    setSession({ userId: "u1", tenantId: "tenant-A", role: "Administrator", email: "a@x.co", name: "A" });
    db.crmLead.findMany.mockResolvedValueOnce([]);

    const { GET } = await import("@/app/api/leads/route");
    const req = new Request("http://test/api/leads?format=csv");
    await GET(req as unknown as import("next/server").NextRequest);

    expect(db.crmLead.findMany).toHaveBeenCalled();
    const call = db.crmLead.findMany.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect((call!.where as Record<string, unknown>).tenantId).toBe("tenant-A");
  });
});
