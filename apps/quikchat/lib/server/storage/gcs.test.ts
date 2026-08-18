import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSignedUrl = vi.fn();
const save = vi.fn();
const fileFn = vi.fn(() => ({ getSignedUrl, save, delete: vi.fn().mockResolvedValue(undefined) }));
const bucketFn = vi.fn(() => ({ file: fileFn }));
const StorageMock = vi.fn(() => ({ bucket: bucketFn }));

vi.mock("@google-cloud/storage", () => ({ Storage: StorageMock }));

import { GcsDriver } from "./gcs";
import { UPLOAD_TOKEN_HEADER, uploadTokenSecret, verifyToken, type UploadTokenPayload } from "./tokens";

beforeEach(() => {
  getSignedUrl.mockReset();
  save.mockReset();
  save.mockResolvedValue(undefined);
  fileFn.mockClear();
  bucketFn.mockClear();
  StorageMock.mockClear();
  process.env.GCS_BUCKET = "test-bucket";
  process.env.GCS_PROJECT_ID = "test-project";
  process.env.UPLOAD_TOKEN_SECRET = "gcs-route-secret";
  delete process.env.GCS_CREDENTIALS_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GCS_CLIENT_EMAIL;
  delete process.env.GCS_PRIVATE_KEY;
});
afterEach(() => {
  delete process.env.GCS_BUCKET;
  delete process.env.GCS_PROJECT_ID;
  delete process.env.UPLOAD_TOKEN_SECRET;
  delete process.env.GCS_CREDENTIALS_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GCS_CLIENT_EMAIL;
  delete process.env.GCS_PRIVATE_KEY;
});

describe("GcsDriver.createUploadTarget", () => {
  it("returns an app-routed token upload URL (no browser-facing GCS URL, no CORS)", async () => {
    const target = await new GcsDriver().createUploadTarget({
      orgId: "o1",
      channelId: "c1",
      userId: "u1",
      filename: "clip.mp4",
      contentType: "video/mp4",
      size: 2048,
    });
    expect(target.method).toBe("PUT");
    expect(target.uploadUrl).toBe("/api/uploads/gcs");
    expect(target.headers["Content-Type"]).toBe("video/mp4");
    expect(target.headers["x-goog-content-length-range"]).toBeUndefined();
    expect(target.objectPath).toMatch(/^quikchat\/o1\/c1\//);
    expect(target.maxBytes).toBe(2048);

    // The token IS the auth — it verifies and carries the tenant scope.
    const payload = verifyToken<UploadTokenPayload>(
      target.headers[UPLOAD_TOKEN_HEADER]!,
      uploadTokenSecret(),
    );
    expect(payload).toMatchObject({
      kind: "up",
      objectPath: target.objectPath,
      contentType: "video/mp4",
      orgId: "o1",
      userId: "u1",
    });
    // No direct-to-GCS signed write URL is minted anymore.
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});

describe("GcsDriver.write", () => {
  it("saves the buffer to the bucket with contentType + resumable:false", async () => {
    await new GcsDriver().write("quikchat/o1/c1/x.png", Buffer.from("PNGBYTES"), "image/png");
    expect(fileFn).toHaveBeenCalledWith("quikchat/o1/c1/x.png");
    const [data, opts] = save.mock.calls[0]!;
    expect(Buffer.isBuffer(data)).toBe(true);
    expect((data as Buffer).toString()).toBe("PNGBYTES");
    expect(opts).toMatchObject({ contentType: "image/png", resumable: false });
    expect((opts as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      cacheControl: expect.any(String),
    });
  });
});

describe("GcsDriver.createDownloadUrl", () => {
  it("requests a v4 signed read URL", async () => {
    getSignedUrl.mockResolvedValue(["https://signed-get.example"]);
    const url = await new GcsDriver().createDownloadUrl("quikchat/o1/c1/x.png", {
      contentType: "image/png",
      downloadName: "x.png",
    });
    expect(url).toBe("https://signed-get.example");
    const opts = getSignedUrl.mock.calls[0]![0];
    expect(opts).toMatchObject({ version: "v4", action: "read" });
    expect(opts.responseDisposition).toContain("inline");
  });
});

describe("GcsDriver credentials", () => {
  it("reads inline JSON credentials (GCS_CREDENTIALS_JSON)", async () => {
    process.env.GCS_CREDENTIALS_JSON = JSON.stringify({ type: "service_account", x: 1 });
    // `write` triggers bucket()/Storage construction (createUploadTarget no
    // longer touches the bucket — it just mints a token).
    await new GcsDriver().write("quikchat/o/c/f.png", Buffer.from("x"), "image/png");
    expect(StorageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        credentials: { type: "service_account", x: 1 },
      }),
    );
  });

  it("reads split creds (GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY) and un-escapes \\n", async () => {
    process.env.GCS_CLIENT_EMAIL = "sa@proj.iam.gserviceaccount.com";
    process.env.GCS_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n";
    await new GcsDriver().write("quikchat/o/c/f.png", Buffer.from("x"), "image/png");
    expect(StorageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        credentials: {
          client_email: "sa@proj.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n",
        },
      }),
    );
  });

  it("reads a key file path (GOOGLE_APPLICATION_CREDENTIALS)", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/secrets/key.json";
    getSignedUrl.mockResolvedValue(["https://u"]);
    await new GcsDriver().createDownloadUrl("quikchat/o/c/x.png", { contentType: "image/png" });
    expect(StorageMock).toHaveBeenCalledWith(
      expect.objectContaining({ keyFilename: "/secrets/key.json" }),
    );
  });
});
