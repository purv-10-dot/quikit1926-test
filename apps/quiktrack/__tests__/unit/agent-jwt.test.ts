import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

/* ───────────────── sub required, age bound, diagnostics ───────────────── */

const BASE = { orgId: "org_1", actingAs: "ai_agent", actingAgentId: "ai-runtime" } as const;

/**
 * Lower-level mint than `mintAgentJwt` above: `iat` and `exp` can each be set
 * to an explicit epoch second, or to `null` to OMIT the claim entirely. The
 * omission cases are the point — `mintAgentJwt` always sets both, so it cannot
 * express a token that bypasses the age bound.
 */
async function mintRaw(
  claims: Record<string, unknown>,
  opts: { iat?: number | null; exp?: number | null } = {},
) {
  const key = await deriveKey(NEXTAUTH_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const { iat = now, exp = now + 300 } = opts;
  let jwt = new EncryptJWT(claims).setProtectedHeader({ alg: "dir", enc: "A256GCM" });
  if (iat !== null) jwt = jwt.setIssuedAt(iat);
  if (exp !== null) jwt = jwt.setExpirationTime(exp);
  return jwt.encrypt(key);
}

describe("verifyAgentJwt — sub is required", () => {
  it("uses sub when present, and warns nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const token = await mintRaw({ sub: "user_sub", ...BASE });
    expect((await verifyAgentJwt(token))?.userId).toBe("user_sub");
    // Load-bearing: if the warning ever fires on the `sub` path it becomes
    // always-on, and the removal condition it exists for stops meaning anything.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects a token carrying only id — `sub` is the claim this path resolves the user from", async () => {
    expect(await verifyAgentJwt(await mintRaw({ id: "user_id", ...BASE }))).toBeNull();
  });

  it("ignores a stray id claim when sub is present", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const token = await mintRaw({ sub: "user_sub", id: "user_id", ...BASE });
    expect((await verifyAgentJwt(token))?.userId).toBe("user_sub");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects a token carrying neither sub nor id", async () => {
    expect(await verifyAgentJwt(await mintRaw({ ...BASE }))).toBeNull();
  });

  it("rejects a token whose sub and id are both empty strings", async () => {
    expect(await verifyAgentJwt(await mintRaw({ sub: "", id: "", ...BASE }))).toBeNull();
  });
});

describe("verifyAgentJwt — max age", () => {
  const now = () => Math.floor(Date.now() / 1000);

  it("accepts a token at exactly the 900s bound (what the auth service mints)", async () => {
    const t = now();
    const token = await mintRaw({ sub: "user_1", ...BASE }, { iat: t, exp: t + 900 });
    expect(await verifyAgentJwt(token)).not.toBeNull();
  });

  it("rejects a token one second over the bound", async () => {
    const t = now();
    const token = await mintRaw({ sub: "user_1", ...BASE }, { iat: t, exp: t + 901 });
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("rejects a token with no iat — otherwise the bound is bypassed by omission", async () => {
    const t = now();
    const token = await mintRaw({ sub: "user_1", ...BASE }, { iat: null, exp: t + 300 });
    expect(await verifyAgentJwt(token)).toBeNull();
  });

  it("rejects a token with no exp — jwtDecrypt only enforces exp when present, so it would never expire", async () => {
    const token = await mintRaw({ sub: "user_1", ...BASE }, { exp: null });
    expect(await verifyAgentJwt(token)).toBeNull();
  });
});

describe("verifyAgentJwt — debug diagnostics", () => {
  afterEach(() => {
    delete process.env.ALLOW_AGENT_JWT_DEBUG;
  });

  it("stays silent when ALLOW_AGENT_JWT_DEBUG is unset", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    expect(await verifyAgentJwt("not.a.valid.jwe.token")).toBeNull();
    expect(await verifyAgentJwt("")).toBeNull();
    expect(debug).not.toHaveBeenCalled();
    debug.mockRestore();
  });

  it("names the failing check when enabled", async () => {
    process.env.ALLOW_AGENT_JWT_DEBUG = "true";
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const t = Math.floor(Date.now() / 1000);
    await verifyAgentJwt(await mintRaw({ sub: "user_1", ...BASE }, { iat: t, exp: t + 901 }));
    expect(String(debug.mock.calls[0]?.[0])).toContain("age exceeds");
    debug.mockRestore();
  });

  /**
   * The no-leak claim, enforced rather than asserted: a canary claim whose
   * NAME must appear (key names are what make a shape mismatch diagnosable)
   * and whose VALUE must not (that is the line the debug log must never cross).
   */
  it("logs claim key names but never a claim value", async () => {
    process.env.ALLOW_AGENT_JWT_DEBUG = "true";
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    // `id` where `sub` was expected → shape mismatch → the keys branch logs.
    // This is the exact mismatch the flag exists for.
    const token = await mintRaw({
      id: "user_1",
      orgId: "org_1",
      actingAs: "ai_agent",
      canaryClaim: "MUST-NOT-APPEAR-IN-LOGS",
    });
    expect(await verifyAgentJwt(token)).toBeNull();
    const emitted = debug.mock.calls.map((c) => String(c[0])).join("\n");
    expect(emitted).toContain("canaryClaim");
    expect(emitted).not.toContain("MUST-NOT-APPEAR-IN-LOGS");
    expect(emitted).not.toContain("user_1");
    expect(emitted).not.toContain("org_1");
    debug.mockRestore();
  });
});
