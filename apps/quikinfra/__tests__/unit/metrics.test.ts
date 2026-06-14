import { describe, it, expect } from "vitest";
import {
  getMetrics,
  getContentType,
  recordHttpMetrics,
  httpRequestsTotal,
  boqImportsTotal,
} from "@/lib/observability/metrics";

describe("observability/metrics", () => {
  it("exposes default Node.js runtime metrics under the quikinfra_ prefix", async () => {
    const text = await getMetrics();
    expect(text).toContain("quikinfra_process_cpu_seconds_total");
    expect(text).toContain("quikinfra_nodejs_eventloop_lag_seconds");
  });

  it("registers the custom HTTP + business metrics", async () => {
    const text = await getMetrics();
    expect(text).toContain("quikinfra_http_request_duration_seconds");
    expect(text).toContain("quikinfra_http_requests_total");
    expect(text).toContain("quikinfra_boq_imports_total");
    expect(text).toContain("quikinfra_approval_actions_total");
    expect(text).toContain("quikinfra_purchase_orders_total");
  });

  it("getContentType returns the Prometheus exposition content type", () => {
    expect(getContentType()).toContain("text/plain");
  });

  it("recordHttpMetrics increments the request counter with method/route/status labels", async () => {
    const before = await httpRequestsTotal.get();
    const beforeVal =
      before.values.find(
        (v) =>
          v.labels.method === "GET" &&
          v.labels.route === "metrics-test" &&
          v.labels.status_code === "200",
      )?.value ?? 0;

    recordHttpMetrics({ method: "GET", route: "metrics-test", statusCode: 200, durationSeconds: 0.012 });

    const after = await httpRequestsTotal.get();
    const afterVal = after.values.find(
      (v) =>
        v.labels.method === "GET" &&
        v.labels.route === "metrics-test" &&
        v.labels.status_code === "200",
    )?.value;
    expect(afterVal).toBe(beforeVal + 1);
  });

  it("recordHttpMetrics observes the duration histogram (renders in the scrape output)", async () => {
    recordHttpMetrics({ method: "POST", route: "metrics-test", statusCode: 201, durationSeconds: 0.3 });
    const text = await getMetrics();
    expect(text).toContain('quikinfra_http_request_duration_seconds_count{method="POST",route="metrics-test",status_code="201"}');
  });

  it("never throws on bad input", () => {
    expect(() =>
      recordHttpMetrics({ method: "GET", route: "x", statusCode: NaN, durationSeconds: -1 }),
    ).not.toThrow();
  });

  it("business counters can be incremented", async () => {
    boqImportsTotal.inc({ org_id: "org-1" });
    const text = await getMetrics();
    expect(text).toContain('quikinfra_boq_imports_total{org_id="org-1"}');
  });
});
