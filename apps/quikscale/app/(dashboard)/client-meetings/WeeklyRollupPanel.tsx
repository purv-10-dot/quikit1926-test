"use client";

/**
 * Weekly Rollup — the Daily Huddle Weekly Report, rendered inside the Export
 * Transcript modal's Weekly tab.
 *
 * Deliberately NOT a page of its own: Meeting Rhythm → Dashboard stays the
 * single entry point, and this is reached through the Dashboard's existing
 * "Export Transcript" button. The component owns only fetching and selection;
 * every number it shows is computed server-side by `weeklyHuddleAggregate`,
 * and the written sections arrive from the generate route already validated.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, CheckCircle2 } from "lucide-react";
import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";
import type { ValidationResult } from "@/lib/ai/weeklyReportValidation";
import { WeeklyHuddleReportView } from "./WeeklyHuddleReportView";
import { DownloadWeeklyReportButtons } from "./DownloadWeeklyReportButtons";

interface WeekSource {
  date: string;
  huddleId: string | null;
  callStatus: string | null;
  transcriptId: string | null;
  hasReport: boolean;
  transcriptOnly: boolean;
}

const weekdayOf = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );

/** What the checklist promises will happen to a day when Generate is pressed. */
function sourceState(s: WeekSource): { label: string; tone: string; selectable: boolean } {
  if (s.callStatus !== "HELD") {
    return {
      label: (s.callStatus ?? "not held").toLowerCase().replace(/_/g, " "),
      tone: "bg-gray-100 text-gray-500",
      selectable: false,
    };
  }
  if (!s.transcriptId) return { label: "No transcript", tone: "bg-gray-100 text-gray-500", selectable: false };
  if (s.hasReport) return { label: "Included", tone: "bg-green-100 text-green-700", selectable: true };
  return { label: "Will generate", tone: "bg-amber-100 text-amber-800", selectable: true };
}

export function WeeklyRollupPanel({
  clientId,
  weekStart,
}: {
  clientId: string;
  /** Monday of the selected week, yyyy-mm-dd. */
  weekStart: string;
}) {
  const [sources, setSources] = useState<WeekSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<StoredWeeklyReport | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [weekEnd, setWeekEnd] = useState("");

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId || !weekStart) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const qs = new URLSearchParams({ clientId, weekStart });
      const res = await fetch(`/api/client-meetings/reports/weekly?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load");
      const d = json.data;
      const list: WeekSource[] = d.sources ?? [];
      setSources(list);
      setSelected(new Set(list.filter((s) => sourceState(s).selectable).map((s) => s.date)));
      setReport((d.report as StoredWeeklyReport | null) ?? null);
      setValidation((d.validation as ValidationResult | null) ?? null);
      setValidatedAt(d.validatedAt ?? null);
      setCanEdit(Boolean(d.canEdit));
      setWeekEnd(d.weekEnd ?? "");
    } catch (e) {
      setError((e as Error).message);
      setSources([]);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [clientId, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/client-meetings/reports/weekly/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, weekStart, dates: [...selected] }),
      });
      const json = await res.json();
      const d = json?.data ?? {};
      if (d.aiUnavailable) {
        setNotice("AI is temporarily unavailable — please try again shortly.");
      } else if (d.reportError) {
        setNotice(`Could not generate the report: ${d.reportError}`);
      } else if (d.noData) {
        setNotice("No daily huddles were recorded for this client in the selected week.");
      } else if (d.report) {
        setReport(d.report as StoredWeeklyReport);
        setValidation((d.validation as ValidationResult) ?? null);
        setValidatedAt(null);
        setCanEdit(Boolean(d.canEdit));
        if (Array.isArray(d.notes) && d.notes.length) setNotice(d.notes.join(" "));
        // Refresh the checklist so backfilled days now read "Included".
        void load();
      } else {
        setNotice(json?.error ?? "Failed to generate the report.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [clientId, weekStart, selected, load]);

  const setSignOff = useCallback(
    async (validated: boolean) => {
      if (!report) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/client-meetings/reports/weekly", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, weekStart, report, validated }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Failed to save");
        setValidatedAt(json.data?.validatedAt ?? null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [report, clientId, weekStart],
  );

  const toggle = (date: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const selectable = useMemo(() => sources.filter((s) => sourceState(s).selectable), [sources]);
  const noTranscript = useMemo(
    () => sources.filter((s) => s.callStatus === "HELD" && !s.transcriptId).length,
    [sources],
  );

  return (
    <div className="flex min-h-0 flex-1">
      {/* Huddle checklist */}
      <div className="flex w-72 shrink-0 flex-col border-r border-gray-200">
        <div className="border-b border-gray-200 px-4 py-2.5">
          <p className="text-xs font-semibold text-gray-800">Daily Huddles this week</p>
          <p className="text-[11px] text-gray-500">
            {weekStart}
            {weekEnd ? ` → ${weekEnd}` : ""}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="p-2 text-xs text-gray-400">Loading…</p>
          ) : sources.length === 0 ? (
            <p className="p-2 text-xs text-gray-400">No daily huddles recorded for this week.</p>
          ) : (
            <ul className="space-y-1.5">
              {sources.map((s) => {
                const st = sourceState(s);
                return (
                  <li
                    key={s.date}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                      st.selectable ? "border-gray-200" : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="text-blue-600"
                      checked={selected.has(s.date)}
                      disabled={!st.selectable}
                      onChange={() => toggle(s.date)}
                      aria-label={`Include ${s.date}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium ${st.selectable ? "text-gray-800" : "text-gray-400"}`}>
                        Daily Huddle
                      </p>
                      <p className="text-[10.5px] text-gray-500">
                        {weekdayOf(s.date)}, {dayLabel(s.date)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${st.tone}`}>
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-200 p-2">
          <p className="mb-1.5 px-0.5 text-[11px] text-gray-600">
            <strong className="text-gray-800">
              {selected.size} of {selectable.length}
            </strong>{" "}
            huddle{selectable.length === 1 ? "" : "s"} included
            {noTranscript ? ` · ${noTranscript} has no transcript` : ""}
          </p>
          <button
            onClick={generate}
            disabled={generating || !selected.size}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {generating ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" />
                {report ? "Regenerate Rollup Report" : "Generate Weekly Rollup Report"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Report */}
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : null}
        {notice ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {notice}
          </div>
        ) : null}

        {loading && !report ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : !report ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
            <FileText className="mx-auto h-7 w-7 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No rollup report generated for this week yet.</p>
            <p className="text-xs text-gray-400">Pick the huddles to include, then generate the report.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Weekly Rollup Report</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {report.clientName} · Rollup of {report.sourceDays.filter((d) => d.hasReport).length} Daily Huddles ·{" "}
                  {report.weekLabel}
                </p>
              </div>
              <DownloadWeeklyReportButtons report={report} clientId={clientId} weekStart={weekStart} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
              {validatedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Validated
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                  Draft
                </span>
              )}
              {canEdit ? (
                <button
                  onClick={() => setSignOff(!validatedAt)}
                  disabled={saving || (!validatedAt && validation?.passed === false)}
                  title={
                    !validatedAt && validation?.passed === false
                      ? "Resolve the consistency errors before signing off"
                      : undefined
                  }
                  className="rounded-lg border border-accent-300 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50"
                >
                  {saving ? "Saving…" : validatedAt ? "Withdraw sign-off" : "Mark as validated"}
                </button>
              ) : (
                <span className="text-[11px] italic text-gray-400">View only</span>
              )}
            </div>

            <WeeklyHuddleReportView report={report} validation={validation} />
          </div>
        )}
      </div>
    </div>
  );
}
