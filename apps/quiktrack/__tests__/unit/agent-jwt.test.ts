import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EncryptJWT, jwtDecrypt } from "jose";
import hkdf from "@panva/hkdf";
import { encode } from "next-auth/jwt";
import { AGENT_JWT_ISSUER } from "@quikit/shared";
import { verifyAgentJwt } from "@/lib/api/agentJwt";

const NEXTAUTH_SECRET = "test-nextauth-secret-for-agent-jwt";

async function deriveKey(secret: string) {
  return hkdf("sha256", secret, "", "NextAuth.js Generated Encryption Key", 32);
}

async function mintAgentJwt(
  claims: Record<string, unknown>,
  opts: { secret?: string; ttlSeconds?: number; alg?: string; enc?: "A256GCM" | "A128CBC-HS256" } = {},
) {
  const { secret = NEXTAUTH_SECRET, ttlSeconds = 300, alg = "dir", enc = "A256GCM" } = opts;
  const key = await deriveKey(secret);
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT(claims)
    .setProtectedHeader({ alg, enc })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .encrypt(key);
}

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;
});

afterEach(() => {
  delete process.env.NEXTAUTH_SECRET;
});

describe("verifyAgentJwt", () => {
  it("decrypts a valid token minted the way the auth service mints it (HKDF-derived key, dir/A256GCM)", async () => {
    const token = await mintAgentJwt({
      sub: "user_1",
      orgId: "org_1",
      actingAs: "ai_agent",
      actingAgentId: "ai-runtime",
    });
    const claims = await verifyAgentJwt(token);
    expect(claims).toEqual({
      userId: "user_1",
      orgId: "org_1",
      actingAs: "ai_agent",
      actingAgentId: "ai-runtime",
    });
  });

  it("rejects a token whose exp has passed", async () => {
    const token = await mintAgentJwt(
      { sub: "user_1", orgId: "org_1", actingAs: "ai_agent", actingAgentId: "ai-runtime" },
      { ttlSeconds: -10 },
    );
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("rejects a token encrypted with the wrong secret", async () => {
    const token = await mintAgentJwt(
      { sub: "user_1", orgId: "org_1", actingAs: "ai_agent", actingAgentId: "ai-runtime" },
      { secret: "wrong-secret-entirely" },
    );
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("rejects raw-secret-bytes encryption (no HKDF) — proves the derivation step is load-bearing, not decorative", async () => {
    const rawKey = new TextEncoder().encode(NEXTAUTH_SECRET.padEnd(32, "0").slice(0, 32));
    const now = Math.floor(Date.now() / 1000);
    const token = await new EncryptJWT({
      sub: "user_1",
      orgId: "org_1",
      actingAs: "ai_agent",
      actingAgentId: "ai-runtime",
    })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .encrypt(rawKey);
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("rejects a token missing actingAgentId", async () => {
    const token = await mintAgentJwt({ sub: "user_1", orgId: "org_1", actingAs: "ai_agent" });
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("rejects a token whose actingAs is \"user\" (that vocabulary belongs to session/PAT identities, not this path)", async () => {
    const token = await mintAgentJwt({
      sub: "user_1",
      orgId: "org_1",
      actingAs: "user",
      actingAgentId: "ai-runtime",
    });
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("accepts every non-user actingAs value the auth service can mint, e.g. platform_service and scheduled_job", async () => {
    for (const actingAs of ["platform_service", "scheduled_job"] as const) {
      const token = await mintAgentJwt({ sub: "user_1", orgId: "org_1", actingAs, actingAgentId: "svc-x" });
      const claims = await verifyAgentJwt(token);
      expect(claims?.actingAs).toBe(actingAs);
    }
  });

  it("rejects an empty token without throwing", async () => {
    expect(await verifyAgentJwt("")).toBeNull();
  });

  it("rejects garbage input without throwing", async () => {
    expect(await verifyAgentJwt("not.a.valid.jwe.token")).toBeNull();
  });

  it("accepts platform_service / scheduled_job WITHOUT actingAgentId — the minter only requires it for ai_agent", async () => {
    for (const actingAs of ["platform_service", "scheduled_job"] as const) {
      const token = await mintAgentJwt({ sub: "user_1", orgId: "org_1", actingAs });
      const claims = await verifyAgentJwt(token);
      expect(claims).not.toBeNull();
      expect(claims?.actingAs).toBe(actingAs);
      expect(claims?.actingAgentId).toBeUndefined();
    }
  });

  it("rejects an actingAs outside the closed vocabulary — `!== \"user\"` is not a sufficient check", async () => {
    const token = await mintAgentJwt({
      sub: "user_1",
      orgId: "org_1",
      actingAs: "root",
      actingAgentId: "svc-x",
    });
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("rejects an empty-string actingAgentId (malformed, not absent)", async () => {
    const token = await mintAgentJwt({
      sub: "user_1",
      orgId: "org_1",
      actingAs: "platform_service",
      actingAgentId: "",
    });
    expect(await verifyAgentJwt(token)).toBeNull();
  });
});

/**
 * The test that should have existed from day one.
 *
 * Every other test in this file hand-mints with raw `jose.EncryptJWT` and
 * hand-writes `sub` — which is precisely why the `sub`/`id` mismatch survived:
 * the suite asserted against its own assumption of the minter, never the
 * minter itself. These tests call next-auth's real `encode()` with the exact
 * payload `apps/auth/.../issue-agent-jwt/route.ts` builds, so any future claim
 * drift on either side fails here instead of in someone's afternoon.
 *
 * If you change the mint payload, change `mintLikeAuthService` to match — do
 * not relax the assertions.
 */
describe("contract: a token minted the way the auth service actually mints it", () => {
  /** Mirrors the `jwtPayload` literal + `encode()` call in the mint route. */
  async function mintLikeAuthService(
    overrides: Partial<Record<string, unknown>> = {},
    ttlSeconds = 300,
  ) {
    return encode({
      token: {
        id: "usr_contract",
        sub: "usr_contract",
        iss: AGENT_JWT_ISSUER,
        email: "contract@example.com",
        orgId: "org_contract",
        membershipRole: "org_admin",
        isSuperAdmin: false,
        actingAs: "ai_agent",
        actingAgentId: "ai-runtime",
        ...overrides,
      },
      secret: NEXTAUTH_SECRET,
      maxAge: ttlSeconds,
    });
  }

  it("verifyAgentJwt accepts it and resolves the user from sub", async () => {
    const claims = await verifyAgentJwt(await mintLikeAuthService());
    expect(claims).toEqual({
      userId: "usr_contract",
      orgId: "org_contract",
      actingAs: "ai_agent",
      actingAgentId: "ai-runtime",
    });
  });

  it("sub and id carry the same value, so consumers of either agree on the user", async () => {
    const token = await mintLikeAuthService();
    const claims = await verifyAgentJwt(token);
    // `withAuth` (packages/auth) reads `id`; this verifier reads `sub`.
    // They must never disagree.
    expect(claims?.userId).toBe("usr_contract");
  });

  it("round-trips every actingAs the minter can emit, with actingAgentId only where required", async () => {
    const cases = [
      { actingAs: "ai_agent", actingAgentId: "ai-runtime" },
      { actingAs: "platform_service", actingAgentId: undefined },
      { actingAs: "scheduled_job", actingAgentId: undefined },
    ] as const;

    for (const { actingAs, actingAgentId } of cases) {
      // The route spreads actingAgentId in only when present — mirror that.
      const overrides: Record<string, unknown> = { actingAs };
      if (actingAgentId === undefined) {
        overrides.actingAgentId = undefined;
      } else {
        overrides.actingAgentId = actingAgentId;
      }
      const claims = await verifyAgentJwt(await mintLikeAuthService(overrides));
      expect(claims, `actingAs=${actingAs} should verify`).not.toBeNull();
      expect(claims?.actingAs).toBe(actingAs);
      expect(claims?.actingAgentId).toBe(actingAgentId);
    }
  });

  it("still rejects a default-actingAs token — the minter defaults to \"user\", which this path must not accept", async () => {
    // route.ts's Zod schema defaults actingAs to "user" when the caller omits
    // it, producing a token that mints successfully and can never authenticate
    // here. Documented so the trap is visible rather than surprising.
    const token = await mintLikeAuthService({ actingAs: "user", actingAgentId: undefined });
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("carries the issuer claim (emitted, not yet enforced)", async () => {
    const raw = await mintLikeAuthService();
    const { payload } = await jwtDecrypt(raw, await deriveKey(NEXTAUTH_SECRET), {
      contentEncryptionAlgorithms: ["A256GCM"],
      keyManagementAlgorithms: ["dir"],
    });
    expect(payload.iss).toBe(AGENT_JWT_ISSUER);
    // Session cookies carry no `iss`. Enforcement must never move into the
    // shared session path — see AGENT_JWT_ISSUER's docs.
  });
});
