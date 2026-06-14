import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3Driver } from "@/lib/storage/s3-driver";

/**
 * S3Driver loads `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
 * through an indirect `new Function("m", "return import(m)")` so webpack
 * can't bundle the optional dep. That same indirection makes `vi.mock`
 * ineffective (the SDK isn't statically imported). So we inject a fake
 * client + presigner onto the driver's private fields and flip the
 * `sdkLoaded` flag — exercising every public method against fakes with
 * NO real AWS call. Command constructors are captured to assert args.
 */

class FakeCommand {
  constructor(public input: any) {}
}
class PutObjectCommand extends FakeCommand {}
class GetObjectCommand extends FakeCommand {}
class HeadObjectCommand extends FakeCommand {}
class DeleteObjectCommand extends FakeCommand {}

function makeDriver() {
  const d = new S3Driver({
    kind: "s3",
    bucket: "my-bucket",
    region: "ap-south-1",
    accessKeyId: "AK",
    secretAccessKey: "SK",
    uploadUrlTtlSeconds: 400,
    downloadUrlTtlSeconds: 400,
  });

  const send = vi.fn(async () => ({}));
  const getSignedUrl = vi.fn(async () => "https://signed.example/url");

  // Inject fakes so loadSdk() short-circuits (sdkLoaded = true).
  (d as any).sdkLoaded = true;
  (d as any).client = { send };
  (d as any).presigner = {
    getSignedUrl,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
  };

  return { d, send, getSignedUrl };
}

describe("getPresignedUploadUrl", () => {
  it("presigns a PutObjectCommand and returns a PUT descriptor", async () => {
    const { d, getSignedUrl } = makeDriver();
    const res = await d.getPresignedUploadUrl({
      key: "k/1.pdf",
      contentType: "application/pdf",
      contentLength: 99,
    });
    expect(res.method).toBe("PUT");
    expect(res.url).toBe("https://signed.example/url");
    expect(res.expiresIn).toBe(400);

    const cmd = (getSignedUrl.mock.calls[0] as any)[1] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: "my-bucket",
      Key: "k/1.pdf",
      ContentType: "application/pdf",
      ContentLength: 99,
    });
    expect(((getSignedUrl.mock.calls[0] as any)[2] as any).expiresIn).toBe(400);
  });
});

describe("getPresignedDownloadUrl", () => {
  it("presigns a GetObjectCommand with a content-disposition filename", async () => {
    const { d, getSignedUrl } = makeDriver();
    const res = await d.getPresignedDownloadUrl({ key: "k/2.pdf", fileName: "report.pdf" });
    expect(res.url).toBe("https://signed.example/url");
    const cmd = (getSignedUrl.mock.calls[0] as any)[1] as GetObjectCommand;
    expect(cmd).toBeInstanceOf(GetObjectCommand);
    expect(cmd.input.Bucket).toBe("my-bucket");
    expect(cmd.input.ResponseContentDisposition).toContain("report.pdf");
  });
});

describe("putObject", () => {
  it("sends a PutObjectCommand with the body", async () => {
    const { d, send } = makeDriver();
    await d.putObject({ key: "k/3.bin", body: Buffer.from("x"), contentType: "application/octet-stream" });
    const cmd = (send.mock.calls[0] as any)[0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input.Key).toBe("k/3.bin");
    expect(cmd.input.Body).toBeInstanceOf(Buffer);
  });
});

describe("headObject", () => {
  it("maps a successful HEAD into exists + metadata", async () => {
    const { d, send } = makeDriver();
    send.mockResolvedValueOnce({ ContentLength: 256, ContentType: "application/pdf", ETag: '"abc"' });
    const head = await d.headObject("k/4.pdf");
    expect(head).toEqual({
      exists: true,
      contentLength: 256,
      contentType: "application/pdf",
      etag: "abc",
    });
  });

  it("returns exists:false for a 404 / NotFound error", async () => {
    const { d, send } = makeDriver();
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    expect(await d.headObject("missing")).toEqual({ exists: false });

    send.mockRejectedValueOnce({ name: "NotFound" });
    expect(await d.headObject("missing")).toEqual({ exists: false });
  });

  it("rethrows other errors", async () => {
    const { d, send } = makeDriver();
    send.mockRejectedValueOnce(Object.assign(new Error("boom"), { $metadata: { httpStatusCode: 500 } }));
    await expect(d.headObject("x")).rejects.toThrow(/boom/);
  });
});

describe("deleteObject", () => {
  it("sends a DeleteObjectCommand", async () => {
    const { d, send } = makeDriver();
    await d.deleteObject("k/5.pdf");
    const cmd = (send.mock.calls[0] as any)[0] as DeleteObjectCommand;
    expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    expect(cmd.input).toMatchObject({ Bucket: "my-bucket", Key: "k/5.pdf" });
  });
});

describe("loadSdk (real, SDK not installed)", () => {
  it("throws a clear install error when the optional dep is absent", async () => {
    const d = new S3Driver({
      kind: "s3",
      bucket: "b",
      region: "r",
      accessKeyId: "a",
      secretAccessKey: "s",
    });
    // No injection — real loadSdk runs and the dynamic import fails.
    await expect(d.putObject({ key: "x", body: Buffer.from(""), contentType: "x" })).rejects.toThrow(
      /@aws-sdk\/client-s3/,
    );
  });
});
