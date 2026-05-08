/**
 * GET /api/brands/scrape/status/[scrapeId]
 *
 * Polls the Python AI service for the status of a scrape job.
 * Pass-through proxy — returns whatever shape the FastAPI service
 * returns, wrapped in the QuikIT { success, data } envelope.
 *
 * Ported to QuikIT (Phase 3, Batch 1).
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const GET = withOrgAuth<{ scrapeId: string }>(
  async ({ orgId }, _req: NextRequest, { params }) => {
    const { scrapeId } = params;
    if (!scrapeId) {
      return NextResponse.json(
        { success: false, error: "scrapeId is required" },
        { status: 400 },
      );
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8055";
    const internalToken = process.env.QS_INTERNAL_TOKEN;

    if (!internalToken) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    try {
      const upstream = await fetch(
        `${aiServiceUrl}/smart-scrape-v2/status/${encodeURIComponent(scrapeId)}?org_id=${encodeURIComponent(orgId)}`,
        {
          headers: { "X-QS-Internal-Token": internalToken },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!upstream.ok) {
        return NextResponse.json({
          success: true,
          data: { status: "failed", error: `Scraping service error: ${upstream.status}` },
        });
      }

      const data = await upstream.json();
      // Pass through the upstream payload verbatim under data.
      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        // Treat timeout as still pending — client retries.
        return NextResponse.json({ success: true, data: { status: "pending" } });
      }
      return NextResponse.json({
        success: true,
        data: { status: "failed", error: "Could not reach the scraping service." },
      });
    }
  },
);
