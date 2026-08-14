import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalDriver } from "@/lib/server/storage/local";
import { UPLOAD_TOKEN_HEADER } from "@/lib/server/storage/tokens";
import { GET } from "./route";

const tokenOf = (url: string) => url.split("/").pop()!;
const driver = new LocalDriver();

beforeAll(() => {
  process.env.LOCAL_UPLOAD_DIR = mkdtempSync(join(tmpdir(), "qc-route-"));
  process.env.UPLOAD_TOKEN_SECRET = "route-secret";
});
afterAll(() => {
  delete process.env.LOCAL_UPLOAD_DIR;
  delete process.env.UPLOAD_TOKEN_SECRET;
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
  return { token: target.headers[UPLOAD_TOKEN_HEADER]!, objectPath: target.objectPath };
}

describe("GET /api/uploads/local/[token]", () => {
  it("streams an inline image with the right headers", async () => {
    const objectPath = "quikchat/o1/c1/dl-image.png";
    await driver.write(objectPath, Buffer.from("IMG"));
    const url = await driver.createDownloadUrl(objectPath, { contentType: "image/png" });
    const token = tokenOf(url);
    const res = await GET(new Request(`http://test.local/x`), { params: { token } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(await res.text()).toBe("IMG");
  });

  it("serves a non-previewable file as an attachment with filename", async () => {
    const objectPath = "quikchat/o1/c1/dl-doc.zip";
    await driver.write(objectPath, Buffer.from("PK"));
    const url = await driver.createDownloadUrl(objectPath, {
      contentType: "application/zip",
      downloadName: "report.zip",
    });
    const res = await GET(new Request(`http://test.local/x`), { params: { token: tokenOf(url) } });
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="report.zip"');
  });

  it("serves a PDF inline so it previews in-app (S-chat-fixes-2)", async () => {
    const objectPath = "quikchat/o1/c1/dl-doc.pdf";
    await driver.write(objectPath, Buffer.from("%PDF"));
    const url = await driver.createDownloadUrl(objectPath, {
      contentType: "application/pdf",
      downloadName: "report.pdf",
    });
    const res = await GET(new Request(`http://test.local/x`), { params: { token: tokenOf(url) } });
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("inline");
  });

  it("404s for a missing object", async () => {
    const url = await driver.createDownloadUrl("quikchat/o1/c1/missing.png", {
      contentType: "image/png",
    });
    const res = await GET(new Request(`http://test.local/x`), { params: { token: tokenOf(url) } });
    expect(res.status).toBe(404);
  });

  it("rejects an upload token used for download (401)", async () => {
    const { token } = await freshUploadToken();
    const res = await GET(new Request(`http://test.local/x`), { params: { token } });
    expect(res.status).toBe(401);
  });
});
