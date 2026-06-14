import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock fs.promises so nothing touches a real filesystem ───────────
const fsp = vi.hoisted(() => ({
  mkdir: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  readFile: vi.fn(async () => Buffer.from("file-bytes")),
  stat: vi.fn(async () => ({ size: 123 })),
  unlink: vi.fn(async () => {}),
}));
vi.mock("fs", () => ({ promises: fsp, default: { promises: fsp } }));

import { LocalDriver } from "@/lib/storage/local-driver";

function makeDriver() {
  return new LocalDriver({
    bucket: "bkt",
    rootDir: "/srv/storage",
    baseUrl: "http://192.168.2.7:3010",
    signingSecret: "secret-key",
    uploadUrlTtlSeconds: 600,
    downloadUrlTtlSeconds: 600,
  });
}

beforeEach(() => {
  Object.values(fsp).forEach((f) => (f as any).mockClear());
});

describe("presigned URLs + token round-trip", () => {
  it("builds a PUT upload URL with a verifiable put token", async () => {
    const d = makeDriver();
    const up = await d.getPresignedUploadUrl({
      key: "a/b/c.pdf",
      contentType: "application/pdf",
      contentLength: 50,
    });
    expect(up.method).toBe("PUT");
    expect(up.url).toContain("http://192.168.2.7:3010/api/files/local-upload?token=");
    expect(up.expiresIn).toBe(600);
    expect(up.headers["Content-Type"]).toBe("application/pdf");

    const token = decodeURIComponent(up.url.split("token=")[1]);
    const verified = d.verifyToken(token, "put");
    expect(verified).toMatchObject({ key: "a/b/c.pdf", contentType: "application/pdf", contentLength: 50 });
    // wrong mode fails
    expect(d.verifyToken(token, "get")).toBeNull();
  });

  it("builds a download URL with a get token + filename", async () => {
    const d = makeDriver();
    const dl = await d.getPresignedDownloadUrl({ key: "a/b.pdf", fileName: "report.pdf" });
    expect(dl.url).toContain("/api/files/local-download");
    expect(dl.url).toContain("fn=report.pdf");
    const token = decodeURIComponent(new URL(dl.url).searchParams.get("token")!);
    expect(d.verifyToken(token, "get")).toMatchObject({ key: "a/b.pdf" });
  });

  it("rejects a tampered token signature", () => {
    const d = makeDriver();
    expect(d.verifyToken("bogusbody.deadbeef", "put")).toBeNull();
    expect(d.verifyToken("onlyonepart", "put")).toBeNull();
  });
});

describe("putObject / readObject / headObject / deleteObject", () => {
  it("putObject mkdirs the parent then writes the body", async () => {
    const d = makeDriver();
    await d.putObject({ key: "x/y.bin", body: Buffer.from("data"), contentType: "x" });
    expect(fsp.mkdir).toHaveBeenCalledTimes(1);
    expect(fsp.writeFile).toHaveBeenCalledTimes(1);
    const writePath = (fsp.writeFile.mock.calls[0] as any)[0] as string;
    expect(writePath).toContain("bkt");
    expect(writePath).toContain("y.bin");
  });

  it("readObject returns the file buffer", async () => {
    const d = makeDriver();
    const buf = await d.readObject("x/y.bin");
    expect(buf.toString()).toBe("file-bytes");
    expect(fsp.readFile).toHaveBeenCalledTimes(1);
  });

  it("headObject reports exists+size when stat succeeds", async () => {
    const d = makeDriver();
    const head = await d.headObject("x/y.bin");
    expect(head).toEqual({ exists: true, contentLength: 123, etag: undefined });
  });

  it("headObject reports not-exists when stat throws", async () => {
    const d = makeDriver();
    fsp.stat.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await d.headObject("missing")).toEqual({ exists: false });
  });

  it("deleteObject swallows ENOENT but rethrows other errors", async () => {
    const d = makeDriver();
    fsp.unlink.mockRejectedValueOnce(Object.assign(new Error("nope"), { code: "ENOENT" }));
    await expect(d.deleteObject("x")).resolves.toBeUndefined();

    fsp.unlink.mockRejectedValueOnce(Object.assign(new Error("perm"), { code: "EACCES" }));
    await expect(d.deleteObject("x")).rejects.toThrow(/perm/);
  });

  it("rejects path-traversal keys", async () => {
    const d = makeDriver();
    await expect(d.putObject({ key: "../etc/passwd", body: Buffer.from(""), contentType: "x" })).rejects.toThrow(
      /Invalid storage key/,
    );
    await expect(d.readObject("/abs/path")).rejects.toThrow(/Invalid storage key/);
  });
});
