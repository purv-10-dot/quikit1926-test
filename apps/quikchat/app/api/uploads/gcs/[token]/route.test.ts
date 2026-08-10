import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @google-cloud/storage so the driver's write() runs without a real bucket.
const save = vi.fn();
const fileFn = vi.fn(() => ({ getSignedUrl: vi.fn(), save, delete: vi.fn() }));
const bucketFn = vi.fn(() => ({ file: fileFn }));
const StorageMock = vi.fn(() => ({ bucket: bucketFn }));
vi.mock("@google-cloud/storage", () => ({ Storage: StorageMock }));

import { GcsDriver } from "@/lib/server/storage/gcs";
import { signToken, uploadTokenSecret } from "@/lib/server/storage/tokens";
import { logger } from "@/lib/shared/logger";
import { PUT } from "./route";

const tokenOf = (url: string) => url.split("/").pop()!;
const driver = new GcsDriver();

function putReq(token: string, body: BodyInit, contentType: string) {
  return new Request(`http://test.local/api/uploads/gcs/${token}`, {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
}

beforeAll(() => {
  process.env.GCS_BUCKET = "test-bucket";
  process.env.GCS_PROJECT_ID = "test-project";
  process.env.GCS_CREDENTIALS_JSON = JSON.stringify({ type: "service_account" });
  process.env.UPLOAD_TOKEN_SECRET = "gcs-route-secret";
});
afterAll(() => {
  delete process.env.GCS_BUCKET;
  delete process.env.GCS_PROJECT_ID;
  delete process.env.GCS_CREDENTIALS_JSON;
  delete process.env.UPLOAD_TOKEN_SECRET;
});
// Spied, not vi.mock'd: the route only calls logger.error, and a module mock would
// also stub requestId/pathOf/redactSecrets for anything else in the import graph.
let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue(undefined);
  fileFn.mockClear();
  logError = vi.spyOn(logger, "error").mockImplementation(() => {});
});
afterEach(() => {
  logError.mockRestore();
});

async function freshUploadToken(over: Record<string, unknown> = {}) {
  const target = await driver.createUploadTarget({
    orgId: "o1",
    channelId: "c1",
    userId: "u1",
    filename: "pic.png",
    contentType: "image/png",
    size: 1024,
    ...over,
  });
  return { token: tokenOf(target.uploadUrl), objectPath: target.objectPath };
}

describe("PUT /api/uploads/gcs/[token]", () => {
  it("pushes the body to GCS on a valid token", async () => {
    const { token, objectPath } = await freshUploadToken();
    const res = await PUT(putReq(token, "PNGBYTES", "image/png"), { params: { token } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, objectPath });
    expect(fileFn).toHaveBeenCalledWith(objectPath);
    expect((save.mock.calls[0]![0] as Buffer).toString()).toBe("PNGBYTES");
  });

  it("rejects an invalid/tampered token (401)", async () => {
    const res = await PUT(putReq("not-a-token", "x", "image/png"), {
      params: { token: "not-a-token" },
    });
    expect(res.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects an expired token (401)", async () => {
    const token = signToken(
      {
        kind: "up",
        objectPath: "quikchat/o1/c1/x.png",
        contentType: "image/png",
        maxBytes: 10,
        orgId: "o1",
        userId: "u1",
        exp: Date.now() - 1,
      },
      uploadTokenSecret(),
    );
    const res = await PUT(putReq(token, "x", "image/png"), { params: { token } });
    expect(res.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a content-type mismatch (400)", async () => {
    const { token } = await freshUploadToken();
    const res = await PUT(putReq(token, "x", "image/jpeg"), { params: { token } });
    expect(res.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects an oversize body (413)", async () => {
    const { token } = await freshUploadToken({ size: 4 }); // maxBytes = 4
    const res = await PUT(putReq(token, "way too many bytes", "image/png"), { params: { token } });
    expect(res.status).toBe(413);
    expect(save).not.toHaveBeenCalled();
  });

  it("logs a write failure with context — and leaks no credentials — while returning the same 400", async () => {
    // Shaped like a real GaxiosError: `config.headers.authorization` (a live OAuth
    // token) and `config.body` (the uploaded bytes) are OWN ENUMERABLE props, so
    // logging the whole error object would serialize both. pino's redact paths are
    // rooted at the log object and never reach inside `err`.
    const gaxiosLike = Object.assign(new Error("Permission denied on bucket"), {
      code: "403",
      status: 403,
      config: {
        url: "https://storage.googleapis.com/upload",
        headers: { authorization: "Bearer ya29.LIVE-ACCESS-TOKEN" },
        body: "RAW-UPLOADED-FILE-BYTES",
      },
      response: { data: { error: "forbidden" } },
    });
    save.mockRejectedValueOnce(gaxiosLike);

    const { token, objectPath } = await freshUploadToken();
    const res = await PUT(putReq(token, "PNGBYTES", "image/png"), { params: { token } });

    // Observability-only: the response is byte-for-byte what it was before.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Write failed" });

    // The real error is now diagnosable instead of swallowed.
    expect(logError).toHaveBeenCalledTimes(1);
    const [fields, msg] = logError.mock.calls[0]! as [Record<string, unknown>, string];
    expect(msg).toBe("GCS upload write failed");
    expect(fields).toMatchObject({
      errName: "Error",
      errMessage: "Permission denied on bucket",
      errCode: "403",
      errStatus: 403,
      objectPath,
      orgId: "o1",
      userId: "u1",
    });

    // The security property, not just "did logging happen": nothing from the
    // error's config/response reaches the log line.
    const serialized = JSON.stringify(fields);
    expect(serialized).not.toContain("ya29.LIVE-ACCESS-TOKEN");
    expect(serialized).not.toContain("RAW-UPLOADED-FILE-BYTES");
    expect(serialized).not.toContain("authorization");
    expect(fields).not.toHaveProperty("err");
    expect(fields).not.toHaveProperty("config");
  });
});
