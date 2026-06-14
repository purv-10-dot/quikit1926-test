import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx } from "../setup";
import { NextRequest } from "next/server";

// ── Mock the filesystem so /api/uploads never touches disk ──────────
const writeFileMock = vi.fn().mockResolvedValue(undefined);
const mkdirMock = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
}));

// ── Mock the storage driver so /api/files/* never touches disk ──────
// A controllable fake LocalDriver: tests flip `isLocal` to exercise the
// "wrong driver → 404" branch, and tweak verify/read behaviour per case.
class FakeLocalDriver {
  verifyToken = vi.fn();
  acceptUpload = vi.fn().mockResolvedValue(undefined);
  readObject = vi.fn();
}
const storageState: { driver: any } = { driver: new FakeLocalDriver() };
vi.mock("@/lib/storage", () => {
  class LocalDriver {}
  return {
    LocalDriver,
    getStorageDriver: () => storageState.driver,
  };
});

const { POST: UPLOADS_POST } = await import("@/app/api/uploads/route");
const { PUT: LOCAL_UPLOAD_PUT } = await import("@/app/api/files/local-upload/route");
const { GET: LOCAL_DOWNLOAD_GET } = await import("@/app/api/files/local-download/route");
const { LocalDriver } = await import("@/lib/storage");

// Make the fake an actual `instanceof LocalDriver` so the route's guard passes.
Object.setPrototypeOf(FakeLocalDriver.prototype, (LocalDriver as any).prototype);

function freshDriver(): FakeLocalDriver {
  const d = new FakeLocalDriver();
  storageState.driver = d;
  return d;
}

function uploadReq(form: FormData): NextRequest {
  return new NextRequest("http://localhost/api/uploads", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  writeFileMock.mockClear();
  mkdirMock.mockClear();
  freshDriver();
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

  it("persists an allowed image and returns 201 with the public URL", async () => {
    const form = new FormData();
    form.append("files", new File(["imgdata"], "photo.png", { type: "image/png" }));
    const res = await UPLOADS_POST(uploadReq(form));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0].url).toMatch(/^\/uploads\//);
    expect(body.files[0].name).toBe("photo.png");
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(mkdirMock).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════
// PUT /api/files/local-upload
// ═══════════════════════════════════════════════

describe("PUT /api/files/local-upload", () => {
  function putReq(qs: string, body = "payload"): NextRequest {
    return new NextRequest(`http://localhost/api/files/local-upload${qs}`, {
      method: "PUT",
      body,
    });
  }

  it("returns 404 when the active driver is not the local driver", async () => {
    storageState.driver = { not: "local" }; // not instanceof LocalDriver
    const res = await LOCAL_UPLOAD_PUT(putReq("?token=t"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when token is missing", async () => {
    const res = await LOCAL_UPLOAD_PUT(putReq(""));
    expect(res.status).toBe(400);
  });

  it("returns 403 when the token is invalid", async () => {
    storageState.driver.verifyToken.mockReturnValue(null);
    const res = await LOCAL_UPLOAD_PUT(putReq("?token=bad"));
    expect(res.status).toBe(403);
  });

  it("accepts the upload and returns ok + bytes on a valid token", async () => {
    storageState.driver.verifyToken.mockReturnValue({ key: "k/file.bin" });
    const res = await LOCAL_UPLOAD_PUT(putReq("?token=good", "hello"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.bytes).toBe(Buffer.byteLength("hello"));
    expect(storageState.driver.acceptUpload).toHaveBeenCalledWith("k/file.bin", expect.any(Buffer));
  });

  it("returns 409 on a content-length mismatch", async () => {
    storageState.driver.verifyToken.mockReturnValue({ key: "k", contentLength: 999 });
    const res = await LOCAL_UPLOAD_PUT(putReq("?token=good", "short"));
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════
// GET /api/files/local-download
// ═══════════════════════════════════════════════

describe("GET /api/files/local-download", () => {
  function getReq(qs: string): NextRequest {
    return new NextRequest(`http://localhost/api/files/local-download${qs}`, { method: "GET" });
  }

  it("returns 404 when the active driver is not the local driver", async () => {
    storageState.driver = { not: "local" };
    const res = await LOCAL_DOWNLOAD_GET(getReq("?token=t"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when token is missing", async () => {
    const res = await LOCAL_DOWNLOAD_GET(getReq(""));
    expect(res.status).toBe(400);
  });

  it("returns 403 when the token is invalid", async () => {
    storageState.driver.verifyToken.mockReturnValue(null);
    const res = await LOCAL_DOWNLOAD_GET(getReq("?token=bad"));
    expect(res.status).toBe(403);
  });

  it("streams the object back with a Content-Disposition on a valid token", async () => {
    storageState.driver.verifyToken.mockReturnValue({ key: "k/file.bin" });
    storageState.driver.readObject.mockResolvedValue(Buffer.from("filebytes"));
    const res = await LOCAL_DOWNLOAD_GET(getReq("?token=good&fn=report.pdf"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("report.pdf");
  });

  it("returns 404 when the file is missing on disk", async () => {
    storageState.driver.verifyToken.mockReturnValue({ key: "k/missing.bin" });
    storageState.driver.readObject.mockRejectedValue(new Error("ENOENT"));
    const res = await LOCAL_DOWNLOAD_GET(getReq("?token=good"));
    expect(res.status).toBe(404);
  });
});
