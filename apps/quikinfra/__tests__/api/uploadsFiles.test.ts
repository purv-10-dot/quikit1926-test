import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx } from "../setup";
import { NextRequest } from "next/server";

// ── Mock the storage driver so /api/uploads never touches S3 ────────
const putObjectMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage", () => ({
  getStorageDriver: () => ({
    kind: "s3" as const,
    bucket: "test-bucket",
    putObject: (...args: unknown[]) => putObjectMock(...args),
    getPresignedDownloadUrl: vi.fn(),
    getPresignedUploadUrl: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
  }),
}));

const { POST: UPLOADS_POST } = await import("@/app/api/uploads/route");

function uploadReq(form: FormData): NextRequest {
  return new NextRequest("http://localhost/api/uploads", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  putObjectMock.mockClear();
});

// ═══════════════════════════════════════════════
// POST /api/uploads
// ═══════════════════════════════════════════════

describe("POST /api/uploads — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const form = new FormData();
    form.append("files", new File(["x"], "a.png", { type: "image/png" }));
    const res = await UPLOADS_POST(uploadReq(form));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/uploads — validation + happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when no files field is present", async () => {
    const res = await UPLOADS_POST(uploadReq(new FormData()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/files/i);
  });

  it("returns 415 for an unsupported mime type", async () => {
    const form = new FormData();
    form.append(
      "files",
      new File(["MZ"], "evil.exe", { type: "application/x-msdownload" }),
    );
    const res = await UPLOADS_POST(uploadReq(form));
    expect(res.status).toBe(415);
  });

  it("uploads an allowed image to S3 and returns 201 with the viewer URL", async () => {
    const form = new FormData();
    form.append("files", new File(["imgdata"], "photo.png", { type: "image/png" }));
    const res = await UPLOADS_POST(uploadReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0].url).toMatch(/^\/api\/uploads\/view\/uploads\//);
    expect(body.files[0].name).toBe("photo.png");
    expect(putObjectMock).toHaveBeenCalledTimes(1);
    expect(putObjectMock.mock.calls[0][0]).toMatchObject({
      contentType: "image/png",
    });
  });
});
