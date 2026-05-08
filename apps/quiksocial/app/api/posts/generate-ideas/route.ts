/**
 * POST /api/posts/generate-ideas
 *
 * Proxies to the Python AI service /generate-ideas endpoint.
 *
 * Ported to QuikIT (Phase 3, Batch 2):
 *   - withOrgAuth wrapper
 *   - { orgId, userId } added to FastAPI payload
 *   - { success, data } envelope
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const generateIdeasSchema = z
  .object({ prompt: z.string().min(1) })
  .passthrough();

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = generateIdeasSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "prompt is required" },
      { status: 422 },
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
    const upstream = await fetch(`${aiServiceUrl}/generate-ideas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QS-Internal-Token": internalToken,
      },
      body: JSON.stringify({ ...parsed.data, org_id: orgId, user_id: userId }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!upstream.ok) {
      return NextResponse.json(
        {
          success: false,
          error: (data.detail as string | undefined) ?? "Failed to generate ideas",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return NextResponse.json(
        { success: false, error: "AI service timed out. Please try again." },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not reach the AI service." },
      { status: 502 },
    );
  }
});
