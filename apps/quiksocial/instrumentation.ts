/**
 * Next.js instrumentation hook (enabled via experimental.instrumentationHook).
 *
 * Runs once per process startup. We use it to boot the in-process cron
 * driver that polls /api/cron/publish-scheduled every 30s. Only the Node
 * runtime starts the scheduler — the Edge runtime cannot keep timers alive.
 *
 * Set DISABLE_INPROCESS_CRON=true to suppress the in-process driver where an
 * external scheduler owns cron (e.g. the GKE k8s CronJobs hitting the cron
 * routes). Default-on: unset/anything-else keeps the timer for local/UAT.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.DISABLE_INPROCESS_CRON !== "true"
  ) {
    const { startCronScheduler } = await import("@/lib/cron/scheduler");
    startCronScheduler();
  }
}
