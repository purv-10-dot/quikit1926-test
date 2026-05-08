/**
 * POST /api/ai/plan-month
 *
 * Forwards the planning request to the Python AI service. The Python
 * service runs a single cheap Gemini text call and returns a structured
 * JSON plan — no image generation happens here.
 *
 * Body shape (validated by the Python service's Pydantic model):
 * {
 *   brandId:            string
 *   month:              number   1-12
 *   year:               number
 *   productsToFeature:  string[]
 *   servicesToFeature:  string[]
 *   postsPerWeek:       number   (-1 = daily)
 *   upcomingEvents:     string | null
 *   letAIDecideDays:    boolean
 *   selectedDays:       string[]  e.g. ["Mon","Wed","Fri"]
 *   country:            string | null
 * }
 *
 * Ported to QuikIT (Phase 3, Batch 5):
 *   - withOrgAuth wrapper
 *   - { org_id, user_id } added to the FastAPI payload
 *   - { success, data } envelope
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const planMonthSchema = z
  .object({
    brandId: z.string().min(1),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(1900).max(9999),
  })
  .passthrough();

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = planMonthSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Missing required fields: brandId, month, year",
      },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8055";
  const internalToken = process.env.QS_INTERNAL_TOKEN;

  if (!internalToken) {
    console.error("[plan-month] QS_INTERNAL_TOKEN is not set");
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const upstream = await fetch(`${aiServiceUrl}/plan-month`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QS-Internal-Token": internalToken,
      },
      body: JSON.stringify({ ...body, org_id: orgId, user_id: userId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok) {
      const err = (await upstream
        .json()
        .catch(() => ({ detail: "Unknown error" }))) as {
        detail?: string;
      };
      console.error("[plan-month] AI service error:", upstream.status, err);
      return NextResponse.json(
        {
          success: false,
          error: err.detail ?? `AI service returned ${upstream.status}`,
        },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      );
    }

    const data = await upstream.json();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return NextResponse.json(
        {
          success: false,
          error: "Planning request timed out. Please try again.",
        },
        { status: 504 },
      );
    }
    console.error("[plan-month] Fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Could not reach the AI service" },
      { status: 502 },
    );
  }
});
