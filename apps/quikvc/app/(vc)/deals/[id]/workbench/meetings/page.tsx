/**
 * Meetings tab — schedule meetings + paste transcript + Claude analysis.
 *
 * Sprint 3b: list meetings, schedule via popover, paste transcript and get
 * structured AI analysis (summary / key points / red flags / action items
 * / sentiment). Red flags auto-promote to Risk Register.
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import MeetingsClient from "./meetings-client";

export default async function MeetingsPage({ params }: { params: { id: string } }) {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const meetings = await db.vCMeeting.findMany({
    where: { orgId, dealId: params.id },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    include: {
      transcript: {
        select: { id: true, status: true, analysis: true, tokensUsed: true },
      },
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <MeetingsClient
        dealId={params.id}
        meetings={meetings.map((m) => ({
          id: m.id,
          title: m.title,
          type: m.type,
          status: m.status,
          scheduledAt: m.scheduledAt?.toISOString() ?? null,
          meetingUrl: m.meetingUrl,
          agenda: m.agenda,
          transcript: m.transcript
            ? {
                status: m.transcript.status,
                analysis: m.transcript.analysis as Record<string, unknown> | null,
                tokensUsed: m.transcript.tokensUsed ?? null,
              }
            : null,
        }))}
      />
    </div>
  );
}
