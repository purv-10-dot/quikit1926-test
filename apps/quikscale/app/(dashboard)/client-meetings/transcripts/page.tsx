"use client";

/**
 * Meeting Rhythm → Transcripts — the AI meeting pipeline's own route.
 *
 * The workspace itself (scope tabs, transcript viewer, and the daily / weekly /
 * week-rollup / monthly report panels) is `ExportTranscriptModal` rendered with
 * `variant="page"`. It is deliberately the SAME component the dashboard used to
 * open as a dialog: one implementation means the route can never drift from the
 * behaviour people already learned, and nothing about transcripts or reports had
 * to be re-tested when it moved.
 *
 * This file owns only what the dialog's host used to own — the client list, and
 * whether QuikFlow has an Active Fathom workflow. Unlike the old button, a
 * missing workflow does not hide the feature: manual "Upload Transcript" still
 * works, so an absent workflow is a note, not a locked door.
 */
import { useEffect, useState } from "react";
import { ExportTranscriptModal } from "../ExportTranscriptModal";
import { Banner } from "../reportUi";

interface ClientOpt { id: string; name: string }

export default function MeetingTranscriptsPage() {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  // null = still asking. Only `false` earns a banner; an in-flight check must
  // not flash "no workflow" at an org that has one.
  const [hasWorkflow, setHasWorkflow] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/client-meetings/clients")
      .then((r) => r.json())
      .then((j) => { if (alive && j.success) setClients(j.data); })
      .catch(() => { /* the workspace renders its own empty state */ });
    fetch("/api/client-meetings/transcript-workflow-status")
      .then((r) => r.json())
      .then((j) => { if (alive) setHasWorkflow(j.success ? Boolean(j.data?.hasWorkflow) : false); })
      .catch(() => { if (alive) setHasWorkflow(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {hasWorkflow === false && (
        <Banner tone="info">
          No Active QuikFlow workflow is listening for Fathom meetings, so nothing
          arrives here automatically yet. You can still add a recording with
          <span className="font-medium"> Upload Transcript</span>.
        </Banner>
      )}
      {/*
        `initialClientId` is empty on purpose: the client list arrives after the
        first paint, and the workspace already selects the first client the
        moment it does. Passing a stale id here would fight that.
      */}
      <ExportTranscriptModal
        variant="page"
        clients={clients}
        initialClientId=""
        initialMode="daily"
      />
    </div>
  );
}
