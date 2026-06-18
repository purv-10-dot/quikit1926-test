import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * S3Driver now imports `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
 * statically. We mock both modules: the command classes capture their input
 * for assertions, `S3Client` exposes a controllable `send`, and `getSignedUrl`
 * returns a fixed URL. No real AWS call is made.
 */

const { sendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class FakeCommand {
    constructor(public input: unknown) {}
  }
  return {
    S3Client: class S3Client {
      send = sendMock;
    },
    PutObjectCommand: class PutObjectCommand extends FakeCommand {},
    GetObjectCommand: class GetObjectCommand extends FakeCommand {},
    HeadObjectCommand: class HeadObjectCommand extends FakeCommand {},
    DeleteObjectCommand: class DeleteObjectCommand extends FakeCommand {},
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

import { S3Driver } from "@/lib/storage/s3-driver";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

function makeDriver() {
  return new S3Driver({
    bucket: "my-bucket",
    region: "ap-south-1",
    accessKeyId: "AK",
    secretAccessKey: "SK",
    uploadUrlTtlSeconds: 400,
    downloadUrlTtlSeconds: 400,
  });
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
  getSignedUrlMock.mockReset();
  getSignedUrlMock.mockResolvedValue("https://signed.example/url");
});

describe("getPresignedUploadUrl", () => {
  it("presigns a PutObjectCommand and returns a PUT descriptor", async () => {
    const d = makeDriver();
    const res = await d.getPresignedUploadUrl({
      key: "k/1.pdf",
      contentType: "application/pdf",
      contentLength: 99,
    });
    expect(res.method).toBe("PUT");
    expect(res.url).toBe("https://signed.example/url");
    expect(res.expiresIn).toBe(400);

    const cmd = getSignedUrlMock.mock.calls[0][1] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect((cmd as unknown as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: "my-bucket",
      Key: "k/1.pdf",
      ContentType: "application/pdf",
      ContentLength: 99,
    });
    expect((getSignedUrlMock.mock.calls[0][2] as { expiresIn: number }).expiresIn).toBe(400);
  });
});

describe("getPresignedDownloadUrl", () => {
  it("presigns a GetObjectCommand with a content-disposition filename", async () => {
    const d = makeDriver();
    const res = await d.getPresignedDownloadUrl({ key: "k/2.pdf", fileName: "report.pdf" });
    expect(res.url).toBe("https://signed.example/url");
    const cmd = getSignedUrlMock.mock.calls[0][1] as GetObjectCommand;
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    const input = (cmd as unknown as { input: Record<string, string> }).input;
    expect(input.Bucket).toBe("my-bucket");
    expect(input.ResponseContentDisposition).toContain("report.pdf");
  });
});

describe("putObject", () => {
  it("sends a PutObjectCommand with the body", async () => {
    const d = makeDriver();
    await d.putObject({ key: "k/3.bin", body: Buffer.from("x"), contentType: "application/octet-stream" });
    const cmd = sendMock.mock.calls[0][0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    const input = (cmd as unknown as { input: Record<string, unknown> }).input;
    expect(input.Key).toBe("k/3.bin");
    expect(input.Body).toBeInstanceOf(Buffer);
  });
});

describe("headObject", () => {
  it("maps a successful HEAD into exists + metadata", async () => {
    const d = makeDriver();
    sendMock.mockResolvedValueOnce({ ContentLength: 256, ContentType: "application/pdf", ETag: '"abc"' });
    const head = await d.headObject("k/4.pdf");
    expect(head).toEqual({
      exists: true,
      contentLength: 256,
      contentType: "application/pdf",
      etag: "abc",
    });
  });

  it("returns exists:false for a 404 / NotFound error", async () => {
    const d = makeDriver();
    sendMock.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    expect(await d.headObject("missing")).toEqual({ exists: false });

    sendMock.mockRejectedValueOnce({ name: "NotFound" });
    expect(await d.headObject("missing")).toEqual({ exists: false });
  });

  it("rethrows other errors", async () => {
    const d = makeDriver();
    sendMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { $metadata: { httpStatusCode: 500 } }));
    await expect(d.headObject("x")).rejects.toThrow(/boom/);
  });
});

describe("deleteObject", () => {
  it("sends a DeleteObjectCommand", async () => {
    const d = makeDriver();
    await d.deleteObject("k/5.pdf");
    const cmd = sendMock.mock.calls[0][0] as DeleteObjectCommand;
    expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    expect((cmd as unknown as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: "my-bucket",
      Key: "k/5.pdf",
    });
  });
});
