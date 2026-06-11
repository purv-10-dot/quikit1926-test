import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { clientMeetingSchema } from "@/lib/services/opportunities/validators";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function loadOpp(orgId: string, id: string) {
  return db.crmOpportunity.findFirst({
    where: { id, orgId },
    select: { id: true, accountId: true, name: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "view");

    const opp = await loadOpp(user.orgId, id);
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId);

    const meetings = await db.crmOpportunityClientMeeting.findMany({
      where: { orgId: user.orgId, opportunityId: id },
      orderBy: { meetingAt: "desc" },
    });
    return NextResponse.json({ success: true, data: meetings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load meetings";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "edit");

    const opp = await loadOpp(user.orgId, id);
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId);

    const body = await req.json().catch(() => null);
    const parsed = clientMeetingSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    const created = await db.$transaction(async (tx) => {
      const meeting = await tx.crmOpportunityClientMeeting.create({
        data: {
          orgId: user.orgId,
          opportunityId: id,
          subject: parsed.data.subject,
          meetingAt: new Date(parsed.data.meetingAt),
          meetingType: parsed.data.meetingType ?? null,
          competitorName: parsed.data.competitorName ?? null,
          outcome: parsed.data.outcome ?? null,
          attendees:
            parsed.data.attendees === undefined || parsed.data.attendees === null
              ? undefined
              : (parsed.data.attendees as object),
          notes: parsed.data.notes ?? null,
        },
      });
      await tx.crmActivity.create({
        data: {
          orgId: user.orgId,
          type: "OpportunityClientMeeting",
          relatedKind: "Opportunity",
          relatedObjectId: id,
          subject: `Client meeting · ${parsed.data.competitorName ?? opp.name}`,
          outcome: parsed.data.outcome ?? "",
          ownerId: user.userId,
          ownerName: user.name || null,
          occurredAt: new Date(parsed.data.meetingAt),
        },
      });
      // Touch parent for the at-risk widget.
      await tx.crmOpportunity.update({
        where: { id, orgId: user.orgId },
        data: { lastActivityAt: new Date() },
      });
      return meeting;
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add meeting";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
