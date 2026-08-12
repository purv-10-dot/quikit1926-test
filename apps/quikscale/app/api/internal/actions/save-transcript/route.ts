import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  classifyMeeting,
  dateInTz,
  minuteOfDayInTz,
  normEmail,
  type MeetingType,
} from "@/lib/services/meetingTranscriptMatch";
import { emitMeetingTranscriptAttached } from "@/lib/services/workflowEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/save-transcript — service-to-service only.
 *
 * Called by QuikFlow's `quikscale.save_transcript` action executor when a Fathom
 * meeting is transcribed. This endpoint owns the MATCHING business logic:
 * given the recording's attendees + start time + title, it resolves which
 * QuikScale client, which cadence (DAILY / WEEKLY) and which date the meeting
 * was, links it to the concrete meeting row if one exists, and upserts a
 * ClientMeetingTranscript. Idempotent on (orgId, fathomRecordingId).
 *
 * Nothing is ever dropped: an unresolved transcript is still stored with
 * matchStatus UNMATCHED/AMBIGUOUS (clientId null) for the "Unassigned" bucket.
 */
const attendeeSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  recordingId: z.string().min(1),
  title: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  durationMinutes: z.number().nullable().optional(),
  attendees: z.array(attendeeSchema).optional().default([]),
  recordingUrl: z.string().nullable().optional(),
  rawText: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  actionItems: z.array(z.any()).optional().default([]),
  // Manual overrides (builder params) — pin the match.
  clientId: z.string().optional(),
  type: z.enum(["DAILY", "WEEKLY"]).optional(),
  meetingDate: z.string().optional(),
});

type MatchResult = {
  clientId: string | null;
  type: MeetingType | null;
  matchStatus: "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
};

/** Resolve client + cadence from attendees / title / planned time windows. */
async function matchMeeting(
  orgId: string,
  attendees: { email?: string | null }[],
  title: string | null,
  startedAt: string | null,
  durationMinutes: number | null,
): Promise<MatchResult> {
  const emails = new Set(attendees.map((a) => normEmail(a.email)).filter((e): e is string => !!e));

  // Load active clients once.
  const clients = await db.client.findMany({
    where: { orgId, deletedAt: null, isActive: true },
    select: {
      id: true,
      name: true,
      dailyStartTime: true,
      dailyEndTime: true,
      weeklyStartTime: true,
      weeklyEndTime: true,
    },
  });
  const byId = new Map(clients.map((c) => [c.id, c]));
  const startMinute = minuteOfDayInTz(startedAt);
  const classify = (id: string) => classifyMeeting(startMinute, byId.get(id)!, durationMinutes);
  const matched = (id: string): MatchResult => ({ clientId: id, type: classify(id), matchStatus: "MATCHED" });

  // Signal 1 — client name appears in the meeting title (strong + specific).
  const titleIds: string[] = [];
  if (title) {
    const t = title.toLowerCase();
    for (const c of clients) if (c.name && t.includes(c.name.toLowerCase())) titleIds.push(c.id);
  }

  // Signal 2 — attendee emails ∩ ClientMember → ClientTeamMember → client.
  const emailIds = new Set<string>();
  if (emails.size > 0) {
    const members = await db.clientMember.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, email: true },
    });
    const matchedMemberIds = members
      .filter((m) => normEmail(m.email) && emails.has(normEmail(m.email)!))
      .map((m) => m.id);
    if (matchedMemberIds.length > 0) {
      const links = await db.clientTeamMember.findMany({
        where: { orgId, clientMemberId: { in: matchedMemberIds } },
        select: { clientId: true },
      });
      for (const l of links) emailIds.add(l.clientId);
    }
  }

  // Resolution priority (most→least confident):
  // 1. A single client named in the title wins outright (very specific).
  if (titleIds.length === 1) return matched(titleIds[0]);
  // 2. The unique client that BOTH the title and the attendees point to.
  const both = titleIds.filter((id) => emailIds.has(id));
  if (both.length === 1) return matched(both[0]);
  // 3. Attendee-email candidates, narrowed to one by the meeting's time window.
  const emailArr = [...emailIds];
  if (emailArr.length === 1) return matched(emailArr[0]);
  if (emailArr.length > 1) {
    const timed = emailArr.filter((id) => classify(id) !== null);
    if (timed.length === 1) return matched(timed[0]);
  }
  // 4. Title matched several — try the time window to break the tie.
  if (titleIds.length > 1) {
    const timed = titleIds.filter((id) => classify(id) !== null);
    if (timed.length === 1) return matched(timed[0]);
  }

  const anyCandidate = titleIds.length > 0 || emailIds.size > 0;
  return { clientId: null, type: null, matchStatus: anyCandidate ? "AMBIGUOUS" : "UNMATCHED" };
}

/** Find an existing meeting row for this client + cadence + date to link to. */
async function findMeetingRecord(
  orgId: string,
  clientId: string,
  type: MeetingType,
  meetingDate: Date,
): Promise<{ dailyHuddleId: string | null; weeklyMeetingId: string | null }> {
  const dayStart = new Date(meetingDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const range = { gte: dayStart, lt: dayEnd };

  if (type === "DAILY") {
    const row = await db.clientDailyHuddle.findFirst({
      where: { orgId, clientId, deletedAt: null, meetingDate: range },
      select: { id: true },
    });
    return { dailyHuddleId: row?.id ?? null, weeklyMeetingId: null };
  }
  const row = await db.clientWeeklyMeeting.findFirst({
    where: { orgId, clientId, deletedAt: null, meetingDate: range },
    select: { id: true },
  });
  return { dailyHuddleId: null, weeklyMeetingId: row?.id ?? null };
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const b = parsed.data;

  try {
    // Manual overrides win; otherwise run the matcher.
    let clientId: string | null;
    let type: MeetingType | null;
    let matchStatus: MatchResult["matchStatus"];
    if (b.clientId) {
      clientId = b.clientId;
      type = b.type ?? null;
      matchStatus = "MATCHED";
    } else {
      const m = await matchMeeting(b.orgId, b.attendees, b.title ?? null, b.startedAt ?? null, b.durationMinutes ?? null);
      clientId = m.clientId;
      type = b.type ?? m.type;
      matchStatus = m.matchStatus;
    }

    // Resolve the meeting date (override → tz-local date of start → null).
    const dateStr = b.meetingDate ?? dateInTz(b.startedAt ?? null);
    const meetingDate = dateStr ? new Date(`${dateStr.slice(0, 10)}T00:00:00.000Z`) : null;

    // Link to a concrete meeting row when we know client + cadence + date.
    let dailyHuddleId: string | null = null;
    let weeklyMeetingId: string | null = null;
    if (clientId && type && meetingDate) {
      const link = await findMeetingRecord(b.orgId, clientId, type, meetingDate);
      dailyHuddleId = link.dailyHuddleId;
      weeklyMeetingId = link.weeklyMeetingId;
    }

    const data = {
      clientId,
      type,
      meetingDate,
      dailyHuddleId,
      weeklyMeetingId,
      title: b.title ?? null,
      recordingUrl: b.recordingUrl ?? null,
      startedAt: b.startedAt ? new Date(b.startedAt) : null,
      endedAt: b.endedAt ? new Date(b.endedAt) : null,
      durationMinutes: b.durationMinutes ?? null,
      attendees: b.attendees ?? [],
      rawText: b.rawText ?? null,
      summary: b.summary ?? null,
      actionItems: b.actionItems ?? [],
      matchStatus,
      source: "fathom",
    };

    const saved = await db.clientMeetingTranscript.upsert({
      where: { orgId_fathomRecordingId: { orgId: b.orgId, fathomRecordingId: b.recordingId } },
      create: { orgId: b.orgId, fathomRecordingId: b.recordingId, createdBy: b.actorId, ...data },
      update: { updatedBy: b.actorId, ...data },
      select: { id: true, matchStatus: true, clientId: true, type: true },
    });

    // When linked to a concrete meeting row, notify QuikFlow so users can chain
    // "transcript attached → create WWW from action items", etc.
    const linkedMeetingId = dailyHuddleId ?? weeklyMeetingId;
    if (linkedMeetingId && type && clientId) {
      const client = await db.client.findFirst({ where: { id: clientId, orgId: b.orgId }, select: { name: true } });
      emitMeetingTranscriptAttached({
        orgId: b.orgId,
        type,
        meetingId: linkedMeetingId,
        clientId,
        clientName: client?.name ?? null,
        meetingDate,
        recordingId: b.recordingId,
      });
    }

    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save transcript";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
