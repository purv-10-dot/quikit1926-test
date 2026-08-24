import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { buildNewWww, linkCandidate } from "@/lib/reports/newWww";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * GET /api/client-meetings/transcripts/[id]/new-www
 *
 * Commitments made in THIS meeting that are not yet in the business record.
 *
 * Deliberately separate from WWW Review: that section looks backwards at items
 * that already exist, this one answers "did we capture what we just committed
 * to?". Merging them would blur exactly that question.
 *
 * Nothing is created here. These are candidates with their gaps named —
 * `missingFields` says what a human must still supply, and a missing date is
 * reported as missing rather than guessed. The requirement doc's example:
 * *"Rahul will complete API integration"* with no date stated shows
 * **When: Not specified** — not Friday.
 *
 * **No model is called.**
 */
export const GET = auth.view<{ id: string }>(
  async ({ orgId }, req, { params }) => {
    const includeDismissed =
      new URL(req.url).searchParams.get("includeDismissed") === "true";

    const transcript = await db.clientMeetingTranscript.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, clientId: true },
    });
    if (!transcript) {
      return NextResponse.json(
        { success: false, error: "Transcript not found" },
        { status: 404 },
      );
    }

    const result = await buildNewWww(orgId, params.id, transcript.clientId, {
      includeDismissed,
    });

    return NextResponse.json({
      success: true,
      data: { transcriptId: params.id, clientId: transcript.clientId, ...result },
    });
  },
  { fallbackErrorMessage: "Failed to load new WWW candidates" },
);

const createSchema = z.object({
  factId: z.string().min(1),
  /** Owner. Required — never defaulted, never inferred from the speaker alone. */
  who: z.string().min(1),
  what: z.string().min(1).max(1000),
  /** ISO date. Required unless `dueDateTBD`. */
  when: z.string().optional(),
  dueDateTBD: z.boolean().optional(),
  category: z.string().max(120).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

/**
 * POST /api/client-meetings/transcripts/[id]/new-www
 *
 * Create a real WWW item from a candidate.
 *
 * DELEGATES TO `POST /api/www` RATHER THAN WRITING DIRECTLY. That route owns the
 * Zod schema, the 409 duplicate guard, the `www.created` QuikFlow event, the
 * audit trail and the assignment notification. A parallel insert here would
 * silently skip every one of them, and the divergence would only surface later
 * as "why didn't this WWW notify anyone?".
 *
 * PERMISSION — `ClientMeetings.Report: update` **AND** `WWW: create` (doc 17
 * D13). Creating from a report is both a report action and a WWW write, and
 * holding one permission should not confer the other.
 *
 * The owner (`who`) is required in the body. The bridge resolves a speaker to a
 * user, but rungs 3 and 4 need human confirmation, and this route does not
 * accept a guess in place of a decision.
 */
export const POST = auth.update<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    // Dual gate: a report editor who cannot create WWW items must not be able
    // to create them through a report.
    if (!(await userCan(userId, orgId, "WWW", "create"))) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to create WWW items" },
        { status: 403 },
      );
    }

    const { factId, ...draft } = parsed.data;

    if (!draft.dueDateTBD && !draft.when) {
      // The candidate had no stated date and the user has not supplied one.
      // Refusing is the point: inventing a due date is the exact failure the
      // requirement doc calls out.
      return NextResponse.json(
        {
          success: false,
          error: "A due date is required, or mark it To Be Decided",
          code: "WHEN_REQUIRED",
        },
        { status: 400 },
      );
    }

    const fact = await db.meetingWwwFact.findFirst({
      where: { id: factId, orgId, transcriptId: params.id, deletedAt: null },
      select: { id: true, linkedWwwItemId: true },
    });
    if (!fact) {
      return NextResponse.json(
        { success: false, error: "WWW candidate not found" },
        { status: 404 },
      );
    }
    if (fact.linkedWwwItemId) {
      // Idempotent against a double-click: return the existing item rather than
      // creating a second copy of the same commitment.
      return NextResponse.json({
        success: true,
        data: { wwwItemId: fact.linkedWwwItemId, alreadyCreated: true },
      });
    }

    // Delegate to the real route so every downstream behaviour applies.
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/www`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Forward the caller's session so /api/www authenticates and authorises
        // as the human who pressed Create — never as a service identity.
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify(draft),
    });

    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: { id?: string }; error?: string }
      | null;

    if (!res.ok || !payload?.success || !payload.data?.id) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.error ?? "Failed to create the WWW item",
        },
        { status: res.status === 200 ? 500 : res.status },
      );
    }

    await linkCandidate(orgId, factId, payload.data.id);

    return NextResponse.json({
      success: true,
      data: { wwwItemId: payload.data.id, alreadyCreated: false },
    });
  },
  { fallbackErrorMessage: "Failed to create the WWW item" },
);
