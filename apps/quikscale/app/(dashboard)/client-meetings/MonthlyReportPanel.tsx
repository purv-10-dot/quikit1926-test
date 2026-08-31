"use client";

/**
 * Monthly Report — the report side of the Month tab.
 *
 * The month is a trend of the weekly rollups, so the left pane is a coverage
 * checklist: which weeks already have a weekly report, and which do not. That
 * is deliberately shown BEFORE the Generate button rather than after, because
 * a month built from two of five weeks is a different document from a complete
 * one, and the person pressing the button is the one who should decide whether
 * to wait.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, CheckCircle2, FileText, RefreshCw, Trash2, Users } from "lucide-react";
import type { StoredMonthlyReport } from "@/lib/reports/monthlyCompose";
import { MonthlyReportView } from "./MonthlyReportView";
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

interface WeekCoverage {
  weekStart: string;
  label: string;
  hasReport: boolean;
  validated: boolean;
  generatedAt: string | null;
  confidence: number | null;
}

export function MonthlyReportPanel({
  clientId,
  clientName,
  period,
}: {
  clientId: string;
  clientName?: string;
  /** yyyy-mm */
  period: string;
}) {
  const [weeks, setWeeks] = useState<WeekCoverage[]>([]);
  const [report, setReport] = useState<StoredMonthlyReport | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const [loadingWeeks, setLoadingWeeks] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [needsAck, setNeedsAck] = useState(false);

  const loadCoverage = useCallback(async () => {
    if (!clientId) return;
    setLoadingWeeks(true);
    try {
      const qs = new URLSearchParams({ clientId, period });
      const res = await fetch(`/api/client-meetings/reports/monthly/coverage?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load coverage");
      setWeeks(json.data.weeks ?? []);
    } catch (e) {
      setError((e as Error).message);
      setWeeks([]);
    } finally {
      setLoadingWeeks(false);
    }
  }, [clientId, period]);

  const loadReport = useCallback(async () => {
    if (!clientId) return;
    setLoadingReport(true);
    setError(null);
    setNotice(null);
    try {
      const qs = new URLSearchParams({ clientId, period });
      const res = await fetch(`/api/client-meetings/reports/monthly?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load the report");
      const d = json.data;
      setReport((d.report as StoredMonthlyReport | null) ?? null);
      setConfidence(typeof d.confidence === "number" ? d.confidence : null);
      setValidatedAt(d.validatedAt ?? null);
      setGeneratedAt(d.generatedAt ?? null);
      setCanEdit(Boolean(d.canEdit));
    } catch (e) {
      setError((e as Error).message);
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  }, [clientId, period]);

  useEffect(() => {
    void loadCoverage();
    void loadReport();
  }, [loadCoverage, loadReport]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/client-meetings/reports/monthly/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, period, force: Boolean(report) }),
      });
      const json = await res.json();
      const d = json?.data ?? {};
      if (d.aiUnavailable) {
        setNotice("AI is temporarily unavailable — please try again shortly.");
      } else if (d.reportError) {
        setNotice(`Could not generate the report: ${d.reportError}`);
      } else if (!json.success) {
        setNotice(json?.error ?? "Failed to generate the report.");
      } else {
        if (d.cacheHit) {
          setNotice("Nothing has changed since the last generation — the stored report was reused, at no cost.");
        }
        await loadReport();
        void loadCoverage();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [clientId, period, report, loadReport, loadCoverage]);

  const setSignOff = useCallback(
    async (validated: boolean) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/client-meetings/reports/monthly", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, period, validated }),
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
    [clientId, period],
  );

  const confirmDelete = useCallback(
    async (opts: { reason: string; confirmValidated: boolean }) => {
      setDeleting(true);
      setDeleteError(null);
      const qs = new URLSearchParams({ clientId, period });
      const result = await runDelete(`/api/client-meetings/reports/monthly?${qs}`, opts);
      setDeleting(false);
      if (result.ok) {
        setConfirming(null);
        setNeedsAck(false);
        setReport(null);
        setValidatedAt(null);
        setNotice("The monthly report was deleted. The weekly reports behind it are untouched.");
        void loadReport();
        return;
      }
      setNeedsAck(result.requiresConfirmation);
      setDeleteError(result.error);
    },
    [clientId, period, loadReport],
  );

  if (!clientId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Select a client to open its monthly report"
          hint="The monthly report trends one client's weekly rollups. Pick a client above."
        />
      </div>
    );
  }

  const reported = weeks.filter((w) => w.hasReport).length;
  const missing = weeks.length - reported;

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Coverage checklist ───────────────────────────────────────── */}
      <div className="flex w-[19rem] shrink-0 flex-col border-r border-gray-200 bg-gray-50/40">
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5 text-accent-600" />
            <p className="text-xs font-semibold text-gray-800">Weeks in this month</p>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">{period}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {loadingWeeks ? (
            <Skeleton rows={4} className="p-1" />
          ) : weeks.length === 0 ? (
            <p className="px-1 py-2 text-xs text-gray-500">No weeks resolved for this period.</p>
          ) : (
            <ul className="space-y-1.5">
              {weeks.map((w) => (
                <li
                  key={w.weekStart}
                  className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${
                    w.hasReport ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${
                      w.hasReport ? "bg-accent-50 text-accent-700" : "bg-white text-gray-400"
                    }`}
                  >
                    {w.label}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium ${w.hasReport ? "text-gray-800" : "text-gray-400"}`}>
                      Week of {w.weekStart}
                    </p>
                    <p className="text-[10.5px] text-gray-500">
                      {w.hasReport
                        ? w.validated
                          ? "Weekly report signed off"
                          : "Weekly report ready"
                        : "No weekly report"}
                    </p>
                  </div>
                  {w.validated ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit ? (
          <div className="border-t border-gray-200 bg-white p-3">
            <div className="mb-2 text-[11px] text-gray-600">
              <p>
                <strong className="text-gray-800">
                  {reported} of {weeks.length}
                </strong>{" "}
                week{weeks.length === 1 ? "" : "s"} have a weekly report
              </p>
              {missing ? (
                <p className="text-amber-700">
                  {missing} week{missing === 1 ? "" : "s"} will be reported as missing.
                </p>
              ) : null}
            </div>
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
                  {report ? "Regenerate Monthly Report" : "Generate Monthly Report"}
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Report ───────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-gray-50/30 p-5">
        <div className="space-y-3">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {notice ? <Banner tone="warn">{notice}</Banner> : null}

          {loadingReport ? (
            <Skeleton rows={6} />
          ) : !report ? (
            <EmptyState
              title="No monthly report for this period yet"
              hint="The monthly report trends the weekly rollups on the left — the cheapest report in the pipeline to build."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">Monthly Report</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {report.clientName} · {report.periodLabel}
                    {generatedAt ? ` · generated ${new Date(generatedAt).toISOString().slice(0, 10)}` : ""}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <ConfidenceBadge value={confidence ?? report.overallConfidence} />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <DownloadDocxButton
                    endpoint="/api/client-meetings/reports/monthly/export"
                    body={{ clientId, period }}
                    filename={`Monthly-${(clientName ?? report.clientName).replace(/[^\w.-]+/g, "-")}-${period}.docx`}
                  />
                  <DownloadPdfButton
                    filename={`Monthly-${(clientName ?? report.clientName).replace(/[^\w.-]+/g, "-")}-${period}.pdf`}
                    makeDoc={async (orgName) => {
                      const { default: Doc } = await import("./MonthlyReportPdfDoc");
                      return (
                        <Doc report={report} orgName={orgName} validated={validatedAt !== null} />
                      );
                    }}
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setNeedsAck(false);
                        setConfirming({
                          kind: "report",
                          name: `Monthly report · ${clientName ?? report.clientName} · ${report.periodLabel}`,
                          consequences: [
                            "The month-level report is removed.",
                            "Every weekly rollup it trends is kept — this is the cheapest report to rebuild.",
                            "No WWW, KPI or Priority record is affected.",
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
                validatedAt={validatedAt}
                canEdit={canEdit}
                saving={saving}
                onToggle={(next) => void setSignOff(next)}
              />

              <MonthlyReportView report={report} />
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
