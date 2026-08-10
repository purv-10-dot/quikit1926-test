import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

vi.mock("@/lib/storage/documents", () => ({
  saveCrmUpload: vi.fn(),
  getCrmUploadDownloadUrl: vi.fn(),
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

describe("GET /api/documents", () => {
  beforeEach(() => {
    db.crmDocument.findMany.mockReset();
    db.crmDocument.count.mockReset();
    db.orgMember.findMany.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new Request("http://test/api/documents") as never);
    expect(res.status).toBe(401);
  });

  it("returns tenant-scoped paginated list", async () => {
    adminSession();
    db.crmDocument.findMany.mockResolvedValue([
      {
        id: "d1",
        tenantId: "t1",
        refType: "lead",
        refId: "l1",
        fileName: "kyc.pdf",
        contentType: "application/pdf",
        size: 100,
        storageKey: "crm-documents/l1/1-kyc.pdf",
        folderId: null,
        uploadedBy: "u1",
        createdAt: new Date("2026-01-01"),
        deletedAt: null,
      },
    ] as never);
    db.crmDocument.count.mockResolvedValue(1);
    db.orgMember.findMany.mockResolvedValue([
      { userId: "u1", user: { firstName: "Alice", lastName: "", email: "a@b.co" } },
    ] as never);
    db.crmLead.findMany.mockResolvedValue([{ id: "l1", name: "Acme Lead" }] as never);

    const { GET } = await import("@/app/api/documents/route");
    const res = await GET(new Request("http://test/api/documents?page=1") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].fileName).toBe("kyc.pdf");
    expect(body.data.items[0].url).toContain("crm-documents/l1");
    expect(body.data.items[0].downloadUrl).toBe("/api/documents/d1/download");
    expect(db.crmDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1", deletedAt: null }),
      }),
    );
  });
});
