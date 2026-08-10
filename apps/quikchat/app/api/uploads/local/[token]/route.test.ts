import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalDriver, localUploadSecret } from "@/lib/server/storage/local";
import { signToken } from "@/lib/server/storage/tokens";
import { GET, PUT } from "./route";

const tokenOf = (url: string) => url.split("/").pop()!;
const driver = new LocalDriver();

function putReq(token: string, body: BodyInit, contentType: string) {
  return new Request(`http://test.local/api/uploads/local/${token}`, {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
}

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
  return { token: tokenOf(target.uploadUrl), objectPath: target.objectPath };
}

describe("PUT /api/uploads/local/[token]", () => {
  it("writes the body on a valid token", async () => {
    const { token, objectPath } = await freshUploadToken();
    const res = await PUT(putReq(token, "PNGBYTES", "image/png"), { params: { token } });
    expect(res.status).toBe(200);
    const stored = await driver.read(objectPath);
    expect(stored.toString()).toBe("PNGBYTES");
  });

  it("rejects an invalid/tampered token (401)", async () => {
    const res = await PUT(putReq("not-a-token", "x", "image/png"), {
      params: { token: "not-a-token" },
    });
    expect(res.status).toBe(401);
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
      localUploadSecret(),
    );
    const res = await PUT(putReq(token, "x", "image/png"), { params: { token } });
    expect(res.status).toBe(401);
  });

  it("rejects a content-type mismatch (400)", async () => {
    const { token } = await freshUploadToken();
    const res = await PUT(putReq(token, "x", "image/jpeg"), { params: { token } });
    expect(res.status).toBe(400);
  });

  it("rejects an oversize body (413)", async () => {
    const { token } = await freshUploadToken({ size: 4 }); // maxBytes = 4
    const res = await PUT(putReq(token, "way too many bytes", "image/png"), { params: { token } });
    expect(res.status).toBe(413);
  });
});

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
