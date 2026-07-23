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
    if (!process.env.DATABASE_URL) return;
    const { startCallTimeoutSweep } = await import("@/lib/server/calling/timeout-sweep");
    startCallTimeoutSweep();
  }
}
