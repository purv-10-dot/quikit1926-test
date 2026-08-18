import { NextResponse } from "next/server";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const auth = withOrgAuthForResource("clientMeetings.clients", "ClientMaster");

/**
 * POST /api/client-meetings/clients/[id]/schedule-meetings
 *
 * The "Create Teams meetings" button. Loads the saved client, then asks QuikFlow
 * (where the calendar connection lives) to create/update BOTH the Daily Huddle
 * and Weekly Meeting recurring Teams events for it — the direct path that needs
 * no QuikFlow workflow. Idempotent (QuikFlow pins each by kind), so re-clicking
 * updates the same events. Returns { connected: false } when no calendar is
 * connected instead of erroring.
 */
export const POST = auth.update<{ id: string }>(async ({ orgId, userId }, _request, { params }) => {
  try {
    const client = await db.client.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        dailyStartTime: true,
        dailyEndTime: true,
        weeklyStartTime: true,
        weeklyEndTime: true,
        weeklyDay: true,
        dailyDays: true,
        meetingUntil: true,
        startDate: true,
        teamMembers: { select: { member: { select: { email: true } } } },
      },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const quikflowUrl = process.env.QUIKFLOW_URL;
    const secret = process.env.INTERNAL_SECRET;
    if (!quikflowUrl || !secret) {
      return NextResponse.json({ success: true, data: { connected: false } });
    }

    const attendees = client.teamMembers.map((tm) => tm.member?.email).filter(Boolean);
    const startDate = (client.startDate ?? new Date()).toISOString().slice(0, 10);
    const until = client.meetingUntil ? client.meetingUntil.toISOString().slice(0, 10) : null;

    const payload = {
      orgId,
      refType: "clientMaster",
      refId: client.id,
      name: client.name,
      createdBy: userId,
      attendees,
      daily:
        client.dailyStartTime && client.dailyEndTime
          ? { start: client.dailyStartTime, end: client.dailyEndTime, days: client.dailyDays, startDate, until }
          : undefined,
      weekly:
        client.weeklyStartTime && client.weeklyEndTime
          ? { start: client.weeklyStartTime, end: client.weeklyEndTime, day: client.weeklyDay ?? undefined, startDate, until }
          : undefined,
    };

    const res = await fetch(`${quikflowUrl}/api/internal/calendar/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown; error?: string } | null;
    if (!res.ok || !json?.success) {
      return NextResponse.json(
        { success: false, error: json?.error ?? "Failed to schedule meetings in Teams" },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, data: json.data });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to schedule meetings") }, { status: 500 });
  }
});
