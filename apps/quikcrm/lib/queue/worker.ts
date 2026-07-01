/**
 * BullMQ worker entrypoint — DISABLED.
 *
 * The BullMQ/Redis queue backend has been removed from this deployment, so there
 * is nothing for the worker to process. This entrypoint now exits immediately
 * with a clear message instead of spawning queue workers.
 *
 * (Imports and automation are disabled at the route layer via
 * `requireRedisOr503()`, which always returns 503.)
 */

function main(): void {
  console.error(
    "[worker] Background processing is disabled — the BullMQ/Redis queue " +
      "backend has been removed. There is nothing to process.",
  );
  process.exit(1);
}

main();
