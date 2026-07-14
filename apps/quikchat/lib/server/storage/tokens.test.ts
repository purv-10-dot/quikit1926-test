import { describe, expect, it } from "vitest";
import { signToken, verifyToken, type UploadTokenPayload } from "./tokens";

const SECRET = "test-secret";
const future = Date.now() + 60_000;

function uploadPayload(over: Partial<UploadTokenPayload> = {}): UploadTokenPayload {
  return {
    kind: "up",
    objectPath: "quikchat/o1/c1/uuid-file.png",
    contentType: "image/png",
    maxBytes: 1000,
    orgId: "o1",
    userId: "u1",
    exp: future,
    ...over,
  };
}

describe("signToken / verifyToken", () => {
  it("round-trips a valid token", () => {
    const token = signToken(uploadPayload(), SECRET);
    const out = verifyToken<UploadTokenPayload>(token, SECRET);
    expect(out).toMatchObject({ kind: "up", objectPath: "quikchat/o1/c1/uuid-file.png" });
  });

  it("rejects a tampered payload", () => {
    const token = signToken(uploadPayload(), SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify(uploadPayload({ maxBytes: 999_999 }))).toString(
      "base64url",
    );
    expect(verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const token = signToken(uploadPayload(), SECRET);
    expect(verifyToken(token, "other-secret")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signToken(uploadPayload({ exp: Date.now() - 1 }), SECRET);
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyToken("garbage", SECRET)).toBeNull();
    expect(verifyToken("a.b.c", SECRET)).toBeNull();
    expect(verifyToken("", SECRET)).toBeNull();
  });
});
