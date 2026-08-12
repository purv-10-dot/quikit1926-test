import { getRedis } from "@quikit/redis";

const PREFIX = "crmexpress:handoff:jti:";

/**
 * SEC-02: single-use enforcement for SSO handoff tokens.
 *
 * The launcher stamps a `jti` on every handoff token but the consumer never
 * consumed it, so a token captured (e.g. from Referer / history logs) could be
 * replayed within its TTL to mint a fresh 7-day session. This marks the jti as
 * consumed with an atomic `SET NX EX`, returning true only on the FIRST use so
 * concurrent replays can't both win.
 *
 * Redis fallback: when Redis is not configured (local dev, `getRedis()` → null)
 * or errors, this returns true and relies on the tightened token freshness
 * window (`maxTokenAge` in the handoff route) as the backstop — matching the
 * app's existing "Redis-enforced in production" model. The failure is logged so
 * a prod misconfiguration is visible.
 */
export async function consumeHandoffJti(
  jti: string,
  ttlSeconds = 120,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // dev fallback; freshness window still bounds replay
  try {
    const res = await redis.set(`${PREFIX}${jti}`, "1", "EX", ttlSeconds, "NX");
    return res === "OK";
  } catch (error: unknown) {
    console.error("[auth-handoff] jti consume failed; allowing (freshness window applies)", error);
    return true;
  }
}
