import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { verifyToken } from "./token";

const SECRET = "test-handshake-secret";
const IDENTITY = { userId: "u-alice", orgId: "org-1" };

describe("verifyToken", () => {
  it("accepts the HS256 token the app mints", () => {
    // Mirrors apps/quikchat GET /api/realtime/token: string secret, 60s TTL.
    const token = jwt.sign(IDENTITY, SECRET, { expiresIn: 60 });
    expect(verifyToken(token, SECRET)).toEqual(IDENTITY);
  });

  // Algorithm pin: without `algorithms: ["HS256"]`, jsonwebtoken would verify
  // whatever HMAC variant the token's own header asks for.
  it("rejects a token signed with HS512", () => {
    const token = jwt.sign(IDENTITY, SECRET, { algorithm: "HS512", expiresIn: 60 });
    expect(() => verifyToken(token, SECRET)).toThrow(/invalid algorithm/i);
  });

  it("rejects a token signed with HS384", () => {
    const token = jwt.sign(IDENTITY, SECRET, { algorithm: "HS384", expiresIn: 60 });
    expect(() => verifyToken(token, SECRET)).toThrow(/invalid algorithm/i);
  });

  it("rejects an unsigned (alg: none) token", () => {
    const token = jwt.sign(IDENTITY, "", { algorithm: "none" });
    expect(() => verifyToken(token, SECRET)).toThrow();
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = jwt.sign(IDENTITY, "other-secret", { expiresIn: 60 });
    expect(() => verifyToken(token, SECRET)).toThrow();
  });

  it("rejects an expired token", () => {
    const token = jwt.sign(IDENTITY, SECRET, { expiresIn: -10 });
    expect(() => verifyToken(token, SECRET)).toThrow(/expired/i);
  });

  it("rejects a token missing userId/orgId", () => {
    const token = jwt.sign({ userId: "u-alice" }, SECRET, { expiresIn: 60 });
    expect(() => verifyToken(token, SECRET)).toThrow(/missing userId\/orgId/);
  });
});
