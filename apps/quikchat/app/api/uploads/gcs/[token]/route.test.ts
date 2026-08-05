import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @google-cloud/storage so the driver's write() runs without a real bucket.
const save = vi.fn();
const fileFn = vi.fn(() => ({ getSignedUrl: vi.fn(), save, delete: vi.fn() }));
const bucketFn = vi.fn(() => ({ file: fileFn }));
const StorageMock = vi.fn(() => ({ bucket: bucketFn }));
vi.mock("@google-cloud/storage", () => ({ Storage: StorageMock }));

import { GcsDriver } from "@/lib/server/storage/gcs";
import { signToken, uploadTokenSecret } from "@/lib/server/storage/tokens";
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
beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue(undefined);
  fileFn.mockClear();
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
});
