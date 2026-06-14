import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/documents/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/projects/documents${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects/documents", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function docRow(over: Record<string, unknown> = {}) {
  return {
    id: "doc1",
    documentName: "Spec",
    category: "Drawings",
    version: null,
    remarks: null,
    fileUrl: "https://x/file.pdf",
    fileName: "file.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 100,
    uploadedBy: "Admin",
    uploadedByUserId: TEST_USER,
    status: "active",
    createdAt: new Date("2026-01-01"),
    project: { code: "STE", name: "Site" },
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnProjectDocument.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/documents  (gate: construction.project.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/documents", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.project.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("returns the list scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnProjectDocument.findMany.mockResolvedValue([docRow()]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].documentName).toBe("Spec");
    expect(db.cnProjectDocument.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("applies a search filter", async () => {
    setContext(makeAdminCtx());
    db.cnProjectDocument.findMany.mockResolvedValue([]);
    await GET(buildGET("search=spec"));
    const where = db.cnProjectDocument.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/documents  (gate: construction.project.create + matrix pm.documents:add)
// ═══════════════════════════════════════════════

describe("POST /api/projects/documents", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.project.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.project.create"], {
        permissionMatrix: { "pm.documents": { add: false } },
      }),
    );
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ documentName: "Spec" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 404 when the project does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(
      buildPOST({ documentName: "Spec", category: "Drawings", projectId: "proj1", file: "https://x/f.pdf" }),
    );
    expect(res.status).toBe(404);
  });

  it("creates a document scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "proj1" });
    db.cnProjectDocument.create.mockResolvedValue(docRow());
    const res = await POST(
      buildPOST({ documentName: "Spec", category: "Drawings", projectId: "proj1", file: "https://x/file.pdf" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("doc1");
    const data = db.cnProjectDocument.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.uploadedByUserId).toBe(TEST_USER);
  });
});
