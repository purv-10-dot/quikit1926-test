import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getMetrics, getContentType } from "@/lib/metrics";

/**
 * GET /api/metrics — Prometheus scrape endpoint.
 *
 * Requires METRICS_TOKEN env var in production. Prometheus scraper
 * must pass `Authorization: Bearer <token>` header.
 */
export async function GET(request: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  if (!token) {
    // Deny access when no token is configured — prevents accidental exposure
    return NextResponse.json({ error: "Metrics endpoint not configured" }, { status: 403 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metrics = await getMetrics();
  return new NextResponse(metrics, {
    status: 200,
    headers: { "Content-Type": getContentType() },
  });
}
