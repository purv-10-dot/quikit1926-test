import { NextResponse } from "next/server";
import { z } from "zod";

import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { dismissCandidate } from "@/lib/reports/newWww";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

/**
 * POST /api/client-meetings/www-candidates/[factId]/dismiss
 *
 * Reject a suggested WWW.
 *
 * The dismissal PERSISTS, which is the whole point. Extraction is idempotent
 * but regeneration is not rare, and a suggestion that reappeared after every
 * regenerate would make the facilitator re-reject the same thing every week —
 * and then stop reading the section at all.
 *
 * Idempotent: dismissing an already-dismissed candidate reports
 * `alreadyDismissed` rather than failing, so a double-click is harmless and the
 * original reason and dismisser are preserved.
 *
 * PERMISSION — `ClientMeetings.Report: update`. Dismissing changes what the
 * report shows, so it is an edit.
 */
export const POST = auth.update<{ factId: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const dismissed = await dismissCandidate(
      orgId,
      params.factId,
      userId,
      parsed.data.reason,
    );

    return NextResponse.json({
      success: true,
      data: { factId: params.factId, dismissed, alreadyDismissed: !dismissed },
    });
  },
  { fallbackErrorMessage: "Failed to dismiss the WWW candidate" },
);
