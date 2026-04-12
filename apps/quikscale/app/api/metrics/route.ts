import { NextResponse } from "next/server";
import { getMetrics, getContentType } from "@/lib/metrics";

/**
 * GET /api/metrics — Prometheus scrape endpoint.
 *
 * No auth — Prometheus scraper needs unauthenticated access.
 * In production, restrict access via network policy (internal-only port)
 * or a shared secret header.
 */
export async function GET() {
  const metrics = await getMetrics();
  return new NextResponse(metrics, {
    status: 200,
    headers: { "Content-Type": getContentType() },
  });
}
