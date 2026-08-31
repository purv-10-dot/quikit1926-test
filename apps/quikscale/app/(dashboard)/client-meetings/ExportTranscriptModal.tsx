"use client";

/**
 * Export Transcript modal — the single window onto everything the AI meeting
 * pipeline produced: the Fathom transcripts QuikFlow matched into Meeting
 * Rhythm, and the four reports built from them.
 *
 * Structure follows the meeting rhythm itself rather than the data model:
 *
 *   Daily      → a day's huddle transcripts, and each one's daily report
 *   Weekly     → the week's weekly-meeting transcripts, the Weekly Meeting
 *                Report, and the Daily-Huddle rollup for that week
 *   Month      → the month's transcripts, and the Monthly Report
 *   Unassigned → recordings QuikFlow could not match to a client
 *
 * Each scope has ONE list on the left and ONE detail pane on the right, so the
 * same muscle memory works everywhere. The sub-views ("Transcripts / Report")
 * are what keep the reports reachable without a second entry point.
 *
 * Rendered in two places from one component (see the `variant` prop):
 *   · Meeting Rhythm → Transcripts  — the route, `variant="page"`
 *   · a dialog over any host page    — `variant="modal"` (default)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Package,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { MeetingReportPanel } from "./MeetingReportPanel";
import { UploadTranscriptModal } from "./UploadTranscriptModal";
import { BulkDownloadReportsModal } from "./BulkDownloadReportsModal";
import { WeeklyRollupPanel } from "./WeeklyRollupPanel";
import { WeeklyMeetingReportPanel } from "./WeeklyMeetingReportPanel";
import { MonthlyReportPanel } from "./MonthlyReportPanel";
import { ConfirmDeleteDialog, runDelete, type DeleteTarget } from "./ConfirmDeleteDialog";
import { Banner, EmptyState, Skeleton } from "./reportUi";
import { cleanFathomSummary, parseSummaryBlocks } from "@/lib/meetings/summaryFormat";
import { buildTranscriptTurns, formatClock, turnsToPlainText } from "@/lib/meetings/transcriptView";
import {
  actionItemLine,
  attendeeGroups,
  attendeesToPlainText,
} from "@/lib/meetings/meetingParts";

interface ClientOpt { id: string; name: string }

interface TranscriptRow {
  id: string;
  clientId: string | null;
  type: "DAILY" | "WEEKLY" | null;
  meetingDate: string | null;
  title: string | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  /**
   * Every field past name/email is OPTIONAL on purpose: rows ingested before
   * the connector learned to carry them will never have them, so the UI has to
   * degrade rather than render "—" placeholders forever.
   */
  attendees:
    | {
        name?: string | null;
        email?: string | null;
        isInvitee?: boolean;
        isIdentified?: boolean;
        linkedinUrl?: string | null;
      }[]
    | null;
  summary: string | null;
  actionItems:
    | {
        text?: string | null;
        assignee?: string | null;
        dueDate?: string | null;
        /** Offset into the recording — Fathom shows this as "@ 0:49". */
        timestampSeconds?: number | null;
      }[]
    | null;
  rawText: string | null;
  /** Structured turns with real per-segment timings, when the recorder gave us any. */
  rawSegments: { speaker?: string | null; text?: string | null; timestamp?: number | string | null }[] | null;
  matchStatus: string;
  clientName: string | null;
}

type Scope = "daily" | "weekly" | "month" | "unassigned";
/** Which pane the current scope is showing. Not every scope offers all three. */
type View = "transcripts" | "wmReport" | "rollup" | "monthlyReport";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Monday-start week (Mon..Sun) containing `date`, as ISO yyyy-mm-dd bounds. */
function weekBounds(dateStr: string): { from: string; to: string } {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - dow);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

function monthBounds(year: number, month1: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month1 - 1, 1));
  const to = new Date(Date.UTC(year, month1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Shift an ISO date by whole days, staying in UTC. */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "—";
}

function prettyDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

function attendeeText(rows: TranscriptRow["attendees"]): string {
  if (!Array.isArray(rows)) return "";
  return rows.map((a) => a?.name || a?.email).filter(Boolean).join(", ");
}

/**
 * Fathom's summary is markdown whose every bullet ends in a citation link back
 * into the recording, which rendered as a raw URL on every line. Cleaned and
 * structured for display; the stored `summary` is left exactly as ingested.
 */
function SummaryView({ summary }: { summary: string }) {
  const blocks = parseSummaryBlocks(cleanFathomSummary(summary));
  if (blocks.length === 0) return null;

  // Consecutive bullets render as one list so the markers line up.
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={key} className="list-disc space-y-1 pl-5 text-sm text-gray-700">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  blocks.forEach((b, i) => {
    if (b.kind === "bullet") {
      bullets.push(b.text);
      return;
    }
    flush(`ul-${i}`);
    out.push(
      b.kind === "heading" ? (
        <h5 key={i} className="mt-3 text-sm font-semibold text-gray-900 first:mt-0">
          {b.text}
        </h5>
      ) : (
        <p key={i} className="text-sm text-gray-700">
          {b.text}
        </p>
      ),
    );
  });
  flush("ul-end");

  return <div className="space-y-2">{out}</div>;
}

/**
 * Action items with the timestamp and assignee Fathom shows beside each one.
 *
 * We previously rendered `a.text` alone, so the "@ 0:49" marker and the owner —
 * the two things that make an action item actionable — were invisible even
 * though the assignee was sitting in the database.
 *
 * Three deliberate divergences from Fathom's own panel:
 *   · no interactive checkbox. Nothing here would persist to Fathom, and a
 *     checkbox that silently forgets is worse than no checkbox.
 *   · no DELETE ALL. These are Fathom's items; we don't own them.
 *   · the "AI generated" note appears once as a footnote rather than as a
 *     sparkle on every row, which is pure noise when every row is AI-generated.
 */
function ActionItemsView({ items, recordingUrl }: { items: TranscriptRow["actionItems"]; recordingUrl: string | null }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <section>
      <h4 className="mb-1 text-sm font-semibold text-gray-800">Action items</h4>
      <ul className="space-y-2">
        {items.map((a, i) => {
          const clock = a?.timestampSeconds != null ? formatClock(a.timestampSeconds * 1000) : null;
          const meta = [clock, a?.assignee, a?.dueDate].filter(Boolean);
          return (
            <li key={i} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-sm text-gray-800">{a?.text}</p>
              {meta.length ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                  {clock ? (
                    recordingUrl ? (
                      <a
                        href={`${recordingUrl}${recordingUrl.includes("?") ? "&" : "?"}timestamp=${a!.timestampSeconds}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tabular-nums text-gray-500 underline-offset-2 hover:underline"
                      >
                        @ {clock}
                      </a>
                    ) : (
                      <span className="tabular-nums">@ {clock}</span>
                    )
                  ) : null}
                  {a?.assignee ? <span>{a.assignee}</span> : null}
                  {a?.dueDate ? <span>due {a.dueDate}</span> : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-gray-400">Action items generated by Fathom AI.</p>
    </section>
  );
}

/**
 * Attendees in the two groups Fathom itself shows: the people it identified as
 * actually present, and the calendar invitees.
 *
 * The old single line did `name || email`, which hid the address whenever a
 * name existed — exactly the pairing the user needs to see. Rows ingested
 * before the connector carried the flags have no groups at all, so those fall
 * back to the original flat line rather than being forced into a wrong bucket.
 */
function AttendeesView({ attendees }: { attendees: TranscriptRow["attendees"] }) {
  if (!Array.isArray(attendees) || attendees.length === 0) return null;

  const { identified, invitees, ungrouped } = attendeeGroups(attendees);

  // Legacy row: nothing is flagged, so there are no groups to show.
  if (ungrouped) {
    return (
      <p className="text-xs text-gray-600">
        <span className="font-medium">Attendees:</span> {attendeeText(attendees)}
      </p>
    );
  }

  const row = (a: NonNullable<TranscriptRow["attendees"]>[number], i: number) => (
    <li key={i} className="text-xs text-gray-700">
      {a?.name ? <span className="font-medium text-gray-800">{a.name}</span> : null}
      {a?.name && a?.email ? <span className="text-gray-400"> · </span> : null}
      {a?.email ? <span>{a.email}</span> : null}
      {a?.linkedinUrl ? (
        <a
          href={a.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 text-gray-400 underline-offset-2 hover:underline"
        >
          in
        </a>
      ) : null}
    </li>
  );

  return (
    <section className="space-y-2">
      {identified.length ? (
        <div>
          <h5 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Attendees</h5>
          <ul className="mt-0.5 space-y-0.5">{identified.map(row)}</ul>
        </div>
      ) : null}
      {invitees.length ? (
        <div>
          <h5 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Invited</h5>
          <ul className="mt-0.5 space-y-0.5">{invitees.map(row)}</ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Speaker turns instead of one undifferentiated blob. Prefers `rawSegments`
 * (real per-turn timings from the Fathom API) and falls back to parsing
 * `rawText`, which also covers the glued `Name  0:09Text` grammar that Fathom's
 * .docx export produces.
 */
function TranscriptView({ row }: { row: TranscriptRow }) {
  const turns = buildTranscriptTurns({ rawText: row.rawText, rawSegments: row.rawSegments });

  if (turns.length === 0) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-500">
        No transcript text saved.
      </p>
    );
  }

  return (
    <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3">
      {turns.map((t, i) => (
        <div key={i}>
          {t.speaker || t.time ? (
            <div className="flex items-baseline gap-2">
              {t.speaker ? <span className="text-sm font-semibold text-gray-900">{t.speaker}</span> : null}
              {t.time ? <span className="text-xs tabular-nums text-gray-400">{t.time}</span> : null}
            </div>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

export function ExportTranscriptModal({
  clients,
  initialClientId,
  initialMode,
  onClose,
  variant = "modal",
}: {
  clients: ClientOpt[];
  initialClientId: string;
  initialMode: "daily" | "weekly";
  /** Modal-only — there is nothing to close when `variant` is "page". */
  onClose?: () => void;
  /**
   * "modal" (default) keeps the dashboard's dialog-over-backdrop presentation.
   * "page" drops the backdrop, the close button and Escape-to-close so the same
   * workspace can BE the /client-meetings/transcripts route. Nothing else
   * differs: one component serves both, so the two entry points cannot drift.
   */
  variant?: "modal" | "page";
}) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const [scope, setScope] = useState<Scope>(initialMode === "weekly" ? "weekly" : "daily");
  const [clientId, setClientId] = useState(initialClientId || clients[0]?.id || "");
  const [date, setDate] = useState(today);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState<View>("transcripts");

  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [selected, setSelected] = useState<TranscriptRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [viewerTab, setViewerTab] = useState<"transcript" | "report">("transcript");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [reportNonce, setReportNonce] = useState(0);

  const [confirming, setConfirming] = useState<(DeleteTarget & { url: string; after: "list" | "report" }) | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [needsAck, setNeedsAck] = useState(false);

  const { data: sessionData } = useSession();
  const currentUserId = (sessionData?.user as { id?: string } | undefined)?.id ?? "";

  const clientName = useMemo(
    () => clients.find((c) => c.id === clientId)?.name,
    [clients, clientId],
  );

  // A client only becomes available after the parent's fetch resolves; without
  // this the Weekly and Month panels sit on an empty clientId and report
  // "nothing found" for a client the user never got to choose.
  useEffect(() => {
    if (!clientId && clients.length) setClientId(initialClientId || clients[0].id);
  }, [clients, clientId, initialClientId]);

  // A different transcript resets the viewer to the transcript tab.
  useEffect(() => {
    setViewerTab("transcript");
  }, [selected?.id]);

  // Changing scope resets to that scope's default pane — "Monthly Report" has
  // no meaning under the Daily tab.
  useEffect(() => {
    setView("transcripts");
  }, [scope]);

  useEffect(() => {
    // As a page there is no dialog for Escape to dismiss — swallowing the key
    // there would strand the user on a route with no way back.
    if (variant === "page") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploadOpen && !bulkOpen && !confirming) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, uploadOpen, bulkOpen, confirming, variant]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (scope === "unassigned") {
        qs.set("status", "unassigned");
      } else {
        if (clientId) qs.set("clientId", clientId);
        if (scope === "daily") {
          qs.set("type", "DAILY");
          qs.set("date", date);
        } else if (scope === "weekly") {
          qs.set("type", "WEEKLY");
          const { from, to } = weekBounds(date);
          qs.set("from", from);
          qs.set("to", to);
        } else {
          qs.set("type", "WEEKLY");
          const { from, to } = monthBounds(year, month);
          qs.set("from", from);
          qs.set("to", to);
        }
      }
      const res = await fetch(`/api/client-meetings/transcripts?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load transcripts");
      setRows(json.data as TranscriptRow[]);
      setSelected((json.data as TranscriptRow[])[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [scope, clientId, date, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUploaded = useCallback((row: TranscriptRow) => {
    setUploadOpen(false);
    setRows((prev) => [row, ...prev]);
    setSelected(row);
    setViewerTab("transcript");
  }, []);

  const downloadTxt = (t: TranscriptRow) => {
    // Same cleaning + turn-shaping the viewer uses, so the download matches
    // what the user just read (and carries no recorder citation URLs).
    const summary = cleanFathomSummary(t.summary);
    const turns = buildTranscriptTurns({ rawText: t.rawText, rawSegments: t.rawSegments });
    const parts = [
      t.title || "Meeting transcript",
      `Client: ${t.clientName ?? "—"}`,
      `Type: ${t.type ?? "—"}`,
      `Date: ${fmtDate(t.meetingDate)}`,
      attendeesToPlainText(t.attendees) || "Attendees: —",
      "",
      summary ? `SUMMARY\n${summary}\n` : "",
      Array.isArray(t.actionItems) && t.actionItems.length
        ? `ACTION ITEMS\n${t.actionItems.map(actionItemLine).join("\n")}\n`
        : "",
      "TRANSCRIPT",
      turns.length ? turnsToPlainText(turns) : "No transcript text.",
    ];
    const blob = new Blob([parts.join("\n")], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, `${(t.title || t.clientName || "transcript").replace(/[^\w.-]+/g, "_").slice(0, 60)}.txt`);
  };

  const downloadDocx = async (t: TranscriptRow) => {
    setDownloading(true);
    try {
      const res = await fetch("/api/client-meetings/export/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      triggerDownload(blob, `${(t.title || t.clientName || "transcript").replace(/[^\w.-]+/g, "_").slice(0, 60)}.docx`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const askDeleteTranscript = (t: TranscriptRow) => {
    setDeleteError(null);
    setNeedsAck(false);
    setConfirming({
      url: `/api/client-meetings/transcripts/${t.id}`,
      after: "list",
      kind: "transcript",
      name: `${t.title || "Untitled meeting"} · ${fmtDate(t.meetingDate)}`,
      consequences: [
        "The recording, its text and any report generated from it stop appearing anywhere in Meeting Rhythm.",
        "Weekly and monthly reports already generated keep their numbers — they are not recalculated.",
        "Nothing is erased from the database, so it can be restored by an administrator.",
      ],
    });
  };

  const askDeleteDailyReport = (t: TranscriptRow) => {
    setDeleteError(null);
    setNeedsAck(false);
    setConfirming({
      url: `/api/client-meetings/transcripts/${t.id}/report`,
      after: "report",
      kind: "report",
      name: `Daily report · ${t.title || "Untitled meeting"} · ${fmtDate(t.meetingDate)}`,
      consequences: [
        "Only the generated report is discarded — the transcript itself is kept.",
        "Extracted facts and segments are kept, so regenerating does not re-read the meeting.",
        "KPI, Priority and WWW records already created from this report are left alone.",
      ],
    });
  };

  const confirmDelete = useCallback(
    async (opts: { reason: string; confirmValidated: boolean }) => {
      if (!confirming) return;
      setDeleting(true);
      setDeleteError(null);
      const result = await runDelete(confirming.url, opts);
      setDeleting(false);
      if (result.ok) {
        const wasList = confirming.after === "list";
        setConfirming(null);
        setNeedsAck(false);
        setNotice(wasList ? "The transcript was deleted." : "The report was deleted.");
        if (wasList) {
          void load();
        } else {
          // Remount the report panel so it re-reads and falls back to "not
          // generated yet" rather than showing the report it just deleted.
          setReportNonce((n) => n + 1);
        }
        return;
      }
      setNeedsAck(result.requiresConfirmation);
      setDeleteError(result.error);
    },
    [confirming, load],
  );

  const tabs: { id: Scope; label: string; icon: typeof Sun }[] = [
    { id: "daily", label: "Daily", icon: Sun },
    { id: "weekly", label: "Weekly", icon: CalendarDays },
    { id: "month", label: "Month", icon: CalendarRange },
    { id: "unassigned", label: "Unassigned", icon: FileQuestion },
  ];

  const subViews: { id: View; label: string }[] =
    scope === "weekly"
      ? [
          { id: "transcripts", label: "Transcripts" },
          { id: "wmReport", label: "Weekly Meeting Report" },
          { id: "rollup", label: "Daily Huddle Rollup" },
        ]
      : scope === "month"
        ? [
            { id: "transcripts", label: "Transcripts" },
            { id: "monthlyReport", label: "Monthly Report" },
          ]
        : [];

  const week = weekBounds(date);
  const period = `${year}-${String(month).padStart(2, "0")}`;

  const isPage = variant === "page";

  return (
    <>
      {/*
        Both variants render the same two elements; only their props differ.
        In page mode the outer one becomes `display: contents` — layout-
        transparent, so the panel sizes to the route instead of the viewport,
        while the DOM nesting (and this file) stays untouched.
      */}
      <div
        className={isPage ? "contents" : "fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"}
        role={isPage ? undefined : "presentation"}
        onClick={isPage ? undefined : onClose}
      >
        <div
          className={
            isPage
              ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              : "flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          }
          data-testid="transcript-workspace"
          // "region" keeps the aria-labelledby below meaningful on the route,
          // where there is no dialog for it to name.
          role={isPage ? "region" : "dialog"}
          aria-modal={isPage ? undefined : true}
          aria-labelledby="export-transcript-title"
          onClick={isPage ? undefined : (e) => e.stopPropagation()}
        >
          {/* ── Header ───────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
            <div>
              <h2 id="export-transcript-title" className="text-base font-semibold text-gray-900">
                Meeting Transcripts &amp; Reports
              </h2>
              <p className="mt-0.5 text-[11.5px] text-gray-500">
                Read a recording, or build the daily, weekly and monthly reports from it.
              </p>
            </div>
            {!isPage && (
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* ── Controls ─────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50/70 px-5 py-2.5">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs shadow-sm">
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setScope(t.id)}
                    aria-pressed={scope === t.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-medium transition ${
                      scope === t.id ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {scope !== "unassigned" && (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                aria-label="Client"
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
              >
                {clients.length === 0 ? <option value="">No clients yet</option> : null}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {(scope === "daily" || scope === "weekly") && (
              <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setDate(shiftDate(date, scope === "daily" ? -1 : -7))}
                  aria-label={scope === "daily" ? "Previous day" : "Previous week"}
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date"
                  className="border-0 bg-transparent px-1 py-1 text-xs focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDate(shiftDate(date, scope === "daily" ? 1 : 7))}
                  aria-label={scope === "daily" ? "Next day" : "Next week"}
                  className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDate(today)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-accent-700 hover:bg-accent-50"
                >
                  Today
                </button>
              </div>
            )}

            {scope === "daily" && (
              <span className="text-[11px] text-gray-500">{prettyDate(date)}</span>
            )}
            {scope === "weekly" && (
              <span className="text-[11px] text-gray-500">
                Week {week.from} → {week.to}
              </span>
            )}

            {scope === "month" && (
              <>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  aria-label="Month"
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  aria-label="Year"
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
                >
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </>
            )}

            {subViews.length ? (
              <>
                <span className="mx-1 h-5 w-px self-center bg-gray-200" />
                <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs shadow-sm">
                  {subViews.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setView(v.id)}
                      aria-pressed={view === v.id}
                      className={`px-3 py-1.5 font-medium transition ${
                        view === v.id ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {notice ? (
            <div className="border-b border-gray-100 px-5 py-2">
              <Banner tone="success">{notice}</Banner>
            </div>
          ) : null}

          {/* ── Body ─────────────────────────────────────────────────── */}
          {scope === "weekly" && view === "rollup" ? (
            <WeeklyRollupPanel clientId={clientId} clientName={clientName} weekStart={week.from} />
          ) : scope === "weekly" && view === "wmReport" ? (
            <WeeklyMeetingReportPanel
              clientId={clientId}
              clientName={clientName}
              weekStart={week.from}
              weekEnd={week.to}
            />
          ) : scope === "month" && view === "monthlyReport" ? (
            <MonthlyReportPanel clientId={clientId} clientName={clientName} period={period} />
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* List */}
              <div className="flex w-[19rem] shrink-0 flex-col border-r border-gray-200 bg-gray-50/40">
                <div className="border-b border-gray-200 bg-white p-2.5">
                  <button
                    onClick={() => setUploadOpen(true)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700"
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload Transcript
                  </button>
                  {/*
                    Bulk download sits beside Upload rather than inside a report
                    panel: it spans every client, kind and week, so it does not
                    belong to whichever single report is on screen.
                  */}
                  <button
                    onClick={() => setBulkOpen(true)}
                    className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700"
                  >
                    <Package className="h-3.5 w-3.5" /> Bulk Download Reports
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="p-3">
                      <Skeleton rows={5} />
                    </div>
                  ) : rows.length === 0 ? (
                    <p className="p-4 text-xs text-gray-500">
                      No transcripts for this selection. Try another date, or upload one.
                    </p>
                  ) : (
                    <ul className="p-2 space-y-1.5">
                      {rows.map((r) => (
                        <li key={r.id} className="group relative">
                          <button
                            onClick={() => setSelected(r)}
                            className={`block w-full rounded-xl border px-3 py-2.5 pr-8 text-left transition ${
                              selected?.id === r.id
                                ? "border-accent-300 bg-accent-50/70"
                                : "border-gray-200 bg-white hover:border-accent-200 hover:bg-accent-50/30"
                            }`}
                          >
                            <p className="truncate text-xs font-medium text-gray-800">{r.title || "Untitled meeting"}</p>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              {fmtDate(r.meetingDate)} · {r.type ?? "—"}
                              {r.durationMinutes != null ? ` · ${r.durationMinutes} min` : ""}
                            </p>
                            {r.matchStatus !== "MATCHED" || (scope === "unassigned" && r.clientName) ? (
                              <p className="mt-0.5 text-[10.5px] text-gray-400">
                                {scope === "unassigned" && r.clientName ? `${r.clientName} · ` : ""}
                                {r.matchStatus !== "MATCHED" ? r.matchStatus.toLowerCase() : ""}
                              </p>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            onClick={() => askDeleteTranscript(r)}
                            aria-label={`Delete transcript ${r.title || "Untitled meeting"}`}
                            title="Delete this transcript"
                            className="absolute right-1.5 top-2 rounded-md p-1 text-gray-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Viewer */}
              <div className="min-w-0 flex-1 overflow-y-auto bg-gray-50/30 p-5">
                {error ? (
                  <div className="mb-3">
                    <Banner tone="error">{error}</Banner>
                  </div>
                ) : null}
                {!selected ? (
                  <EmptyState
                    title="Select a transcript"
                    hint="Pick a recording on the left to read it, or switch to the Report view to turn it into a meeting report."
                  />
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900">{selected.title || "Meeting transcript"}</h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {selected.clientName ?? "Unassigned"} · {selected.type ?? "—"} · {fmtDate(selected.meetingDate)}
                          {selected.durationMinutes != null ? ` · ${selected.durationMinutes} min` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => downloadDocx(selected)}
                          disabled={downloading}
                          className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                        >
                          {downloading ? "…" : "Download .docx"}
                        </button>
                        <button
                          onClick={() => downloadTxt(selected)}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          .txt
                        </button>
                        <button
                          onClick={() =>
                            viewerTab === "report"
                              ? askDeleteDailyReport(selected)
                              : askDeleteTranscript(selected)
                          }
                          title={viewerTab === "report" ? "Delete this report" : "Delete this transcript"}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {viewerTab === "report" ? "Delete report" : "Delete"}
                        </button>
                      </div>
                    </div>

                    {/* Transcript ⇄ Report view toggle */}
                    <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs shadow-sm">
                      {(["transcript", "report"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setViewerTab(v)}
                          aria-pressed={viewerTab === v}
                          className={`px-3 py-1.5 font-medium capitalize transition ${
                            viewerTab === v ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>

                    {viewerTab === "report" ? (
                      <MeetingReportPanel
                        key={`${selected.id}-${reportNonce}`}
                        transcriptId={selected.id}
                        currentUserId={currentUserId}
                      />
                    ) : (
                      <div className="space-y-4">
                        <AttendeesView attendees={selected.attendees} />

                        {selected.summary ? (
                          <section>
                            <h4 className="mb-1 text-sm font-semibold text-gray-800">Summary</h4>
                            <SummaryView summary={selected.summary} />
                          </section>
                        ) : null}

                        <ActionItemsView items={selected.actionItems} recordingUrl={selected.recordingUrl} />

                        <section>
                          <h4 className="mb-1 text-sm font-semibold text-gray-800">Transcript</h4>
                          <TranscriptView row={selected} />
                        </section>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {uploadOpen ? (
        <UploadTranscriptModal
          clients={clients}
          initialClientId={clientId}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleUploaded}
        />
      ) : null}

      {bulkOpen ? (
        <BulkDownloadReportsModal
          clients={clients}
          initialClientId={clientId}
          onClose={() => setBulkOpen(false)}
        />
      ) : null}

      {confirming ? (
        <ConfirmDeleteDialog
          target={confirming}
          busy={deleting}
          error={deleteError}
          requiresConfirmation={needsAck}
          onCancel={() => {
            setConfirming(null);
            setDeleteError(null);
            setNeedsAck(false);
          }}
          onConfirm={(opts) => void confirmDelete(opts)}
        />
      ) : null}
    </>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
