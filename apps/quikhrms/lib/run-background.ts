/**
 * Run heavy work in-process, fire-and-forget, after the request has responded.
 *
 * QuikHRMS no longer uses a BullMQ worker — heavy operations (payroll compute,
 * payslip release, bulk employee import) run here in the long-lived Next server
 * process and report progress via their own Postgres status record (the UI polls
 * it). The triggering route creates the status record, calls runBackground(...),
 * and returns 202 immediately.
 *
 * Never throws into the caller: errors are logged and passed to `onError` so the
 * route's status record can be marked failed. Relies on a persistent server
 * (GKE / `next start` / `next dev`) — not Vercel serverless. Next 14 has no
 * `after()`, so this is a plain un-awaited promise.
 */
export function runBackground(
  label: string,
  fn: () => Promise<void>,
  onError?: (err: unknown) => Promise<void> | void,
): void {
  void (async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[background:${label}] failed:`, err instanceof Error ? err.message : err);
      try {
        await onError?.(err);
      } catch (cleanupErr) {
        console.error(`[background:${label}] onError cleanup failed:`, cleanupErr);
      }
    }
  })();
}
