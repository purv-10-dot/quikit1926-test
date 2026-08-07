import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();

describe("GET /api/settings/company", () => {
  beforeEach(() => {
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
    db.qcfCompanyProfile.findUnique.mockReset();
    db.org.findUnique.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/settings/company/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns company profile for authenticated user", async () => {
    setSession({
      userId: "u1",
      tenantId: "t1",
      role: "Administrator",
      email: "a@x.co",
      name: "A",
    });
    db.qcfCompanyProfile.findUnique.mockResolvedValue({
      companyName: "Moreyeahs",
      logoUrl: null,
      website: null,
      phone: null,
      industry: null,
      employees: null,
    } as never);
    db.org.findUnique.mockResolvedValue({ name: "Org", logoUrl: null } as never);

    const { GET } = await import("@/app/api/settings/company/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.companyName).toBe("Moreyeahs");
  });
});

describe("PATCH /api/settings/company", () => {
  beforeEach(() => {
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
    db.qcfCompanyProfile.upsert.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { PATCH } = await import("@/app/api/settings/company/route");
    const req = new Request("http://test/api/settings/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: "Acme" }),
    });
    const res = await PATCH(req as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("upserts profile with tenantId", async () => {
    setSession({
      userId: "u1",
      tenantId: "tenant-A",
      role: "Administrator",
      email: "a@x.co",
      name: "A",
    });
    db.qcfCompanyProfile.upsert.mockResolvedValue({
      companyName: "Moreyeahs",
      industry: "IT",
      website: "https://moreyeahs.com",
      phone: "+91 999",
      employees: "100",
      logoUrl: null,
    } as never);

    const { PATCH } = await import("@/app/api/settings/company/route");
    const req = new Request("http://test/api/settings/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: "Moreyeahs",
        industry: "IT",
        website: "https://moreyeahs.com",
        phone: "+91 999",
        employees: "100",
        logoUrl: null,
      }),
    });
    const res = await PATCH(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(db.qcfCompanyProfile.upsert).toHaveBeenCalled();
    const args = db.qcfCompanyProfile.upsert.mock.calls[0]?.[0];
    expect(args?.where.tenantId).toBe("tenant-A");
  });
});
