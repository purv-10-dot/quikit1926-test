"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

/**
 * `/meeting/{meetingId}/join` — the stable address that goes in a calendar
 * invite. Resolves to the meeting's QuikChat call and forwards to it.
 *
 * A client page rather than a server redirect so the dead ends can say what to
 * do next. This link is opened days after it was sent, by someone who may be on
 * another call, or whose meeting was cancelled in the meantime — "403" in a
 * blank tab is not an acceptable answer to a calendar invite.
 */

type FailureCode = "not_found" | "cancelled" | "not_attendee" | "busy" | "unknown";

/** One message per dead end, each ending in something the reader can do. */
const FAILURE_COPY: Record<FailureCode, { title: string; body: string }> = {
  not_attendee: {
    title: "You're not on the invite",
    body: "Only people invited to this meeting can join it. Ask the organizer to add you, then open this link again.",
  },
  busy: {
    title: "You're already on a call",
    body: "Leave your current call, then open this link again to join the meeting.",
  },
  cancelled: {
    title: "This meeting was cancelled",
    body: "The organizer cancelled it, so there's nothing to join. Check with them if you were expecting it to go ahead.",
  },
  not_found: {
    title: "Meeting not found",
    body: "This meeting no longer exists — it may have been deleted. Check with the organizer for a new invite.",
  },
  unknown: {
    title: "Couldn't join the meeting",
    body: "Something went wrong resolving this meeting. Try again, or open the meeting from the conversation.",
  },
};

export default function MeetingJoinPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = (params.meetingId as string) ?? "";
  const [failure, setFailure] = useState<FailureCode | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/join`, {
          method: "POST",
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          callId?: string;
          code?: FailureCode;
        };
        if (cancelled) return;
        if (!res.ok || !data.callId) {
          setFailure(data.code ?? "unknown");
          return;
        }
        // `group=1` is the same routing hint ChatWorkspace passes: a meeting
        // call is always a group call, so the call page can skip the 1:1
        // ring/cancel socket before the token fetch confirms it.
        router.replace(`/call/${data.callId}?group=1&type=video`);
      } catch {
        if (!cancelled) setFailure("unknown");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId, router]);

  if (failure) {
    const { title, body } = FAILURE_COPY[failure];
    return (
      <div className="qc-meeting-join" data-testid="meeting-join-failure" data-code={failure}>
        <h1 className="qc-meeting-join__title">{title}</h1>
        <p className="qc-meeting-join__body">{body}</p>
      </div>
    );
  }

  return (
    <div className="qc-meeting-join" data-testid="meeting-join-pending">
      <Spinner />
      <p className="qc-meeting-join__body">Joining the meeting…</p>
    </div>
  );
}
