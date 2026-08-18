import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/shared";
import { ASSISTANT_BOT_AGENT_ID } from "@/lib/server/assistant.service";
import {
  mintRuntimeToken,
  RUNTIME_TOKEN_AUDIENCE,
  RUNTIME_TOKEN_ISSUER,
  __resetAgentSecretWarnForTest,
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

  /**
   * ── THE EXACT CLAIM SET, not just "these claims are present" ──────────────
   *
   * The assertion above uses `toMatchObject`, which proves the six named claims
   * exist with those values and proves NOTHING about extras. That gap became a
   * real question on 19 Aug 2026: the runtime team, diagnosing why our assist
   * turns get no tool catalog, asked what our token actually carries — and the
   * honest answer from the test suite alone was "at least these six", which is
   * not an answer.
   *
   * So: pin the whole key set. This is what makes the source readable as the
   * complete story, and it is the part that outlives the temporary
   * `RUNTIME_TOKEN_DEBUG` logging added for the same diagnosis.
   */
  it("carries EXACTLY these claims — nothing extra rides along", async () => {
    const token = await mintRuntimeToken({ orgId: "o1", botAgentId: "bot-1", userId: "u1" });
    const claims = jwt.decode(token) as Record<string, unknown>;

    expect(Object.keys(claims).sort()).toEqual(
      ["actorType", "aud", "exp", "iat", "iss", "orgId", "sub", "userId"].sort(),
    );
    // Notably ABSENT, and the runtime team's likeliest answer: nothing in this
    // token identifies an app. No appId, no app_slug, no scope, no tool grant.
    // `appId` travels in the assist request BODY (see http.ts), never here — so
    // a manifest lookup keyed off a token claim could never fire for us.
    for (const absent of ["appId", "app_slug", "appSlug", "scope", "tools", "permissions"]) {
      expect(claims[absent]).toBeUndefined();
    }
  });

  it("adds agentRunId ONLY when supplied — the one conditional claim", async () => {
    const without = jwt.decode(
      await mintRuntimeToken({ orgId: "o1", botAgentId: "bot-1", userId: "u1" }),
    ) as Record<string, unknown>;
    expect(without.agentRunId).toBeUndefined();

    const with_ = jwt.decode(
      await mintRuntimeToken({
        orgId: "o1",
        botAgentId: "bot-1",
        userId: "u1",
        agentRunId: "run-9",
      }),
    ) as Record<string, unknown>;
    expect(with_.agentRunId).toBe("run-9");
    // Exactly one claim more, so the two shapes above are the complete set this
    // code can emit. The assist path never supplies agentRunId.
    expect(Object.keys(with_)).toHaveLength(Object.keys(without).length + 1);
  });

  /**
   * The claim the runtime team actually asked about, minted with the PRODUCTION
   * constant rather than a test double.
   *
   * Every other test here passes `botAgentId: "bot-1"`, so until this existed no
   * test anywhere asserted what `sub` is in production — the suite could stay
   * green through a rename of the one identity the runtime authorises us by.
   */
  it("puts the real production bot identity in `sub`", async () => {
    const token = await mintRuntimeToken({
      orgId: "o1",
      botAgentId: ASSISTANT_BOT_AGENT_ID,
      userId: "u1",
    });
    const claims = jwt.decode(token) as Record<string, unknown>;
    expect(ASSISTANT_BOT_AGENT_ID).toBe("quikchat-assistant");
    expect(claims.sub).toBe("quikchat-assistant");
    // A fixed bot-identity string, NOT a user id — worth pinning because the two
    // are easy to confuse at a glance and the runtime authorises on this one.
    expect(claims.sub).not.toBe(claims.userId);
  });

  it("is short-lived — a 5 minute TTL", async () => {
    const claims = jwt.decode(
      await mintRuntimeToken({ orgId: "o1", botAgentId: "bot-1", userId: "u1" }),
    ) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(300);
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

describe("AGENT_JWT_SECRET fallback", () => {
  afterEach(() => {
    __resetAgentSecretWarnForTest();
    vi.restoreAllMocks();
  });

  it("warns exactly once when unset, then signs with the dev secret", async () => {
    delete process.env.AGENT_JWT_SECRET;
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);

    const a = await mintRuntimeToken({ orgId: "o1", botAgentId: "bot-1", userId: "u1" });
    const b = await mintRuntimeToken({ orgId: "o1", botAgentId: "bot-1", userId: "u1" });

    expect(() =>
      jwt.verify(a, "dev-only-agent-secret-change-me", {
        audience: RUNTIME_TOKEN_AUDIENCE,
        issuer: RUNTIME_TOKEN_ISSUER,
      }),
    ).not.toThrow();
    expect(() =>
      jwt.verify(b, "dev-only-agent-secret-change-me", {
        audience: RUNTIME_TOKEN_AUDIENCE,
        issuer: RUNTIME_TOKEN_ISSUER,
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
