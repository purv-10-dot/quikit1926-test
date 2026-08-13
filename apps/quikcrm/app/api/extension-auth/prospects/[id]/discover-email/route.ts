import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";
import { resolveExtensionOrgId } from "@/lib/auth/extension-org";
import { discoverEmail, shouldPromote } from "@/lib/services/prospects/email-discovery/cascade";

export const runtime = "nodejs";
/**
 * The cascade makes several sequential network calls (DNS, up to five page
 * fetches, then Hunter and Apollo). 60s is the ceiling on Vercel's Pro plan and
 * comfortably above the observed worst case; the tiers have their own per-call
 * timeouts so this is a backstop, not the normal bound.
 */
export const maxDuration = 60;

/**
 * POST /api/extension-auth/prospects/<id>/discover-email
 *
 * Runs the email-discovery cascade for one prospect and records the outcome.
 *
 * WHY THIS IS A SEPARATE CALL. Discovery takes seconds, so it cannot run inside
 * POST /api/leads/from-linkedin without making the extension's save feel broken.
 * It also cannot be fire-and-forget from that handler: this app is on Next
 * 14.0.4, which has no `after()`, and a serverless function is frozen once its
 * response is sent — an un-awaited promise would simply be killed mid-flight.
 * So the extension's background service worker calls this endpoint after the
 * save returns. That makes it asynchronous from the user's point of view
 * (the panel closes immediately) with no queue, worker, or cron involved.
 *
 * Bearer-JWT authed like its sibling routes — the extension has no session
 * cookie. The prospect is loaded by BOTH id and the resolved orgId, so another
 * organisation's prospect cannot be touched by guessing a cuid.
 *
 * Idempotent and safe to call repeatedly: a prospect that already has an email
 * short-circuits, and the discovery record is upserted per prospect.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const extUser = await verifyExtensionToken(request);
    if (!extUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Prospect id is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const resolution = await resolveExtensionOrgId(extUser.userId, searchParams.get("orgId"));
    if (!resolution.ok) {
      return NextResponse.json({ success: false, error: resolution.error }, { status: 403 });
    }
    const { orgId } = resolution;

    const prospect = await db.crmProspect.findFirst({
      where: { id, orgId },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        companyWebsite: true,
        linkedinUrl: true,
        title: true,
      },
    });
    if (!prospect) {
      return NextResponse.json(
        { success: false, error: "Prospect not found in this organization" },
        { status: 404 },
      );
    }

    // Already has an address — never overwrite one. A value here came from the
    // LinkedIn profile or a human, both of which outrank anything we can infer.
    if (prospect.email) {
      return NextResponse.json({
        success: true,
        data: {
          prospectId: prospect.id,
          status: "skipped",
          reason: "Prospect already has an email",
          email: prospect.email,
        },
      });
    }

    const result = await discoverEmail(orgId, {
      fullName: prospect.name,
      companyName: prospect.company,
      companyWebsite: prospect.companyWebsite,
      linkedinUrl: prospect.linkedinUrl,
      title: prospect.title,
    });

    const promoted = shouldPromote(result);

    // Record the outcome regardless of success: a run that found nothing is
    // still worth knowing about, and `attempts` is what lets a caller stop
    // retrying a prospect that will never resolve.
    await db.crmProspectEmailDiscovery.upsert({
      where: { prospectId: prospect.id },
      create: {
        orgId,
        prospectId: prospect.id,
        status: result.status,
        email: result.email ?? null,
        confidence: result.confidence,
        domain: result.domain ?? null,
        pattern: result.pattern ?? null,
        source: result.source ?? null,
        attempts: 1,
        lastError: result.error ?? null,
        lastRunAt: new Date(),
      },
      update: {
        status: result.status,
        email: result.email ?? null,
        confidence: result.confidence,
        domain: result.domain ?? null,
        pattern: result.pattern ?? null,
        source: result.source ?? null,
        attempts: { increment: 1 },
        lastError: result.error ?? null,
        lastRunAt: new Date(),
      },
    });

    // Only a scored provider hit is written to the prospect itself. Everything
    // weaker stays in the discovery row as a suggestion — see
    // cascade.ts::shouldPromote for why a plausible guess is not good enough.
    if (promoted && result.email) {
      await db.crmProspect.update({
        where: { id: prospect.id },
        data: { email: result.email },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        prospectId: prospect.id,
        status: result.status,
        email: result.email ?? null,
        confidence: result.confidence,
        domain: result.domain ?? null,
        pattern: result.pattern ?? null,
        source: result.source ?? null,
        /** True when CrmProspect.email was updated; false when it is a suggestion only. */
        promoted,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    console.error("[api] POST /api/extension-auth/prospects/[id]/discover-email", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
