import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/companies/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/companies${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/companies", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_COMPANY = {
  name: "Acme Co",
  legalName: "Acme Private Limited",
  gstin: "27aaaaa0000a1z5",
  pan: "aaaaa0000a",
  address: "1 Road",
  city: "Pune",
  state: "MH",
  pincode: "411001",
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

describe("GET /api/masters/companies — withListRoute", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("lists companies scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnCompany.findMany.mockResolvedValue([
      {
        id: "co1",
        orgId: TEST_TENANT,
        name: "Acme Co",
        legalName: "Acme Private Limited",
        gstin: "27AAAAA0000A1Z5",
        pan: "AAAAA0000A",
        address: "1 Road",
        city: "Pune",
        state: "MH",
        pincode: "411001",
        status: "active",
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
      },
    ]);
    db.cnCompany.count.mockResolvedValue(1);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].name).toBe("Acme Co");
    expect(db.cnCompany.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

describe("POST /api/masters/companies — withMutationRoute", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST(VALID_COMPANY))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.org_company.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST(VALID_COMPANY))).status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ city: "Pune" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("creates a company scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnCompany.create.mockResolvedValue({
      id: "co1",
      orgId: TEST_TENANT,
      name: "Acme Co",
      legalName: "Acme Private Limited",
      gstin: "27AAAAA0000A1Z5",
      pan: "AAAAA0000A",
      address: "1 Road",
      city: "Pune",
      state: "MH",
      pincode: "411001",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });
    const res = await POST(buildPOST(VALID_COMPANY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("co1");
    const data = db.cnCompany.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
  });

  it("maps a Prisma P2002 to a 409 envelope", async () => {
    setContext(makeAdminCtx());
    db.cnCompany.create.mockRejectedValue({ code: "P2002", meta: { target: ["gstin"] } });
    const res = await POST(buildPOST(VALID_COMPANY));
    expect(res.status).toBe(409);
  });
});
