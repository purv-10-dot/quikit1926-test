import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/banks/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/banks${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/banks", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BANK = {
  bankName: "HDFC",
  accountNo: "00112233",
  ifscCode: "HDFC0001234",
  accountType: "current",
  companyId: "co1",
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

describe("GET /api/masters/banks — withListRoute", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("lists banks scoped to the org with the company joined", async () => {
    setContext(makeAdminCtx());
    db.cnBank.findMany.mockResolvedValue([
      {
        id: "b1",
        orgId: TEST_TENANT,
        bankName: "HDFC",
        accountNo: "1",
        ifscCode: "HDFC0001234",
        accountType: "current",
        companyId: "co1",
        company: { name: "Acme Co" },
        status: "active",
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].companyName).toBe("Acme Co");
    expect(db.cnBank.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

describe("POST /api/masters/banks — withMutationRoute", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST(VALID_BANK))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([])); // any authed user, but no create perm
    expect((await POST(buildPOST(VALID_BANK))).status).toBe(403);
  });

  it("returns 400 when a required field is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ accountNo: "1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("creates a bank scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnBank.create.mockResolvedValue({
      id: "b1",
      orgId: TEST_TENANT,
      ...VALID_BANK,
      company: { name: "Acme Co" },
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });
    const res = await POST(buildPOST(VALID_BANK));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("b1");
    const data = db.cnBank.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.ifscCode).toBe("HDFC0001234"); // upper-cased
  });

  it("maps a Prisma P2002 to a 409 envelope", async () => {
    setContext(makeAdminCtx());
    db.cnBank.create.mockRejectedValue({ code: "P2002", meta: { target: ["accountNo"] } });
    const res = await POST(buildPOST(VALID_BANK));
    expect(res.status).toBe(409);
  });
});
