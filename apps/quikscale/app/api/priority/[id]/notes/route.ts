import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("priority");

type RouteParams = { id: string };

// Free-text comments on a Priority are stored as COMMENT AuditEvents (the
// timeline's source of truth) rather than a dedicated table — so there's no
// separate model to keep in sync. The content lives in the event snapshot.
const noteSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty").max(5000, "Comment is too long"),
});

export const POST = withOrgAuth<RouteParams>(async ({ orgId, userId }, req, { params }) => {
  const priority = await db.priority.findUnique({
    where: { id: params.id },
    select: { orgId: true, teamId: true },
  });
  if (!priority) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  if (priority.orgId !== orgId)
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const parsed = noteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { content } = parsed.data;

  // ── Centralized audit ── free-text comment event for the timeline.
  const eventId = await audit.log({
    entityType: "PRIORITY",
    entityId: params.id,
    action: "COMMENT",
    actor: { userId, orgId, teamId: priority.teamId },
    snapshot: { content },
    ...requestContext(req),
  });

  return NextResponse.json(
    { success: true, data: { id: eventId, content }, message: "Comment added" },
    { status: 201 },
  );
}, { fallbackErrorMessage: "Failed to add comment" });
