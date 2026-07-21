import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

// Stub disk I/O so the route logic (auth, scope, validation, DB) is tested
// without touching the filesystem.
vi.mock("@/lib/api/invoiceStorage", () => ({
  MAX_INVOICE_BYTES: 10 * 1024 * 1024,
  ALLOWED_INVOICE_TYPES: { "application/pdf": "pdf", "image/png": "png" },
  buildInvoiceKey: (orgId: string, assetId: string, ext: string) => `${orgId}/${assetId}/fixed.${ext}`,
  saveInvoice: vi.fn(async () => {}),
  readInvoice: vi.fn(async () => Buffer.from("PDFBYTES")),
  deleteInvoice: vi.fn(async () => {}),
}));

import { GET, POST, DELETE } from "@/app/api/assets/[id]/invoice/route";

function grantAll() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockResolvedValue({ id: "perm" } as never);
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
function grantViewOnly() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action === "view" ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}

const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };

function uploadReq(file: File | null) {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new NextRequest("http://localhost/api/assets/a1/invoice", { method: "POST", body: fd });
}
const getReq = (q = "") => new NextRequest(`http://localhost/api/assets/a1/invoice${q}`);

describe("POST /api/assets/[id]/invoice — upload", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(uploadReq(new File(["x"], "i.pdf", { type: "application/pdf" })), { params: { id: "a1" } });
    expect(res.status).toBe(401);
  });

  it("403s a caller without Asset:update", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantViewOnly();
    const res = await POST(uploadReq(new File(["x"], "i.pdf", { type: "application/pdf" })), { params: { id: "a1" } });
    expect(res.status).toBe(403);
  });

  it("400s when no file is provided", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", invoiceFileKey: null, itemName: "L", itemCode: "C" } as never);
    const res = await POST(uploadReq(null), { params: { id: "a1" } });
    expect(res.status).toBe(400);
  });

  it("400s a disallowed file type", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", invoiceFileKey: null, itemName: "L", itemCode: "C" } as never);
    const res = await POST(uploadReq(new File(["x"], "note.txt", { type: "text/plain" })), { params: { id: "a1" } });
    expect(res.status).toBe(400);
    expect(mockDb.astAsset.update).not.toHaveBeenCalled();
  });

  it("saves a valid PDF and records file metadata on the asset", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", invoiceFileKey: null, itemName: "L", itemCode: "C" } as never);
    mockDb.astAsset.update.mockResolvedValue({ id: "a1" } as never);
    const res = await POST(uploadReq(new File(["PDF"], "invoice.pdf", { type: "application/pdf" })), { params: { id: "a1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astAsset.update.mock.calls[0]?.[0] as { data: { invoiceFileKey: string; invoiceFileName: string; invoiceFileType: string } };
    expect(call.data.invoiceFileName).toBe("invoice.pdf");
    expect(call.data.invoiceFileType).toBe("application/pdf");
    expect(call.data.invoiceFileKey).toContain("org1/a1/");
  });
});

describe("GET /api/assets/[id]/invoice — download/preview", () => {
  beforeEach(() => resetMockDb());

  it("404s when the asset has no invoice", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", invoiceFileKey: null, invoiceFileName: null, invoiceFileType: null } as never);
    const res = await GET(getReq(), { params: { id: "a1" } });
    expect(res.status).toBe(404);
  });

  it("streams the file with its content-type for a viewAll holder", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", invoiceFileKey: "org1/a1/fixed.pdf", invoiceFileName: "invoice.pdf", invoiceFileType: "application/pdf" } as never);
    const res = await GET(getReq(), { params: { id: "a1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
  });

  it("404s a non-viewAll caller for an asset not assigned to them (tenant/row scope)", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantViewOnly();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", invoiceFileKey: "org1/a1/fixed.pdf", invoiceFileName: "i.pdf", invoiceFileType: "application/pdf" } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAssignment.findMany.mockResolvedValue([] as never); // not assigned a1
    const res = await GET(getReq(), { params: { id: "a1" } });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/assets/[id]/invoice — remove", () => {
  beforeEach(() => resetMockDb());

  it("clears the invoice columns", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", invoiceFileKey: "org1/a1/fixed.pdf", itemName: "L", itemCode: "C" } as never);
    mockDb.astAsset.update.mockResolvedValue({ id: "a1" } as never);
    const res = await DELETE(new NextRequest("http://localhost/api/assets/a1/invoice", { method: "DELETE" }), { params: { id: "a1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astAsset.update.mock.calls[0]?.[0] as { data: { invoiceFileKey: null } };
    expect(call.data.invoiceFileKey).toBeNull();
  });
});
