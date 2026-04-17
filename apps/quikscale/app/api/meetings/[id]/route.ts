import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("meetings");
import { updateMeetingSchema } from "@/lib/schemas/meetingSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";

type Params = { id: string };

/* GET /api/meetings/:id — full detail */
export const GET = withTenantAuth<Params>(
  async ({ tenantId }, _req, { params }) => {
    const meeting = await db.meeting.findFirst({
      where: { id: params.id, tenantId },
      include: {
        attendees: {
          select: {
            userId: true,
            attended: true,
            attendedAt: true,
            leftAt: true,
          },
        },
        metrics: {
          select: { id: true, metricName: true, value: true, createdAt: true },
        },
        template: { select: { id: true, name: true, sections: true } },
      },
    });
    if (!meeting) {
      return NextResponse.json(
        { success: false, error: "Meeting not found" },
        { status: 404 },
      );
    }

    // Resolve attendee user details
    const userIds = meeting.attendees.map((a) => a.userId);
    const users =
      userIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return NextResponse.json({
      success: true,
      data: {
        ...meeting,
        attendees: meeting.attendees.map((a) => ({
          ...a,
          user: userMap[a.userId] ?? null,
        })),
      },
    });
  },
  { fallbackErrorMessage: "Failed to fetch meeting" },
);

/* PUT /api/meetings/:id — update record-keeping fields + attendance */
export const PUT = withTenantAuth<Params>(
  async ({ tenantId, userId }, request, { params }) => {
    const existing = await db.meeting.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Meeting not found" },
        { status: 404 },
      );
    }

    const parsed = updateMeetingSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;
    const { attendeeIds, ...meetingFields } = input;

    const dataToUpdate: Record<string, unknown> = { updatedBy: userId };
    for (const [k, v] of Object.entries(meetingFields)) {
      if (v === undefined) continue;
      if (k === "scheduledAt" && typeof v === "string") {
        dataToUpdate[k] = new Date(v);
      } else if (k === "completedAt" && typeof v === "string") {
        dataToUpdate[k] = new Date(v);
      } else if (k === "meetingLink" && v === "") {
        dataToUpdate[k] = null;
      } else {
        dataToUpdate[k] = v;
      }
    }

    const updated = await db.meeting.update({
      where: { id: params.id },
      data: dataToUpdate,
      select: {
        id: true,
        name: true,
        cadence: true,
        scheduledAt: true,
        duration: true,
        location: true,
        meetingLink: true,
        agenda: true,
        decisions: true,
        blockers: true,
        highlights: true,
        startedOnTime: true,
        endedOnTime: true,
        formatFollowed: true,
        followUpRate: true,
        completedAt: true,
        updatedAt: true,
      },
    });

    // Attendee sync (if provided): replace all rows atomically
    if (attendeeIds !== undefined) {
      if (attendeeIds.length > 0) {
        const validCount = await db.membership.count({
          where: {
            tenantId,
            userId: { in: attendeeIds },
            status: "active",
          },
        });
        if (validCount !== attendeeIds.length) {
          return NextResponse.json(
            { success: false, error: "One or more attendees are not active members" },
            { status: 400 },
          );
        }
      }
      await db.$transaction([
        db.meetingAttendee.deleteMany({ where: { meetingId: params.id } }),
        db.meetingAttendee.createMany({
          data: attendeeIds.map((uid) => ({ meetingId: params.id, userId: uid })),
        }),
      ]);
    }

    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Meeting",
      entityId: params.id,
      newValues: updated,
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { fallbackErrorMessage: "Failed to update meeting" },
);

/* DELETE /api/meetings/:id — soft delete */
export const DELETE = withTenantAuth<Params>(
  async ({ tenantId, userId }, _req, { params }) => {
    const existing = await db.meeting.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Meeting not found" },
        { status: 404 },
      );
    }

    await db.meeting.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "DELETE",
      entityType: "Meeting",
      entityId: params.id,
    });

    return NextResponse.json({ success: true, message: "Meeting deleted" });
  },
  { fallbackErrorMessage: "Failed to delete meeting" },
);
