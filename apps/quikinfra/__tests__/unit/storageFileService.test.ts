import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";

// ─── Mock the storage driver factory so no real S3/local IO occurs ───
const driverMock = {
  kind: "local",
  bucket: "test-bucket",
  getPresignedUploadUrl: vi.fn(async () => ({
    method: "PUT" as const,
    url: "http://upload",
    headers: {},
    expiresIn: 300,
  })),
  getPresignedDownloadUrl: vi.fn(async () => ({ url: "http://download", expiresIn: 300 })),
  putObject: vi.fn(async () => {}),
  headObject: vi.fn(async () => ({ exists: true, contentLength: 100 })),
  deleteObject: vi.fn(async () => {}),
};
vi.mock("@/lib/storage/index", () => ({
  getStorageDriver: () => driverMock,
}));

// ─── Mock the audit writer (DB side-effect) ──────────────────────────
const recordAuditMock = vi.fn(async () => {});
vi.mock("@/lib/workflow/audit", () => ({
  recordAudit: (...a: unknown[]) => recordAuditMock(...(a as [])),
}));

import { fileService, FileError } from "@/lib/storage/file-service";

const ctx = { orgId: "org-1", userId: "user-1" } as any;

beforeEach(() => {
  resetMockDb();
  Object.values(driverMock).forEach((v) => {
    if (typeof v === "function") (v as any).mockClear();
  });
  recordAuditMock.mockClear();
  // default $transaction passthrough
  (mockDb as any).$transaction.mockImplementation(async (fn: any) => fn(mockDb));
});

describe("buildObjectKey", () => {
  it("builds a tenant/company/project scoped key with a sanitized file name", () => {
    const key = fileService.buildObjectKey(ctx, {
      entityType: "grn",
      entityId: "grn-9",
      projectId: "proj-1",
      companyId: "co-1",
      fileName: "my file!.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(key).toContain("tenants/org-1/");
    expect(key).toContain("companies/co-1/");
    expect(key).toContain("projects/proj-1/");
    expect(key).toContain("grn/grn-9/");
    expect(key).toMatch(/my_file_\.pdf$/); // sanitized
  });
});

describe("initUpload", () => {
  it("validates, reserves a pending_upload row, and returns a presigned URL", async () => {
    (mockDb as any).cnFileObject.create.mockResolvedValue({ id: "file-1" });

    const res = await fileService.initUpload(ctx, {
      entityType: "grn",
      entityId: "grn-9",
      projectId: "proj-1",
      fileName: "challan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });

    expect(res.fileId).toBe("file-1");
    expect(res.bucket).toBe("test-bucket");
    expect(res.upload.url).toBe("http://upload");

    const createArg = (mockDb as any).cnFileObject.create.mock.calls[0][0];
    expect(createArg.data.status).toBe("pending_upload");
    expect(createArg.data.orgId).toBe("org-1");
    expect(createArg.data.uploadedBy).toBe("user-1");
    expect(driverMock.getPresignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("throws FileError and writes nothing when validation fails (bad MIME)", async () => {
    await expect(
      fileService.initUpload(ctx, {
        entityType: "grn",
        entityId: "grn-9",
        fileName: "evil.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(FileError);
    expect((mockDb as any).cnFileObject.create).not.toHaveBeenCalled();
    expect(driverMock.getPresignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("confirmUpload", () => {
  it("HEAD-checks the object then flips the row to active + records audit", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "pending_upload",
      storageKey: "k",
      sizeBytes: 100,
      entityType: "grn",
      entityId: "grn-9",
      fileName: "challan.pdf",
    });
    (mockDb as any).cnFileObject.update.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "active",
      entityType: "grn",
      entityId: "grn-9",
      fileName: "challan.pdf",
      uploadedAt: new Date("2025-01-01T00:00:00Z"),
    });

    const meta = await fileService.confirmUpload(ctx, "file-1");
    expect(meta.status).toBe("active");
    expect(driverMock.headObject).toHaveBeenCalledWith("k");
    expect(recordAuditMock).toHaveBeenCalledTimes(1);
  });

  it("returns current state idempotently if already active", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "active",
      uploadedAt: new Date(),
    });
    const meta = await fileService.confirmUpload(ctx, "file-1");
    expect(meta.status).toBe("active");
    expect(driverMock.headObject).not.toHaveBeenCalled();
  });

  it("throws FILE_NOT_FOUND when the row is missing", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue(null);
    await expect(fileService.confirmUpload(ctx, "nope")).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
    });
  });

  it("rejects + cleans up on a size mismatch", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "pending_upload",
      storageKey: "k",
      sizeBytes: 100,
    });
    driverMock.headObject.mockResolvedValueOnce({ exists: true, contentLength: 50 });
    (mockDb as any).cnFileObject.delete.mockResolvedValue({});

    await expect(fileService.confirmUpload(ctx, "file-1")).rejects.toMatchObject({
      code: "SIZE_MISMATCH",
    });
    expect(driverMock.deleteObject).toHaveBeenCalledWith("k");
    expect((mockDb as any).cnFileObject.delete).toHaveBeenCalled();
  });

  it("throws UPLOAD_NOT_FOUND when the object is missing at the key", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "pending_upload",
      storageKey: "k",
      sizeBytes: 100,
    });
    driverMock.headObject.mockResolvedValueOnce({ exists: false } as any);
    await expect(fileService.confirmUpload(ctx, "file-1")).rejects.toMatchObject({
      code: "UPLOAD_NOT_FOUND",
    });
  });
});

describe("getDownloadUrl", () => {
  it("returns a signed URL for an active file", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "active",
      storageKey: "k",
      fileName: "challan.pdf",
      mimeType: "application/pdf",
    });
    const res = await fileService.getDownloadUrl(ctx, "file-1");
    expect(res.url).toBe("http://download");
    expect(driverMock.getPresignedDownloadUrl).toHaveBeenCalledWith({
      key: "k",
      fileName: "challan.pdf",
    });
  });

  it("throws FILE_NOT_FOUND when no active row exists", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue(null);
    await expect(fileService.getDownloadUrl(ctx, "x")).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
    });
  });
});

describe("deleteFile", () => {
  it("soft-deletes (no object delete) and records audit", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "active",
      storageKey: "k",
      entityType: "grn",
      entityId: "grn-9",
      fileName: "challan.pdf",
    });
    (mockDb as any).cnFileObject.update.mockResolvedValue({});

    await fileService.deleteFile(ctx, "file-1");
    expect(recordAuditMock).toHaveBeenCalledTimes(1);
    expect(driverMock.deleteObject).not.toHaveBeenCalled();
  });

  it("hard-deletes the object when hardDelete:true", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "active",
      storageKey: "k",
      entityType: "grn",
      entityId: "grn-9",
      fileName: "challan.pdf",
    });
    (mockDb as any).cnFileObject.update.mockResolvedValue({});

    await fileService.deleteFile(ctx, "file-1", { hardDelete: true });
    expect(driverMock.deleteObject).toHaveBeenCalledWith("k");
  });

  it("is a no-op when already deleted", async () => {
    (mockDb as any).cnFileObject.findFirst.mockResolvedValue({
      id: "file-1",
      orgId: "org-1",
      status: "deleted",
    });
    await fileService.deleteFile(ctx, "file-1");
    expect((mockDb as any).$transaction).not.toHaveBeenCalled();
  });
});

describe("listByEntity", () => {
  it("lists active rows scoped to org + entity, mapped to metadata", async () => {
    (mockDb as any).cnFileObject.findMany.mockResolvedValue([
      {
        id: "f1",
        entityType: "grn",
        entityId: "g1",
        fileName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        storageKey: "k",
        storageKind: "local",
        status: "active",
        uploadedBy: "u",
        uploadedAt: new Date("2025-01-01T00:00:00Z"),
      },
    ]);
    const rows = await fileService.listByEntity(ctx, "grn", "g1");
    expect(rows).toHaveLength(1);
    expect(rows[0].uploadedAt).toBe("2025-01-01T00:00:00.000Z");
    const whereArg = (mockDb as any).cnFileObject.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ orgId: "org-1", entityType: "grn", entityId: "g1", status: "active" });
  });
});
