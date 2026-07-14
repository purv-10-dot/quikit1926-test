import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSignedUrl = vi.fn();
const fileFn = vi.fn(() => ({ getSignedUrl, delete: vi.fn().mockResolvedValue(undefined) }));
const bucketFn = vi.fn(() => ({ file: fileFn }));
const StorageMock = vi.fn(() => ({ bucket: bucketFn }));

vi.mock("@google-cloud/storage", () => ({ Storage: StorageMock }));

import { GcsDriver } from "./gcs";

beforeEach(() => {
  getSignedUrl.mockReset();
  fileFn.mockClear();
  bucketFn.mockClear();
  StorageMock.mockClear();
  process.env.GCS_BUCKET = "test-bucket";
  process.env.GCS_PROJECT_ID = "test-project";
  delete process.env.GCS_CREDENTIALS_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});
afterEach(() => {
  delete process.env.GCS_BUCKET;
  delete process.env.GCS_PROJECT_ID;
  delete process.env.GCS_CREDENTIALS_JSON;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
});

describe("GcsDriver.createUploadTarget", () => {
  it("requests a v4 signed write URL with content-type + size condition + expiry", async () => {
    getSignedUrl.mockResolvedValue(["https://signed-put.example"]);
    const target = await new GcsDriver().createUploadTarget({
      orgId: "o1",
      channelId: "c1",
      userId: "u1",
      filename: "clip.mp4",
      contentType: "video/mp4",
      size: 2048,
    });
    expect(target.uploadUrl).toBe("https://signed-put.example");
    expect(target.headers["x-goog-content-length-range"]).toBe("0,2048");
    expect(target.objectPath).toMatch(/^quikchat\/o1\/c1\//);

    const opts = getSignedUrl.mock.calls[0]![0];
    expect(opts).toMatchObject({
      version: "v4",
      action: "write",
      contentType: "video/mp4",
      extensionHeaders: { "x-goog-content-length-range": "0,2048" },
    });
    expect(typeof opts.expires).toBe("number");
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
    getSignedUrl.mockResolvedValue(["https://u"]);
    await new GcsDriver().createUploadTarget({
      orgId: "o",
      channelId: "c",
      userId: "u",
      filename: "f.png",
      contentType: "image/png",
      size: 1,
    });
    expect(StorageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        credentials: { type: "service_account", x: 1 },
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
