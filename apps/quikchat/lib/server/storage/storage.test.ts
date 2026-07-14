import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selectDriverName } from "./index";
import { LocalDriver, fsPathFor, localUploadSecret } from "./local";
import { isInlineType } from "./types";
import { verifyToken, type DownloadTokenPayload, type UploadTokenPayload } from "./tokens";

const tokenOf = (url: string) => url.split("/").pop()!;

describe("isInlineType", () => {
  it("treats image/video/audio AND pdf as inline; other docs as attachment", () => {
    expect(isInlineType("image/png")).toBe(true);
    expect(isInlineType("video/mp4")).toBe(true);
    expect(isInlineType("audio/mpeg")).toBe(true);
    expect(isInlineType("application/pdf")).toBe(true); // S-chat-fixes-2
    expect(isInlineType("application/zip")).toBe(false);
    expect(isInlineType("application/vnd.ms-excel")).toBe(false);
    expect(isInlineType(undefined)).toBe(false);
  });
});

describe("selectDriverName", () => {
  it("forces a driver via STORAGE_DRIVER", () => {
    expect(selectDriverName({ STORAGE_DRIVER: "gcs" })).toBe("gcs");
    expect(selectDriverName({ STORAGE_DRIVER: "local" })).toBe("local");
  });

  it("auto-selects GCS only when a bucket AND credentials are present", () => {
    expect(
      selectDriverName({
        GCS_BUCKET: "b",
        GCS_CREDENTIALS_JSON: "{}",
      }),
    ).toBe("gcs");
    expect(
      selectDriverName({
        GCS_BUCKET: "b",
        GOOGLE_APPLICATION_CREDENTIALS: "/k.json",
      }),
    ).toBe("gcs");
  });

  it("falls back to local without bucket or creds", () => {
    expect(selectDriverName({})).toBe("local");
    expect(selectDriverName({ GCS_BUCKET: "b" })).toBe("local"); // no creds
  });
});

describe("LocalDriver", () => {
  let dir = "";
  const driver = new LocalDriver();

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "qc-uploads-"));
    process.env.LOCAL_UPLOAD_DIR = dir;
    process.env.UPLOAD_TOKEN_SECRET = "test-upload-secret";
  });
  afterAll(() => {
    delete process.env.LOCAL_UPLOAD_DIR;
    delete process.env.UPLOAD_TOKEN_SECRET;
  });

  it("createUploadTarget mints an org-scoped objectPath + a verifiable token", async () => {
    const target = await driver.createUploadTarget({
      orgId: "o1",
      channelId: "c1",
      userId: "u1",
      filename: "My Photo!.png",
      contentType: "image/png",
      size: 2048,
    });
    expect(target.method).toBe("PUT");
    expect(target.uploadUrl.startsWith("/api/uploads/local/")).toBe(true);
    expect(target.objectPath).toMatch(/^quikchat\/o1\/c1\/[0-9a-f-]+-My_Photo_.png$/);
    expect(target.headers["Content-Type"]).toBe("image/png");

    const payload = verifyToken<UploadTokenPayload>(tokenOf(target.uploadUrl), localUploadSecret());
    expect(payload).toMatchObject({
      kind: "up",
      objectPath: target.objectPath,
      contentType: "image/png",
      orgId: "o1",
      userId: "u1",
    });
  });

  it("write then read round-trips bytes", async () => {
    const objectPath = "quikchat/o1/c1/abc-hello.txt";
    await driver.write(objectPath, Buffer.from("hello world"));
    const back = await driver.read(objectPath);
    expect(back.toString()).toBe("hello world");
  });

  it("fsPathFor refuses path traversal", () => {
    expect(() => fsPathFor("../../etc/passwd")).toThrow();
  });

  it("createDownloadUrl chooses inline for media + pdf, attachment for other files", async () => {
    const img = await driver.createDownloadUrl("quikchat/o1/c1/x.png", {
      contentType: "image/png",
    });
    const pdf = await driver.createDownloadUrl("quikchat/o1/c1/x.pdf", {
      contentType: "application/pdf",
      downloadName: "x.pdf",
    });
    const zip = await driver.createDownloadUrl("quikchat/o1/c1/x.zip", {
      contentType: "application/zip",
      downloadName: "x.zip",
    });
    const imgP = verifyToken<DownloadTokenPayload>(tokenOf(img), localUploadSecret());
    const pdfP = verifyToken<DownloadTokenPayload>(tokenOf(pdf), localUploadSecret());
    const zipP = verifyToken<DownloadTokenPayload>(tokenOf(zip), localUploadSecret());
    expect(imgP?.disposition).toBe("inline");
    // PDFs now preview inline (iframe) instead of force-downloading.
    expect(pdfP?.disposition).toBe("inline");
    expect(pdfP?.contentType).toBe("application/pdf");
    // Non-previewable docs still download.
    expect(zipP?.disposition).toBe("attachment");
  });
});
