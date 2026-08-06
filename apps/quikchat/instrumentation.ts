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
    const { startCallTimeoutSweep } = await import("@/lib/server/calling/timeout-sweep");
    startCallTimeoutSweep();
  }
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
