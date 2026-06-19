import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/metrics/route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/metrics", { method: "GET", headers });
}

const SAVED = process.env.METRICS_TOKEN;

afterEach(() => {
  if (SAVED === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = SAVED;
});

describe("GET /api/metrics", () => {
  it("returns 403 when METRICS_TOKEN is not configured", async () => {
    delete process.env.METRICS_TOKEN;
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns 401 when the bearer token is missing or wrong", async () => {
    process.env.METRICS_TOKEN = "secret-token";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req({ authorization: "Bearer nope" }))).status).toBe(401);
  });

  it("returns 200 with the Prometheus exposition when the token matches", async () => {
    process.env.METRICS_TOKEN = "secret-token";
    const res = await GET(req({ authorization: "Bearer secret-token" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("quikinfra_");
  });
});
