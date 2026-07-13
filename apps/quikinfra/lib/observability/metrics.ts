/**
 * Prometheus metrics — QuikInfra observability.
 *
 * Mirrors the QuikScale setup (apps/quikscale/lib/metrics.ts): default Node.js
 * runtime metrics + custom HTTP and business metrics, exposed for scraping via
 * GET /api/metrics.
 *
 * Metrics:
 *   - quikinfra_* (default)              — CPU, memory, event-loop lag, GC, …
 *   - quikinfra_http_request_duration_seconds — histogram of API response times
 *   - quikinfra_http_requests_total      — counter of requests by route/method/status
 *   - quikinfra_boq_imports_total        — business counter for BOQ imports
 *   - quikinfra_approval_actions_total   — business counter for approve/reject/return
 *   - quikinfra_purchase_orders_total    — business counter for POs created
 *
 * The HTTP metrics are recorded automatically for every route that goes through
 * the `withListRoute` / `withMutationRoute` wrappers (see route-wrappers.ts),
 * using the wrapper's `entityLabel` as the low-cardinality `route` label.
 */

import client from "prom-client";

export const registry = client.register;

// Collect default Node.js runtime metrics once. Guarded so re-imports (and the
// per-file module isolation under Vitest) can't throw a duplicate-registration
// error.
try {
  client.collectDefaultMetrics({ prefix: "quikinfra_" });
} catch {
  // already collecting on this registry — fine
}

/**
 * Return an existing metric of the given name, or create it. prom-client throws
 * if you register the same metric name twice on a registry; this guard keeps the
 * module safe to import from multiple places (route-wrappers, the /metrics route,
 * tests) without blowing up.
 */
function getOrCreateHistogram(
  cfg: client.HistogramConfiguration<string>,
): client.Histogram<string> {
  return (
    (registry.getSingleMetric(cfg.name) as client.Histogram<string>) ??
    new client.Histogram(cfg)
  );
}
function getOrCreateCounter(
  cfg: client.CounterConfiguration<string>,
): client.Counter<string> {
  return (
    (registry.getSingleMetric(cfg.name) as client.Counter<string>) ??
    new client.Counter(cfg)
  );
}

/* ── HTTP metrics ────────────────────────────────────────────────────── */

export const httpRequestDuration = getOrCreateHistogram({
  name: "quikinfra_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestsTotal = getOrCreateCounter({
  name: "quikinfra_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

/* ── Business metrics ────────────────────────────────────────────────── */

export const boqImportsTotal = getOrCreateCounter({
  name: "quikinfra_boq_imports_total",
  help: "Total number of BOQ imports persisted",
  labelNames: ["org_id"],
});

export const approvalActionsTotal = getOrCreateCounter({
  name: "quikinfra_approval_actions_total",
  help: "Total number of approval actions taken",
  labelNames: ["org_id", "action"],
});

export const purchaseOrdersTotal = getOrCreateCounter({
  name: "quikinfra_purchase_orders_total",
  help: "Total number of purchase orders created",
  labelNames: ["org_id"],
});

/* ── Recording helper ────────────────────────────────────────────────── */

/**
 * Record one HTTP request's duration + count. Never throws — metric recording
 * must not affect the response.
 */
export function recordHttpMetrics(args: {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}): void {
  try {
    const labels = {
      method: args.method,
      route: args.route,
      status_code: String(args.statusCode),
    };
    httpRequestDuration.observe(labels, args.durationSeconds);
    httpRequestsTotal.inc(labels);
  } catch {
    // swallow — observability must never break a request
  }
}

/* ── Registry export ─────────────────────────────────────────────────── */

/** All metrics as a Prometheus-compatible text exposition string. */
export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

/** Content type for Prometheus scraping. */
export function getContentType(): string {
  return registry.contentType;
}
