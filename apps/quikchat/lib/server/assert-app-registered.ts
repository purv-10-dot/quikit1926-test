import { db } from "@quikit/database";
// NARROW import, not the `@/lib/shared` barrel — deliberately. The barrel
// re-exports publish.ts / index-events.ts / rate-limit.ts, all of which import
// ioredis. `logger.ts` pulls only pino. See the module docblock for why that
// distinction became load-bearing.
import { errorFields, logger } from "@/lib/shared/logger";

/**
 * Boot-time check that this deployment has an `App` row for slug `quikchat`.
 *
 * ── WHY THIS LIVES IN ITS OWN MODULE ───────────────────────────────────────
 * It was written inline in `instrumentation.ts` and broke `next build`.
 *
 * `instrumentation.ts` is compiled for BOTH the Node and edge runtimes. Next
 * inlines `process.env.NEXT_RUNTIME === "nodejs"` as a compile-time constant,
 * so the edge build sees `if (false) { … }` and dead-code-eliminates that
 * block — which is why the call-timeout sweep has always been dynamic-imported
 * from inside it.
 *
 * That elimination removes the CALL. It cannot remove an exported function
 * DECLARATION sitting at module level, so a `await import(…)` in that
 * function's body survives into the edge bundle even though nothing on edge can
 * reach it. The assertion imported `@/lib/shared`, the edge bundler followed
 * index.ts → publish.ts / index-events.ts → ioredis → `net`/`stream`, and the
 * production build failed with module-not-found. Dev only logged it and carried
 * on, so it looked cosmetic; `next build` does not, and `main` auto-deploys.
 *
 * Keeping this in a separate module means `instrumentation.ts` is left with
 * nothing but `assertProductionSecrets` (pure env reads, zero imports) outside
 * the guard, and everything heavyweight is reachable only through a dynamic
 * import inside it. Same shape as `calling/timeout-sweep`.
 *
 * ── WHAT IT CHECKS ─────────────────────────────────────────────────────────
 * With no App row, `getQuikChatAppId()` returns null, so `userCan()` is false
 * for EVERYTHING and no role can be seeded or resolved — yet the app stays up
 * and serves chat, because only a handful of call sites are `userCan`-gated and
 * `requireAdmin` admits platform admins on ROLE_HIERARCHY without ever touching
 * `appId`. A running QuikChat silently sheds its permission-gated features,
 * with nothing in the logs saying so. A brick would at least be noticed.
 *
 * ── WHY THE BEHAVIOUR SPLITS THREE WAYS ────────────────────────────────────
 * Unlike `assertProductionSecrets` — pure env reads, so throwing is free — this
 * is a DB query, which makes boot depend on the database being reachable.
 * `register()` runs on every cold start, so an unconditional throw would turn a
 * brief DB blip into a crash loop across all of them: a degraded deployment
 * becomes a total outage. So we only hard-fail when we actually KNOW the row is
 * absent:
 *
 *   • production + row definitively absent → THROW. Refuse to serve a silently
 *     de-permissioned app.
 *   • production + the query itself failed → log and continue. We cannot tell
 *     misconfiguration from a transient outage, and guessing wrong costs more.
 *   • development (either case)            → log and continue, never throw.
 *     A freshly-cloned DB without the row is a normal state; hard-failing a
 *     local boot gets this assertion deleted rather than the row inserted.
 *
 * Note the 30s negative cache in `getQuikChatAppId()`: after inserting the row,
 * a running process can stay de-permissioned briefly. Restart it.
 */
export async function assertQuikChatAppRegistered(): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const REMEDY =
    'no App row with slug "quikchat" exists. QuikChat will run but every ' +
    "permission-gated feature (channel/DM/call creation, moderation, assistant " +
    "ingest, the roles UI) is silently disabled, and no QuikChat role can be " +
    "seeded or assigned. Fix: insert an App row with slug = 'quikchat'.";

  let registered: boolean;
  try {
    registered = !!(await db.app.findUnique({
      where: { slug: "quikchat" },
      select: { id: true },
    }));
  } catch (e) {
    // Could not determine. Never fail the boot on this — see the docblock.
    logger.error(
      { ...errorFields(e) },
      "Could not verify the QuikChat App row at boot (database unreachable?). " +
        "Continuing — this is NOT a confirmed misconfiguration.",
    );
    return;
  }

  if (registered) return;

  if (isProd) {
    throw new Error(`Refusing to start in production: ${REMEDY}`);
  }
  logger.error(
    { appSlug: "quikchat" },
    `QuikChat is not registered: ${REMEDY} (Boot continues in development.)`,
  );
}
