import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

vi.mock("@/lib/storage/documents", () => ({
  saveCrmUpload: vi.fn().mockResolvedValue({
    storageKey: "crm-documents/l1/1700000000000-file.pdf",
    publicUrl: "https://quikit-bucket.s3.ap-south-1.amazonaws.com/crm-documents/l1/1700000000000-file.pdf",
    size: 50,
    safeName: "file.pdf",
    contentType: "application/pdf",
  }),
  getCrmUploadDownloadUrl: vi.fn().mockResolvedValue("https://signed.example/file"),
  deleteCrmUpload: vi.fn(),
  resolveDocumentPublicUrl: (key: string) =>
    `https://quikit-bucket.s3.ap-south-1.amazonaws.com/${key}`,
  isAllowedMime: () => true,
  MAX_FILE_BYTES: 25 * 1024 * 1024,
}));

function adminSession() {
  setSession({
    userId: "u1",
    tenantId: "t1",
    role: "Administrator",
    email: "a@b.co",
    name: "Alice",
  });
}

describe("GET /api/leads/[id]/attachments", () => {
  beforeEach(() => {
    db.qcfLead.findFirst.mockReset();
    db.qcfDocument.findMany.mockReset();
    db.orgMember.findMany.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/leads/[id]/attachments/route");
    const res = await GET(new NextRequest("http://test/api/leads/l1/attachments"), {
      params: Promise.resolve({ id: "l1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when lead is missing", async () => {
    adminSession();
    db.qcfLead.findFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/leads/[id]/attachments/route");
    const res = await GET(new NextRequest("http://test/api/leads/l1/attachments"), {
      params: Promise.resolve({ id: "l1" }),
    });
    expect(res.status).toBe(404);
  });

  it("lists attachments for a lead", async () => {
    adminSession();
    db.qcfLead.findFirst.mockResolvedValue({ accountId: null } as never);
    db.qcfDocument.findMany.mockResolvedValue([
      {
        id: "d1",
        tenantId: "t1",
        refType: "lead",
        refId: "l1",
        fileName: "card.png",
        contentType: "image/png",
        size: 10,
        storageKey: "crm-documents/l1/1-x.png",
        uploadedBy: "u1",
        createdAt: new Date(),
        deletedAt: null,
      },
    ] as never);
    db.orgMember.findMany.mockResolvedValue([
      { userId: "u1", user: { firstName: "Alice", lastName: "", email: "a@b.co" } },
    ] as never);

    const { GET } = await import("@/app/api/leads/[id]/attachments/route");
    const res = await GET(new NextRequest("http://test/api/leads/l1/attachments"), {
      params: Promise.resolve({ id: "l1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].url).toContain("crm-documents/l1");
    expect(body.data[0].downloadUrl).toBe("/api/leads/l1/attachments/d1/download");
  });
});
