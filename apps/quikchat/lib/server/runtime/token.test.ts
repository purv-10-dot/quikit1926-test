import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mintRuntimeToken,
  RUNTIME_TOKEN_AUDIENCE,
  RUNTIME_TOKEN_ISSUER,
  type RuntimeTokenClaims,
} from "./token";

const SECRET = "test-agent-secret";

beforeEach(() => {
  process.env.AGENT_JWT_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.AGENT_JWT_SECRET;
});

describe("mintRuntimeToken", () => {
  it("mints a scoped, short-lived agent JWT", async () => {
    const token = await mintRuntimeToken({ orgId: "o1", botAgentId: "bot-1", userId: "u1" });
    const claims = jwt.verify(token, SECRET, {
      audience: RUNTIME_TOKEN_AUDIENCE,
      issuer: RUNTIME_TOKEN_ISSUER,
    }) as RuntimeTokenClaims & { exp: number };
    expect(claims).toMatchObject({
      iss: "quikchat",
      aud: "quikverse-runtime",
      sub: "bot-1",
      orgId: "o1",
      userId: "u1",
      actorType: "ai_agent",
    });
    expect(typeof claims.exp).toBe("number");
  });

  it("is a SEPARATE credential from the S07 inbound direction (opposite aud/iss)", async () => {
    const token = await mintRuntimeToken({ orgId: "o1", botAgentId: "bot-1", userId: "u1" });
    // Outbound (QuikChat→runtime) mints iss "quikchat" / aud "quikverse-runtime".
    // Verifying it under the INBOUND expectation (aud "quikchat" / iss "quikverse-runtime" —
    // which QuikIT's withAuth now owns) must fail, proving the two credentials are distinct
    // and run in opposite directions. (Was: verifyAgentToken, retired in Batch 3.)
    expect(() =>
      jwt.verify(token, SECRET, { audience: "quikchat", issuer: "quikverse-runtime" }),
    ).toThrow();
  });
});
