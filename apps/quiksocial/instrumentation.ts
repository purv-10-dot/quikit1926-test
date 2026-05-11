/**
 * Next.js instrumentation hook (enabled via experimental.instrumentationHook).
 *
 * Runs once per process startup. We use it to boot the in-process cron
 * driver that polls /api/cron/publish-scheduled every 30s. Only the Node
 * runtime starts the scheduler — the Edge runtime cannot keep timers alive.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronScheduler } = await import("@/lib/cron/scheduler");
    startCronScheduler();
  }
}
