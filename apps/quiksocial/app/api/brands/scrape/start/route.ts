/**
 * POST /api/brands/scrape/start
 *
 * Starts an async brand scrape job on the Python AI service.
 * Returns { scrapeId, wsToken, wsUrl } immediately — no waiting.
 *
 * Ported to QuikIT (Phase 3, Batch 1):
 *   - withOrgAuth wrapper
 *   - orgId is passed to the FastAPI service so generated payloads
 *     can be associated with the right org downstream
 *   - { success, data } envelope
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const startScrapeSchema = z.object({
  websiteUrl: z.string().min(1),
  companyNameHint: z.string().optional(),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => ({}));
  const parsed = startScrapeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "websiteUrl is required" },
      { status: 422 },
    );
  }
  const { websiteUrl, companyNameHint } = parsed.data;

  let url = websiteUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8055";
  const internalToken = process.env.QS_INTERNAL_TOKEN;

  if (!internalToken) {
    console.error("[scrape/start] QS_INTERNAL_TOKEN not set");
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const params: Record<string, string> = {
      website_url: url,
      download_logo: "true",
      deep_scrape: "true",
      // QuikIT integration: pass org context so the FastAPI service can
      // namespace generated artifacts (e.g. Cloudinary folder = org-scoped).
      org_id: orgId,
      user_id: userId,
    };
    if (companyNameHint?.trim()) {
      params.company_name_hint = companyNameHint.trim();
    }

    const upstream = await fetch(`${aiServiceUrl}/smart-scrape-v2/async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-QS-Internal-Token": internalToken,
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error("[scrape/start] upstream error", upstream.status, text.slice(0, 500));
      return NextResponse.json(
        {
          success: false,
          error: "Scraping service unavailable. Try again or enter details manually.",
        },
        { status: 502 },
      );
    }

    const data = (await upstream.json()) as Record<string, unknown>;
    const scrapeId =
      (data.scrape_id as string | undefined) ??
      (data.scrapeId as string | undefined) ??
      (data.id as string | undefined) ??
      null;
    const wsToken =
      (data.ws_token as string | undefined) ?? (data.wsToken as string | undefined) ?? null;

    if (!scrapeId) {
      console.error("[scrape/start] no scrape_id in response", data);
      return NextResponse.json(
        { success: false, error: "Scraping service did not return a job ID." },
        { status: 502 },
      );
    }

    const rawWsUrl =
      process.env.AI_SERVICE_WS_URL ??
      aiServiceUrl.replace(/^http(s?):\/\//, (_, s) => `ws${s}://`);

    return NextResponse.json({
      success: true,
      data: { scrapeId, wsToken, wsUrl: rawWsUrl },
    });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return NextResponse.json(
        {
          success: false,
          error: "Scraping service timed out. Try again or enter details manually.",
        },
        { status: 504 },
      );
    }
    console.error("[scrape/start] fetch error", error);
    return NextResponse.json(
      { success: false, error: "Could not reach the scraping service." },
      { status: 502 },
    );
  }
});
