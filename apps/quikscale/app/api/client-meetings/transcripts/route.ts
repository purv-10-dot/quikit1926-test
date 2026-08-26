import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import type { Prisma } from "@prisma/client";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * GET /api/client-meetings/transcripts
 *   ?clientId=&type=DAILY|WEEKLY&date=YYYY-MM-DD           (single-day)
 *   ?clientId=&type=WEEKLY&from=YYYY-MM-DD&to=YYYY-MM-DD   (range: week / month)
 *   ?status=unassigned                                     (Unassigned bucket)
 *
 * Returns saved Fathom meeting transcripts for the Export Transcript viewer.
 * Org-scoped; soft-deletes excluded. Newest first.
 */
export const GET = withOrgAuth(async ({ orgId }, request) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  const type = url.searchParams.get("type");
  const date = url.searchParams.get("date");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");

  const where: Prisma.ClientMeetingTranscriptWhereInput = { orgId, deletedAt: null };

  if (status === "unassigned") {
    where.matchStatus = { in: ["UNMATCHED", "AMBIGUOUS"] };
  } else {
    if (clientId) where.clientId = clientId;
    if (type === "DAILY" || type === "WEEKLY") where.type = type;

    // Date window: a single day, or a [from, to] range (inclusive of `to`'s day).
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      where.meetingDate = { gte: start, lt: end };
    } else if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) {
        const end = new Date(`${to}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        range.lt = end;
      }
      where.meetingDate = range;
    }
  }

  const rows = await db.clientMeetingTranscript.findMany({
    where,
    orderBy: [{ meetingDate: "desc" }, { startedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      clientId: true,
      type: true,
      meetingDate: true,
      title: true,
      recordingUrl: true,
      startedAt: true,
      endedAt: true,
      durationMinutes: true,
      attendees: true,
      summary: true,
      actionItems: true,
      rawText: true,
      // The viewer prefers these over rawText: they carry the real per-turn
      // timings, which the flattened "Speaker: text" rendering throws away.
      rawSegments: true,
      matchStatus: true,
      client: { select: { name: true } },
    },
  });

  const data = rows.map((r) => ({
    ...r,
    clientName: r.client?.name ?? null,
    client: undefined,
  }));

  return NextResponse.json({ success: true, data });
});
