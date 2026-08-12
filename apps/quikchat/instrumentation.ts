/**
 * Next.js instrumentation hook — runs once at server startup (before the app
 * handles requests). We start the call-timeout sweep here rather than as a
 * route module side-effect, so it boots with the server instead of lazily on
 * the first /api/realtime/token fetch.
 *
 * Guarded to the Node.js runtime: the sweep uses setInterval + Prisma, which
 * must not run on the edge runtime (instrumentation.ts executes in both). The
 * dynamic import MUST stay inside the `NEXT_RUNTIME === "nodejs"` block: Next
 * inlines that check as a compile-time constant, so the edge build sees
 * `if (false) { … }` and dead-code-eliminates the import. Its transitive graph
 * (timeout-sweep → calling.service → messages.service → storage/gcs →
 * @google-cloud/storage) reaches for Node's `https`, which the edge runtime
 * can't resolve — so it must never enter the edge bundle.
 *
 * Also guarded on DATABASE_URL: importing the sweep constructs the shared
 * Prisma client at module load, which throws if DATABASE_URL is unset. Skipping
 * when it's absent lets a DB-less local run (e.g. a UI-only smoke-test) boot
 * cleanly. Production (DATABASE_URL always in the container/Vercel env) and any
 * dev with a configured DB still start the sweep.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProductionSecrets();

    if (!process.env.DATABASE_URL) return;
    await assertQuikChatAppRegistered();
    const { startCallTimeoutSweep } = await import("@/lib/server/calling/timeout-sweep");
    startCallTimeoutSweep();
  }
}

/**
 * Fail loudly when this deployment has no `App` row for slug `quikchat`.
 *
 * WHY THIS IS WORSE THAN A CRASH, AND SO NEEDS ITS OWN CHECK: with the row
 * missing, `getQuikChatAppId()` returns null, so `userCan()` returns false for
 * EVERYTHING and no role can be seeded or resolved — yet the app stays up and
 * serves chat, because only a handful of call sites are `userCan`-gated and
 * `requireAdmin` admits platform admins on ROLE_HIERARCHY without ever touching
 * `appId`. The result is a running QuikChat that has silently shed its
 * permission-gated features, with nothing in the logs saying so. A brick would
 * at least be noticed.
 *
 * ── WHY THE BEHAVIOUR SPLITS THREE WAYS ────────────────────────────────────
 * Unlike `assertProductionSecrets` — pure env reads, zero I/O, so throwing is
 * free — this is a DB query, which makes boot depend on the database being
 * reachable. `register()` runs on every cold start, so an unconditional throw
 * would turn a brief DB blip into a crash loop across all of them: a degraded
 * deployment becomes a total outage. So we only hard-fail when we actually
 * KNOW the row is absent:
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
    const { db } = await import("@quikit/database");
    registered = !!(await db.app.findUnique({
      where: { slug: "quikchat" },
      select: { id: true },
    }));
  } catch (e) {
    // Could not determine. Never fail the boot on this — see the docblock.
    const { logger, errorFields } = await import("@/lib/shared");
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
  const { logger } = await import("@/lib/shared");
  logger.error(
    { appSlug: "quikchat" },
    `QuikChat is not registered: ${REMEDY} (Boot continues in development.)`,
  );
}

/**
 * `lib/server/storage/tokens.ts` and `lib/server/runtime/token.ts` fall back to
 * hardcoded, source-visible dev secrets when their env var is unset — fine for
 * local work, but a real risk if a production deploy is missing one: anyone who
 * can read this repo can forge signed upload/download or agent tokens against
 * it, with no indication anything is wrong (the fallback signs successfully).
 * Fail the boot instead of accepting that indefinitely. Collect every missing
 * var so one restart surfaces the whole list rather than one at a time.
 *
 * Env vars are read directly (not via the getters they gate) so this check has
 * no import-time side effects of its own.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;
  const required = ["UPLOAD_TOKEN_SECRET", "AGENT_JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start in production with missing secret(s): ${missing.join(", ")}. ` +
        "Each falls back to a hardcoded, source-visible dev value that would let anyone who can " +
        "read this repo forge signed tokens against this deployment.",
    );
  }
}
