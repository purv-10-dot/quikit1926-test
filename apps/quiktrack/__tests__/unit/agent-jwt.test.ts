import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EncryptJWT } from "jose";
import hkdf from "@panva/hkdf";
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
});
