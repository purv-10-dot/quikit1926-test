/**
 * Prometheus metrics — Phase 6 observability.
 *
 * Exposes standard HTTP metrics + business metrics for monitoring.
 * Scraped by Prometheus via GET /api/metrics.
 *
 * Metrics:
 *   - http_request_duration_seconds  — histogram of API response times
 *   - http_requests_total            — counter of total requests by route/method/status
 *   - active_sessions                — gauge of active sessions (approximated)
 *   - kpi_updates_total              — business counter for KPI weekly value saves
 *   - meetings_created_total         — business counter for new meetings
 *   - feedback_entries_total         — business counter for feedback drops
 */

import client from "prom-client";

// Collect default Node.js metrics (CPU, memory, event loop lag, GC, etc.)
client.collectDefaultMetrics({
  prefix: "quikscale_",
});

/* ── HTTP metrics ────────────────────────────────────────────────────── */

export const httpRequestDuration = new client.Histogram({
  name: "quikscale_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestsTotal = new client.Counter({
  name: "quikscale_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
});

/* ── Business metrics ────────────────────────────────────────────────── */

export const kpiUpdatesTotal = new client.Counter({
  name: "quikscale_kpi_updates_total",
  help: "Total number of KPI weekly value saves",
  labelNames: ["tenant_id"] as const,
});

export const meetingsCreatedTotal = new client.Counter({
  name: "quikscale_meetings_created_total",
  help: "Total number of meetings created",
  labelNames: ["tenant_id", "cadence"] as const,
});

export const feedbackEntriesTotal = new client.Counter({
  name: "quikscale_feedback_entries_total",
  help: "Total number of feedback entries created",
  labelNames: ["tenant_id", "category"] as const,
});

/* ── Registry export ─────────────────────────────────────────────────── */

export const registry = client.register;

/**
 * Get all metrics as a Prometheus-compatible text string.
 */
export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

/**
 * Get the content type for Prometheus scraping.
 */
export function getContentType(): string {
  return registry.contentType;
}
