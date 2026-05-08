/**
 * POST /api/campaigns/[id]/notify-complete
 *
 * Server-to-server callback fired by the Celery campaign_task when a run
 * finishes. Sends the campaign-owner an email summarising what generated.
 *
 * Auth: X-QS-Internal-Token header. The AI service is the only caller.
 *
 * Body (from FastAPI tasks.py _post_notify_complete):
 *   { postsGenerated, totalPosts, orgId? }
 *
 * Ported to QuikIT (Phase 3, Batch 2). Org resolution: prefers an `orgId`
 * supplied by the FastAPI caller (added in this port), falls back to
 * DEFAULT_ORG_ID for parity with the legacy single-org behavior.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendCampaignReadyEmail } from "@/lib/utils/email";

const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ||
  process.env.DEFAULT_TENANT_ID ||
  "org_quiksocial_default";

const notifySchema = z.object({
  postsGenerated: z.number().int().nonnegative().optional(),
  totalPosts: z.number().int().nonnegative().optional(),
  orgId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Internal token auth (no session).
  const provided = req.headers.get("x-qs-internal-token");
  const expected = process.env.QS_INTERNAL_TOKEN;
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = notifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const campaignId = params.id;
  const postsGenerated = body.postsGenerated ?? 0;
  const totalPosts = body.totalPosts ?? 0;
  const orgId = body.orgId ?? DEFAULT_ORG_ID;

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, orgId },
  });
  if (!campaign) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404 },
    );
  }

  if (!campaign.createdBy) {
    return NextResponse.json(
      { success: false, error: "Campaign has no creator on file" },
      { status: 404 },
    );
  }

  const user = await db.user.findUnique({
    where: { id: campaign.createdBy },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!user || !user.email) {
    return NextResponse.json(
      { success: false, error: "Campaign owner has no email on file" },
      { status: 404 },
    );
  }

  const baseUrl =
    (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const campaignsUrl = baseUrl
    ? `${baseUrl}/dashboard/campaigns`
    : "/dashboard/campaigns";

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;

  // Email opt-out for staging — Railway-egress to Gmail SMTP (port 465) is
  // unreliable on the UAT plan. The campaigns page polling fallback marks
  // the run as "done" on remount once posts >= totalPosts, so the user
  // sees completion in-app without needing the email.
  if (process.env.ENVIRONMENT === "staging") {
    console.log(
      `[notify-complete] STAGING: skipping email to ${user.email} for "${campaign.name}" (${postsGenerated}/${totalPosts}). In-app polling will surface completion.`,
    );
    return NextResponse.json({ success: true, data: { skipped: "staging" } });
  }

  try {
    await sendCampaignReadyEmail({
      toEmail: user.email,
      name: fullName,
      campaignName: campaign.name,
      postsGenerated,
      totalPosts,
      campaignsUrl,
    });
  } catch (err) {
    console.error("[notify-complete] sendCampaignReadyEmail failed", err);
    return NextResponse.json(
      { success: false, error: "Email send failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, data: null });
}
