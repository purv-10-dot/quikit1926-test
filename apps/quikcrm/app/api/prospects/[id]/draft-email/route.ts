/**
 * POST /api/prospects/<id>/draft-email
 *
 * Drafts a sales email for one prospect from everything the CRM knows about
 * them, and returns it for a human to edit and send. It writes NOTHING: no
 * CrmEmailMessage, no CrmActivity, no change to the prospect. The send happens
 * later through POST /api/email/send when the user hits Send in the compose
 * modal, which is where logging already lives.
 *
 * Auth: requireApiUser + `leads:view` — Prospects sits under the Leads module in
 * this app's navigation, matching POST /api/prospects (which gates on
 * leads:create). Reading a prospect to draft against it is a read, so it takes
 * the read permission.
 *
 * Tenant isolation is by prospectScopeWhere, not a bare orgId filter: a
 * SalesUser may only draft against prospects they personally saved, exactly as
 * on the Prospects screen. Using the same helper is what keeps visibility and
 * this action from drifting apart.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { prospectScopeWhere, canViewAllProspects as canSeeAll } from "@/lib/auth/prospect-acl";
import { buildDraftContext, summarizeContext } from "@/lib/services/prospects/email-draft/context";
import { draftProspectEmail } from "@/lib/services/prospects/email-draft/draft";
import { createDraftLogger } from "@/lib/services/prospects/email-draft/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One model call over a large context; the SDK's own timeout is the real bound. */
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Prospect id is required" },
        { status: 400 },
      );
    }

    const log = createDraftLogger(id);
    log.step("start", { user: user.userId, org: user.orgId, role: user.role });

    const prospect = await prisma.crmProspect.findFirst({
      where: { ...prospectScopeWhere(user), id },
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        company: true,
        linkedinUrl: true,
        shortSummary: true,
        about: true,
        companyIndustry: true,
        companyWebsite: true,
        companyHeadquarters: true,
        companySize: true,
        companyEmployeeCount: true,
        // Raw scraped blobs — normalized and truncated inside buildDraftContext,
        // never passed to the model verbatim.
        posts: true,
        companyData: true,
        experiences: true,
        linkedinConversation: true,
        icp: {
          select: {
            name: true,
            description: true,
            personaNotes: true,
            segment: true,
            regions: true,
          },
        },
      },
    });
    if (!prospect) {
      // Same response for "does not exist" and "not yours" — distinguishing them
      // would confirm the existence of another user's prospect.
      log.fail("prospect:not-found", { scoped: !canSeeAll(user) });
      return NextResponse.json({ success: false, error: "Prospect not found" }, { status: 404 });
    }
    log.step("prospect:loaded", { name: prospect.name, email: prospect.email ?? "none" });

    // The sender's own org identity, for the sign-off. Absent on an org that
    // never filled in Settings → Company; the draft then signs with the name only.
    const profile = await prisma.crmCompanyProfile.findUnique({
      where: { orgId: user.orgId },
      select: { companyName: true, website: true },
    });

    const draftContext = buildDraftContext(
      { ...prospect, icp: prospect.icp ?? null },
      {
        name: user.name || user.email,
        email: user.email || null,
        companyName: profile?.companyName ?? null,
        companyWebsite: profile?.website ?? null,
      },
    );

    log.step("context:built", summarizeContext(draftContext));

    const draft = await draftProspectEmail(
      draftContext,
      async () => getToken({ req, raw: true }).then((t) => (typeof t === "string" ? t : null)),
      log,
    );

    log.done("respond", { ms: log.elapsed(), source: draft.source, to: prospect.email ?? "none" });

    return NextResponse.json({
      success: true,
      data: {
        prospectId: prospect.id,
        /** Pre-filled recipient; null when discovery has not resolved one yet. */
        to: prospect.email,
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        /** "ai" | "template" — the UI tells the user which they are editing. */
        source: draft.source,
        fallbackReason: draft.fallbackReason ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("[api] POST /api/prospects/[id]/draft-email", error);
    // assertModule throws a 403-carrying error; everything else is a real 500.
    const status = (error as { statusCode?: number })?.statusCode;
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: Number.isInteger(status) ? (status as number) : 500 },
    );
  }
}
