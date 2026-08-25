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
 *
 * The left pane is the whole interaction: tick the days of the week to roll
 * up, press Generate, read the report on the right. Each day states plainly
 * what including it will do — "Included" reuses a daily report that already
 * exists, "Will generate" spends a model call to create the missing one — so
 * the cost of the button is visible before it is pressed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";
import type { ValidationResult } from "@/lib/ai/weeklyReportValidation";
import { WeeklyHuddleReportView } from "./WeeklyHuddleReportView";
import { DownloadWeeklyReportButtons } from "./DownloadWeeklyReportButtons";
import { ConfirmDeleteDialog, runDelete, type DeleteTarget } from "./ConfirmDeleteDialog";
import { Banner, ConfidenceBadge, EmptyState, SignOffBar, Skeleton } from "./reportUi";

interface WeekSource {
  date: string;
  huddleId: string | null;
  callStatus: string | null;
  transcriptId: string | null;
  hasReport: boolean;
  transcriptOnly: boolean;
}

interface CacheVerdict {
  known: boolean;
  stale: boolean;
  messages: string[];
  wouldClearSignOff: boolean;
}

const weekdayOf = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );

const dayNumberOf = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );

const monthOf = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );

/** What the checklist promises will happen to a day when Generate is pressed. */
function sourceState(s: WeekSource): {
  label: string;
  tone: string;
  selectable: boolean;
  hint: string;
} {
  if (s.callStatus !== "HELD") {
    return {
      label: (s.callStatus ?? "not held").toLowerCase().replace(/_/g, " "),
      tone: "bg-gray-100 text-gray-500",
      selectable: false,
      hint: "The huddle was not held on this day, so there is nothing to roll up.",
    };
  }
  if (!s.transcriptId) {
    return {
      label: "No transcript",
      tone: "bg-gray-100 text-gray-500",
      selectable: false,
      hint: "The huddle was held but no recording reached QuikScale, so this day cannot be analysed.",
    };
  }
  if (s.hasReport) {
    return {
      label: "Included",
      tone: "bg-green-100 text-green-700",
      selectable: true,
      hint: "A daily report already exists — including this day costs nothing extra.",
    };
  }
  return {
    label: "Will generate",
    tone: "bg-amber-100 text-amber-800",
    selectable: true,
    hint: "No daily report yet — including this day generates one first, which uses AI credit.",
  };
}

export function WeeklyRollupPanel({
  clientId,
  clientName,
  weekStart,
}: {
  clientId: string;
  /** Display name for the selected client, for headings and the delete dialog. */
  clientName?: string;
  /** Monday of the selected week, yyyy-mm-dd. */
  weekStart: string;
}) {
  const [sources, setSources] = useState<WeekSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<StoredWeeklyReport | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [cache, setCache] = useState<CacheVerdict | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [weekEnd, setWeekEnd] = useState("");

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [needsAck, setNeedsAck] = useState(false);

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
      setConfidence(typeof d.confidence === "number" ? d.confidence : null);
      setCache((d.cache as CacheVerdict | null) ?? null);
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

  const confirmDelete = useCallback(
    async (opts: { reason: string; confirmValidated: boolean }) => {
      setDeleting(true);
      setDeleteError(null);
      const qs = new URLSearchParams({ clientId, weekStart });
      const result = await runDelete(`/api/client-meetings/reports/weekly?${qs}`, opts);
      setDeleting(false);
      if (result.ok) {
        setConfirming(null);
        setNeedsAck(false);
        setReport(null);
        setValidation(null);
        setValidatedAt(null);
        setConfidence(null);
        setNotice("The weekly rollup report was deleted. Generate it again whenever you need it.");
        void load();
        return;
      }
      setNeedsAck(result.requiresConfirmation);
      setDeleteError(result.error);
    },
    [clientId, weekStart, load],
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
  const willGenerate = useMemo(
    () => selectable.filter((s) => selected.has(s.date) && !s.hasReport).length,
    [selectable, selected],
  );
  const allSelected = selectable.length > 0 && selected.size === selectable.length;

  // No client chosen is a different situation from "this week was quiet", and
  // saying so is the difference between a usable screen and a dead end.
  if (!clientId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Select a client to build a weekly rollup"
          hint="The rollup summarises one client's daily huddles for the chosen week. Pick a client above to get started."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Huddle checklist ─────────────────────────────────────────── */}
      <div className="flex w-[19rem] shrink-0 flex-col border-r border-gray-200 bg-gray-50/40">
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-accent-600" />
            <p className="text-xs font-semibold text-gray-800">Daily Huddles this week</p>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {weekStart}
            {weekEnd ? ` → ${weekEnd}` : ""}
          </p>
          {selectable.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(selectable.map((s) => s.date)))
              }
              className="mt-2 text-[11px] font-semibold text-accent-700 hover:underline"
            >
              {allSelected ? "Clear all" : `Select all ${selectable.length}`}
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {loading ? (
            <Skeleton rows={5} className="p-1" />
          ) : sources.length === 0 ? (
            <p className="px-1 py-2 text-xs text-gray-500">
              No daily huddles or transcripts landed for this client in this week.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {sources.map((s) => {
                const st = sourceState(s);
                const checked = selected.has(s.date);
                return (
                  <li key={s.date}>
                    <label
                      title={st.hint}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
                        !st.selectable
                          ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-70"
                          : checked
                            ? "border-accent-300 bg-accent-50/70"
                            : "border-gray-200 bg-white hover:border-accent-200 hover:bg-accent-50/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="text-blue-600"
                        checked={checked}
                        disabled={!st.selectable}
                        onChange={() => toggle(s.date)}
                        aria-label={`Include ${s.date}`}
                      />
                      <div
                        className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg ${
                          st.selectable ? "bg-white text-gray-700 shadow-sm" : "bg-white/60 text-gray-400"
                        }`}
                      >
                        <span className="text-[9px] font-semibold uppercase leading-none">
                          {weekdayOf(s.date)}
                        </span>
                        <span className="text-sm font-semibold leading-tight tabular-nums">
                          {dayNumberOf(s.date)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-xs font-medium ${
                            st.selectable ? "text-gray-800" : "text-gray-400"
                          }`}
                        >
                          Daily Huddle
                        </p>
                        <p className="text-[10.5px] text-gray-500">
                          {monthOf(s.date)} {dayNumberOf(s.date)}
                          {s.transcriptOnly ? " · transcript only" : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${st.tone}`}>
                        {st.label}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gray-200 bg-white p-3">
          <div className="mb-2 space-y-0.5 text-[11px] text-gray-600">
            <p>
              <strong className="text-gray-800">
                {selected.size} of {selectable.length}
              </strong>{" "}
              huddle{selectable.length === 1 ? "" : "s"} included
            </p>
            {willGenerate ? (
              <p className="text-amber-700">
                {willGenerate} daily report{willGenerate === 1 ? "" : "s"} will be generated first.
              </p>
            ) : null}
            {noTranscript ? (
              <p className="text-gray-400">
                {noTranscript} held huddle{noTranscript === 1 ? "" : "s"} without a transcript — skipped.
              </p>
            ) : null}
          </div>
          <button
            onClick={generate}
            disabled={generating || !selected.size}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          {!selected.size && selectable.length > 0 ? (
            <p className="mt-1.5 text-center text-[10.5px] text-gray-400">
              Tick at least one huddle to enable this.
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Report ───────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-gray-50/30 p-5">
        <div className="space-y-3">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {notice ? <Banner tone="warn">{notice}</Banner> : null}
          {report && cache?.known && cache.stale ? (
            <Banner tone="info">
              {cache.messages.join(" ") || "The huddles behind this report have changed since it was generated."}
              {cache.wouldClearSignOff ? " Regenerating will clear the current sign-off." : ""}
            </Banner>
          ) : null}

          {loading && !report ? (
            <Skeleton rows={6} />
          ) : !report ? (
            <EmptyState
              title="No rollup report for this week yet"
              hint="Pick the huddles to include on the left, then generate the report. Days that already have a daily report cost nothing to include."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Weekly Rollup Report</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {report.clientName} · Rollup of {report.sourceDays.filter((d) => d.hasReport).length}{" "}
                    Daily Huddles · {report.weekLabel}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <ConfidenceBadge value={confidence ?? report.overallConfidence} />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <DownloadWeeklyReportButtons report={report} clientId={clientId} weekStart={weekStart} />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setNeedsAck(false);
                        setConfirming({
                          kind: "report",
                          name: `Weekly rollup · ${clientName ?? report.clientName} · ${report.weekLabel}`,
                          consequences: [
                            "The rolled-up week-level report is removed from this week.",
                            "The daily reports it was built from are kept — regenerating costs one model call, not one per day.",
                            "Nothing in KPI, Priority or WWW is affected.",
                          ],
                        });
                      }}
                      title="Delete this weekly rollup report"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  ) : null}
                </div>
              </div>

              <SignOffBar
                validatedAt={validatedAt}
                canEdit={canEdit}
                saving={saving}
                blockedReason={
                  validation?.passed === false
                    ? "Resolve the consistency errors before signing off"
                    : null
                }
                onToggle={(next) => void setSignOff(next)}
                extra={
                  validatedAt ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      Signed off {new Date(validatedAt).toISOString().slice(0, 10)}
                    </span>
                  ) : null
                }
              />

              <WeeklyHuddleReportView report={report} validation={validation} />
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
