import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUploadApi = vi.fn();
vi.mock("./api", () => ({ signUploadApi: (...a: unknown[]) => signUploadApi(...a) }));

import { uploadFile, validateFile } from "./upload";

// Minimal XHR fake that resolves the PUT immediately with a progress tick.
class FakeXHR {
  status = 200;
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    this.onload?.();
  }
}

beforeEach(() => {
  signUploadApi.mockReset();
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("validateFile", () => {
  it("accepts an allowed, in-size file", () => {
    expect(validateFile({ type: "image/png", size: 1000, name: "a.png" })).toBeNull();
  });
  it("rejects a disallowed type", () => {
    expect(validateFile({ type: "application/x-evil", size: 1, name: "a" })).toMatch(/supported/);
  });
  it("accepts csv and markdown", () => {
    expect(validateFile({ type: "text/csv", size: 10, name: "data.csv" })).toBeNull();
    expect(validateFile({ type: "text/markdown", size: 10, name: "notes.md" })).toBeNull();
  });
  it("accepts an empty-MIME code file by extension", () => {
    expect(validateFile({ type: "", size: 10, name: "script.py" })).toBeNull();
    expect(validateFile({ type: "application/octet-stream", size: 10, name: "app.ts" })).toBeNull();
  });
  it("rejects empty-MIME active-content / unknown extensions", () => {
    expect(validateFile({ type: "", size: 10, name: "index.html" })).toMatch(/supported/);
    expect(validateFile({ type: "", size: 10, name: "virus.exe" })).toMatch(/supported/);
  });
  it("rejects an oversize file", () => {
    expect(validateFile({ type: "image/png", size: 26 * 1024 * 1024, name: "a.png" })).toMatch(
      /too large/,
    );
  });
});

describe("uploadFile", () => {
  it("signs then PUTs the bytes and returns MediaMeta", async () => {
    signUploadApi.mockResolvedValue({
      uploadUrl: "/api/uploads/local/tok",
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      objectPath: "quikchat/o/c/uuid-a.png",
      maxBytes: 1024,
      expiresAt: new Date().toISOString(),
    });
    const file = new File(["bytes"], "a.png", { type: "image/png" });
    const progress: number[] = [];
    const meta = await uploadFile(file, "c1", (f) => progress.push(f));

    expect(signUploadApi).toHaveBeenCalledWith({
      channelId: "c1",
      filename: "a.png",
      contentType: "image/png",
      size: file.size,
    });
    expect(meta).toEqual({
      objectPath: "quikchat/o/c/uuid-a.png",
      mediaType: "image/png",
      originalName: "a.png",
      size: file.size,
    });
    expect(progress).toContain(0.5);
  });

  it("throws on a disallowed file before signing", async () => {
    const file = new File(["x"], "a.exe", { type: "application/x-evil" });
    await expect(uploadFile(file, "c1")).rejects.toThrow();
    expect(signUploadApi).not.toHaveBeenCalled();
  });

  it("normalizes an empty-MIME code file to octet-stream when signing", async () => {
    signUploadApi.mockResolvedValue({
      uploadUrl: "/api/uploads/local/tok",
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      objectPath: "quikchat/o/c/uuid-script.py",
      maxBytes: 1024,
      expiresAt: new Date().toISOString(),
    });
    const file = new File(["print(1)"], "script.py", { type: "" });
    const meta = await uploadFile(file, "c1");

    expect(signUploadApi).toHaveBeenCalledWith({
      channelId: "c1",
      filename: "script.py",
      contentType: "application/octet-stream",
      size: file.size,
    });
    expect(meta.mediaType).toBe("application/octet-stream");
    expect(meta.originalName).toBe("script.py");
  });

  it("rejects a malformed sign response instead of crashing on null headers", async () => {
    signUploadApi.mockResolvedValue({
      uploadUrl: "/api/uploads/local/tok",
      method: "PUT",
      headers: null,
      objectPath: "quikchat/o/c/uuid-bad.png",
      maxBytes: 1024,
      expiresAt: new Date().toISOString(),
    });
    const file = new File(["bytes"], "a.png", { type: "image/png" });

    await expect(uploadFile(file, "c1")).rejects.toThrow(/upload target/i);
  });
});
