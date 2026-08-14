import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalDriver, localUploadSecret } from "@/lib/server/storage/local";
import { UPLOAD_TOKEN_HEADER, signToken } from "@/lib/server/storage/tokens";
import { PUT } from "./route";

const driver = new LocalDriver();

function putReq(token: string | null, body: BodyInit, contentType: string) {
  const headers: Record<string, string> = { "content-type": contentType };
  if (token !== null) headers[UPLOAD_TOKEN_HEADER] = token;
  return new Request("http://test.local/api/uploads/local", { method: "PUT", body, headers });
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
  return { token: target.headers[UPLOAD_TOKEN_HEADER]!, objectPath: target.objectPath };
}

describe("PUT /api/uploads/local", () => {
  it("writes the body on a valid token", async () => {
    const { token, objectPath } = await freshUploadToken();
    const res = await PUT(putReq(token, "PNGBYTES", "image/png"));
    expect(res.status).toBe(200);
    const stored = await driver.read(objectPath);
    expect(stored.toString()).toBe("PNGBYTES");
  });

  it("rejects a request with no token header (401)", async () => {
    const res = await PUT(putReq(null, "x", "image/png"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired upload token" });
  });

  it("rejects an invalid/tampered token (401)", async () => {
    const res = await PUT(putReq("not-a-token", "x", "image/png"));
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
    const res = await PUT(putReq(token, "x", "image/png"));
    expect(res.status).toBe(401);
  });

  it("rejects a content-type mismatch (400)", async () => {
    const { token } = await freshUploadToken();
    const res = await PUT(putReq(token, "x", "image/jpeg"));
    expect(res.status).toBe(400);
  });

  it("rejects an oversize body (413)", async () => {
    const { token } = await freshUploadToken({ size: 4 }); // maxBytes = 4
    const res = await PUT(putReq(token, "way too many bytes", "image/png"));
    expect(res.status).toBe(413);
  });
});
