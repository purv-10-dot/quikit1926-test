import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GcsDriver imports `@google-cloud/storage` statically. We mock the module so
 * no real GCS call is made: the `Storage` class exposes a controllable
 * `bucket().file()` chain whose methods (`save`, `getSignedUrl`, `exists`,
 * `getMetadata`, `delete`) are spies we assert against.
 */

const { saveMock, getSignedUrlMock, existsMock, getMetadataMock, deleteMock, fileMock, bucketMock } =
  vi.hoisted(() => {
    const saveMock = vi.fn();
    const getSignedUrlMock = vi.fn();
    const existsMock = vi.fn();
    const getMetadataMock = vi.fn();
    const deleteMock = vi.fn();
    const fileMock = vi.fn(() => ({
      save: saveMock,
      getSignedUrl: getSignedUrlMock,
      exists: existsMock,
      getMetadata: getMetadataMock,
      delete: deleteMock,
    }));
    const bucketMock = vi.fn(() => ({ file: fileMock }));
    return { saveMock, getSignedUrlMock, existsMock, getMetadataMock, deleteMock, fileMock, bucketMock };
  });

vi.mock("@google-cloud/storage", () => ({
  Storage: class Storage {
    bucket = bucketMock;
  },
}));

import { GcsDriver } from "@/lib/storage/gcs-driver";

function makeDriver() {
  return new GcsDriver({
    bucket: "my-bucket",
    projectId: "proj",
    clientEmail: "sa@example.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n",
    uploadUrlTtlSeconds: 400,
    downloadUrlTtlSeconds: 400,
  });
}

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue(undefined);
  getSignedUrlMock.mockReset();
  getSignedUrlMock.mockResolvedValue(["https://signed.example/url"]);
  existsMock.mockReset();
  getMetadataMock.mockReset();
  deleteMock.mockReset();
  deleteMock.mockResolvedValue(undefined);
  fileMock.mockClear();
  bucketMock.mockClear();
});

describe("getPresignedUploadUrl", () => {
  it("signs a V4 write URL and returns a PUT descriptor", async () => {
    const d = makeDriver();
    const res = await d.getPresignedUploadUrl({
      key: "k/1.pdf",
      contentType: "application/pdf",
      contentLength: 99,
    });
    expect(res.method).toBe("PUT");
    expect(res.url).toBe("https://signed.example/url");
    expect(res.expiresIn).toBe(400);
    expect(res.headers["Content-Type"]).toBe("application/pdf");

    expect(fileMock).toHaveBeenCalledWith("k/1.pdf");
    const opts = getSignedUrlMock.mock.calls[0][0] as {
      version: string;
      action: string;
      contentType: string;
    };
    expect(opts.version).toBe("v4");
    expect(opts.action).toBe("write");
    expect(opts.contentType).toBe("application/pdf");
  });
});

describe("getPresignedDownloadUrl", () => {
  it("signs a V4 read URL with a content-disposition filename", async () => {
    const d = makeDriver();
    const res = await d.getPresignedDownloadUrl({ key: "k/2.pdf", fileName: "report.pdf" });
    expect(res.url).toBe("https://signed.example/url");
    expect(fileMock).toHaveBeenCalledWith("k/2.pdf");
    const opts = getSignedUrlMock.mock.calls[0][0] as {
      action: string;
      responseDisposition?: string;
    };
    expect(opts.action).toBe("read");
    expect(opts.responseDisposition).toContain("report.pdf");
  });
});

describe("putObject", () => {
  it("saves a Buffer body with the content type", async () => {
    const d = makeDriver();
    await d.putObject({
      key: "k/3.bin",
      body: Buffer.from("x"),
      contentType: "application/octet-stream",
    });
    expect(fileMock).toHaveBeenCalledWith("k/3.bin");
    const body = saveMock.mock.calls[0][0];
    const opts = saveMock.mock.calls[0][1] as { contentType: string; resumable: boolean };
    expect(body).toBeInstanceOf(Buffer);
    expect(opts.contentType).toBe("application/octet-stream");
    expect(opts.resumable).toBe(false);
  });
});

describe("headObject", () => {
  it("maps an existing object into exists + metadata", async () => {
    const d = makeDriver();
    existsMock.mockResolvedValueOnce([true]);
    getMetadataMock.mockResolvedValueOnce([
      { size: 256, contentType: "application/pdf", etag: '"abc"' },
    ]);
    const head = await d.headObject("k/4.pdf");
    expect(head).toEqual({
      exists: true,
      contentLength: 256,
      contentType: "application/pdf",
      etag: "abc",
    });
  });

  it("returns exists:false when the object does not exist", async () => {
    const d = makeDriver();
    existsMock.mockResolvedValueOnce([false]);
    expect(await d.headObject("missing")).toEqual({ exists: false });
    expect(getMetadataMock).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors", async () => {
    const d = makeDriver();
    existsMock.mockRejectedValueOnce(new Error("boom"));
    await expect(d.headObject("x")).rejects.toThrow(/boom/);
  });
});

describe("deleteObject", () => {
  it("deletes the file at the key", async () => {
    const d = makeDriver();
    await d.deleteObject("k/5.pdf");
    expect(fileMock).toHaveBeenCalledWith("k/5.pdf");
    expect(deleteMock).toHaveBeenCalled();
  });
});
