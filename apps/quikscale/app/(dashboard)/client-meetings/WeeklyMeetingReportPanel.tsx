"use client";

/**
 * Weekly Meeting Report — the report side of the Weekly tab.
 *
 * A weekly meeting runs three to six hours, and the architecture's whole point
 * is that this screen costs nothing to open: the report is read from storage,
 * never recomputed. Generation is a separate, explicit button, and the panel
 * says plainly when a report only covers part of the meeting — a PARTIAL
 * report can be read but cannot be signed off, and the server enforces that.
 *
 * The week can contain more than one weekly meeting (a rescheduled call, a
 * split session). Rather than guessing, the panel lists what it found and lets
 * the facilitator choose.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, FileText, RefreshCw, Trash2, Users } from "lucide-react";
import type { StoredWmReport } from "@/lib/reports/wmCompose";
import { WeeklyMeetingReportView } from "./WeeklyMeetingReportView";
import { ConfirmDeleteDialog, runDelete, type DeleteTarget } from "./ConfirmDeleteDialog";
import {
  Banner,
  ConfidenceBadge,
  DownloadDocxButton,
  DownloadPdfButton,
  EmptyState,
  SignOffBar,
  Skeleton,
} from "./reportUi";

interface MeetingRow {
  id: string;
  meetingDate: string;
  callStatus: string | null;
}

interface ReportState {
  report: StoredWmReport | null;
  confidence: number | null;
  completeness: string | null;
  coveragePct: number | null;
  validatedAt: string | null;
  generatedAt: string | null;
  canEdit: boolean;
  canValidate: boolean;
  stale: boolean;
  staleReasons: string[];
}

const EMPTY: ReportState = {
  report: null,
  confidence: null,
  completeness: null,
  coveragePct: null,
  validatedAt: null,
  generatedAt: null,
  canEdit: false,
  canValidate: false,
  stale: false,
  staleReasons: [],
};

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));

export function WeeklyMeetingReportPanel({
  clientId,
  clientName,
  weekStart,
  weekEnd,
}: {
  clientId: string;
  clientName?: string;
  /** Monday of the selected week, yyyy-mm-dd. */
  weekStart: string;
  /** Sunday of the selected week, yyyy-mm-dd. */
  weekEnd: string;
}) {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [meetingId, setMeetingId] = useState<string>("");
  const [state, setState] = useState<ReportState>(EMPTY);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [needsAck, setNeedsAck] = useState(false);

  // The week's weekly meetings.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoadingList(true);
    setError(null);
    (async () => {
      try {
        const qs = new URLSearchParams({ clientId, from: weekStart, to: weekEnd });
        const res = await fetch(`/api/client-meetings/weekly-meetings?${qs}`);
        const json = await res.json();
        if (cancelled) return;
        const rows: MeetingRow[] = Array.isArray(json?.data)
          ? json.data.map((r: MeetingRow) => ({
              id: r.id,
              meetingDate: r.meetingDate,
              callStatus: r.callStatus ?? null,
            }))
          : [];
        setMeetings(rows);
        setMeetingId(rows[0]?.id ?? "");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, weekStart, weekEnd]);

  const loadReport = useCallback(async () => {
    if (!meetingId) {
      setState(EMPTY);
      return;
    }
    setLoadingReport(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/client-meetings/reports/weekly-meeting?weeklyMeetingId=${encodeURIComponent(meetingId)}`,
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load the report");
      const d = json.data;
      setState({
        report: (d.report as StoredWmReport | null) ?? null,
        confidence: typeof d.confidence === "number" ? d.confidence : null,
        completeness: d.completeness ?? null,
        coveragePct: typeof d.coveragePct === "number" ? d.coveragePct : null,
        validatedAt: d.validatedAt ?? null,
        generatedAt: d.generatedAt ?? null,
        canEdit: Boolean(d.canEdit),
        canValidate: Boolean(d.canValidate),
        stale: Boolean(d.stale),
        staleReasons: Array.isArray(d.staleReasons) ? d.staleReasons : [],
      });
    } catch (e) {
      setError((e as Error).message);
      setState(EMPTY);
    } finally {
      setLoadingReport(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const generate = useCallback(async () => {
    if (!meetingId) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/client-meetings/reports/weekly-meeting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyMeetingId: meetingId, force: Boolean(state.report) }),
      });
      const json = await res.json();
      const d = json?.data ?? {};
      if (d.pending) {
        // Extraction still running is a wait, not a failure — generating now
        // would report on a fraction of the meeting and cache it.
        setNotice(
          d.message ?? "Extraction is still running for this meeting. Try again in a few minutes.",
        );
      } else if (d.aiUnavailable) {
        setNotice("AI is temporarily unavailable — please try again shortly.");
      } else if (d.reportError) {
        setNotice(`Could not generate the report: ${d.reportError}`);
      } else if (!json.success) {
        setNotice(json?.error ?? "Failed to generate the report.");
      } else {
        await loadReport();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [meetingId, state.report, loadReport]);

  const setSignOff = useCallback(
    async (validated: boolean) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/client-meetings/reports/weekly-meeting", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weeklyMeetingId: meetingId, validated }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Failed to save");
        setState((s) => ({ ...s, validatedAt: json.data?.validatedAt ?? null }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [meetingId],
  );

  const confirmDelete = useCallback(
    async (opts: { reason: string; confirmValidated: boolean }) => {
      setDeleting(true);
      setDeleteError(null);
      const result = await runDelete(
        `/api/client-meetings/reports/weekly-meeting?weeklyMeetingId=${encodeURIComponent(meetingId)}`,
        opts,
      );
      setDeleting(false);
      if (result.ok) {
        setConfirming(null);
        setNeedsAck(false);
        setNotice("The weekly meeting report was deleted. The extracted facts are kept, so regenerating is cheap.");
        void loadReport();
        return;
      }
      setNeedsAck(result.requiresConfirmation);
      setDeleteError(result.error);
    },
    [meetingId, loadReport],
  );

  if (!clientId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Select a client to open its weekly meeting report"
          hint="Weekly meeting reports are per client, per meeting. Pick a client above."
        />
      </div>
    );
  }

  const selected = meetings.find((m) => m.id === meetingId) ?? null;
  const partial = state.report != null && state.completeness !== "COMPLETE";

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Meetings in this week ────────────────────────────────────── */}
      <div className="flex w-[19rem] shrink-0 flex-col border-r border-gray-200 bg-gray-50/40">
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-accent-600" />
            <p className="text-xs font-semibold text-gray-800">Weekly meetings</p>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {weekStart} → {weekEnd}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {loadingList ? (
            <Skeleton rows={3} className="p-1" />
          ) : meetings.length === 0 ? (
            <p className="px-1 py-2 text-xs text-gray-500">
              No weekly meeting is logged for this client in this week.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {meetings.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setMeetingId(m.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      meetingId === m.id
                        ? "border-accent-300 bg-accent-50/70"
                        : "border-gray-200 bg-white hover:border-accent-200 hover:bg-accent-50/30"
                    }`}
                  >
                    <p className="text-xs font-medium text-gray-800">{dayLabel(m.meetingDate)}</p>
                    <p className="mt-0.5 text-[10.5px] text-gray-500">
                      {(m.callStatus ?? "—").toLowerCase().replace(/_/g, " ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {state.canEdit && meetingId ? (
          <div className="border-t border-gray-200 bg-white p-3">
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-700 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  {state.report ? "Regenerate Report" : "Generate Meeting Report"}
                </>
              )}
            </button>
            <p className="mt-1.5 text-center text-[10.5px] text-gray-400">
              Reads the extracted facts — the transcript is never re-read.
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Report ───────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-gray-50/30 p-5">
        <div className="space-y-3">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {notice ? <Banner tone="warn">{notice}</Banner> : null}
          {state.report && state.stale && state.staleReasons.length ? (
            <Banner tone="info">{state.staleReasons.join(" ")}</Banner>
          ) : null}
          {partial ? (
            <Banner tone="warn">
              This report covers {state.coveragePct != null ? `${state.coveragePct}%` : "part"} of the
              meeting, so it cannot be signed off. Retry the failed parts of the extraction, then
              regenerate.
            </Banner>
          ) : null}

          {loadingReport ? (
            <Skeleton rows={6} />
          ) : !meetingId ? (
            <EmptyState
              title="No weekly meeting in this week"
              hint="Log the weekly meeting under Meeting Rhythm → Weekly Meeting, or pick a different week."
            />
          ) : !state.report ? (
            <EmptyState
              title="No report for this meeting yet"
              hint="Generating reads the facts already extracted from the recording — a single small model call, however long the meeting ran."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Weekly Meeting Report</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {state.report.clientName} · {selected ? dayLabel(selected.meetingDate) : state.report.meetingDate}
                    {state.generatedAt
                      ? ` · generated ${new Date(state.generatedAt).toISOString().slice(0, 10)}`
                      : ""}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <ConfidenceBadge value={state.confidence ?? state.report.overallConfidence} />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                        partial ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"
                      }`}
                    >
                      {partial ? "Partial coverage" : "Complete coverage"}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <DownloadDocxButton
                    endpoint="/api/client-meetings/reports/weekly-meeting/export"
                    body={{ weeklyMeetingId: meetingId }}
                    filename={`Weekly-Meeting-${(clientName ?? state.report.clientName).replace(/[^\w.-]+/g, "-")}-${state.report.meetingDate}.docx`}
                  />
                  <DownloadPdfButton
                    filename={`Weekly-Meeting-${(clientName ?? state.report.clientName).replace(/[^\w.-]+/g, "-")}-${state.report.meetingDate}.pdf`}
                    makeDoc={async (orgName) => {
                      const { default: Doc } = await import("./WeeklyMeetingReportPdfDoc");
                      return (
                        <Doc
                          report={state.report!}
                          orgName={orgName}
                          validated={state.validatedAt !== null}
                        />
                      );
                    }}
                  />
                  {state.canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setNeedsAck(false);
                        setConfirming({
                          kind: "report",
                          name: `Weekly meeting report · ${clientName ?? state.report?.clientName} · ${state.report?.meetingDate}`,
                          consequences: [
                            "The composed weekly meeting report is removed.",
                            "The extracted facts and segments are kept — regenerating is one small model call, not a re-read of the meeting.",
                            "WWW items created from this meeting are untouched.",
                          ],
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  ) : null}
                </div>
              </div>

              <SignOffBar
                validatedAt={state.validatedAt}
                canEdit={state.canEdit}
                saving={saving}
                blockedReason={
                  state.canValidate
                    ? null
                    : "A report that covers only part of the meeting cannot be signed off"
                }
                onToggle={(next) => void setSignOff(next)}
              />

              <WeeklyMeetingReportView report={state.report} />
            </>
          )}
        </div>
      </div>

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
    </div>
  );
}
