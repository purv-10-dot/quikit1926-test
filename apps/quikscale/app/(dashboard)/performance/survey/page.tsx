"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft, Plus, Copy, Check, ExternalLink,
  BarChart2,
  Users, Trash2, ChevronRight,
} from "lucide-react";
import { useSurveys, useUpdateSurvey, useDeleteSurvey } from "@/lib/hooks/useSurvey";
import { useConfirm } from "@quikit/ui";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import {
  SURVEY_TYPE_CONFIG, SURVEY_TYPES,
  type SurveyType, type SurveyStatus, type AnswerType,
} from "@/lib/schemas/surveySchema";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

type Tab = "analytics" | "surveys" | "responses";

interface QuestionRow {
  id: string;
  order: number;
  text: string;
  answerType: AnswerType;
  allowComment: boolean;
  required: boolean;
}

interface SurveyRow {
  id: string;
  type: string;
  title: string;
  question: string;
  quarter: string;
  year: number;
  status: SurveyStatus;
  publicToken: string;
  questions: QuestionRow[];
  _count: { responses: number; questions: number };
}

export default function SurveyPage() {
  const confirm  = useConfirm();
  const [tab, setTab]         = useState<Tab>("analytics");
  const [year, setYear]       = useState(getFiscalYear());
  const [quarter, setQuarter] = useState<string>(getFiscalQuarter());
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);
  const { data, isLoading } = useSurveys();
  const surveys: SurveyRow[] = useMemo(() => (data as SurveyRow[] | undefined) ?? [], [data]);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/s/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Analytics — aggregate NPS per type per period
  const filteredByPeriod = useMemo(() =>
    surveys.filter((s) => s.year === year && s.quarter === quarter),
  [surveys, year, quarter]);

  const prevQuarterIdx = QUARTERS.indexOf(quarter) - 1;
  const prevQuarter    = prevQuarterIdx >= 0 ? QUARTERS[prevQuarterIdx] : null;
  const prevYear       = prevQuarterIdx >= 0 ? year : year - 1;
  const prevPeriod     = prevQuarter ?? "Q4";
  const filteredPrev   = useMemo(() =>
    surveys.filter((s) => s.year === prevYear && s.quarter === prevPeriod),
  [surveys, prevYear, prevPeriod]);

  const displaySurveys = useMemo(() =>
    surveys.filter((s) => typeFilter === "all" || s.type === typeFilter),
  [surveys, typeFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link href="/performance/goals" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Pillar Hub
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">NPS Surveys</h1>
            <p className="text-xs text-gray-500 mt-0.5">eNPS · cNPS — measure employee and customer loyalty.</p>
          </div>
          <Link
            href="/performance/survey/new"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-600 text-white text-xs font-semibold rounded-lg hover:bg-accent-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Survey
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-100 -mb-px">
          {(["analytics", "surveys", "responses"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${
                tab === t ? "border-accent-600 text-accent-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-5 min-h-0">
        {isLoading && <div className="text-sm text-gray-400 text-center py-16">Loading…</div>}

        {/* ── Analytics ── */}
        {!isLoading && tab === "analytics" && (
          <div className="max-w-4xl mx-auto space-y-5">
            {/* Period selector */}
            <div className="flex items-center gap-3">
              <div className="flex border border-gray-200 rounded-md overflow-hidden">
                {QUARTERS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuarter(q)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${quarter === q ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* NPS Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SURVEY_TYPES.map((type) => {
                const current  = filteredByPeriod.filter((s) => s.type === type);
                const previous = filteredPrev.filter((s) => s.type === type);
                const cfg      = SURVEY_TYPE_CONFIG[type];
                return (
                  <NpsCard
                    key={type}
                    type={type}
                    cfg={cfg}
                    currentSurveys={current}
                    previousSurveys={previous}
                    prevLabel={`${prevPeriod} ${prevYear}`}
                    currentLabel={`${quarter} ${year}`}
                  />
                );
              })}
            </div>

            {/* Trend table */}
            {surveys.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800">Period Comparison</h3>
                </div>
                <TrendTable surveys={surveys} />
              </div>
            )}
          </div>
        )}

        {/* ── Surveys ── */}
        {!isLoading && tab === "surveys" && (
          <div className="max-w-4xl mx-auto space-y-3">
            {/* Type filter */}
            <div className="flex gap-2">
              {["all", ...SURVEY_TYPES].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    typeFilter === t ? "bg-accent-600 text-white border-transparent" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t === "all" ? "All" : SURVEY_TYPE_CONFIG[t as SurveyType].label}
                </button>
              ))}
            </div>

            {displaySurveys.length === 0 && (
              <div className="text-center py-16 text-sm text-gray-400">No surveys yet — create one above.</div>
            )}

            {displaySurveys.map((survey) => (
              <SurveyCard
                key={survey.id}
                survey={survey}
                onCopy={() => copyLink(survey.publicToken, survey.id)}
                copied={copiedId === survey.id}
                onDelete={async () => {
                  if (!(await confirm({ title: "Delete this survey?", description: "All responses will be lost.", confirmLabel: "Delete", tone: "danger" }))) return;
                }}
              />
            ))}
          </div>
        )}

        {/* ── Responses ── */}
        {!isLoading && tab === "responses" && (
          <div className="max-w-4xl mx-auto">
            <ResponsesAggregateView surveys={surveys} />
          </div>
        )}
      </div>

    </div>
  );
}

// ─── NPS Card ──────────────────────────────────────────────────────────────────

function NpsCard({
  type, cfg, currentSurveys, previousSurveys, prevLabel, currentLabel,
}: {
  type: SurveyType;
  cfg: typeof SURVEY_TYPE_CONFIG[SurveyType];
  currentSurveys: SurveyRow[];
  previousSurveys: SurveyRow[];
  prevLabel: string;
  currentLabel: string;
}) {
  const hasData = currentSurveys.some((s) => s._count.responses > 0);

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${cfg.border}`}>
      <div className={`px-5 py-3 flex items-center justify-between ${cfg.headerBg}`}>
        <div>
          <h3 className="text-sm font-bold text-gray-800">{cfg.fullLabel}</h3>
          <p className="text-[10px] text-gray-500">{cfg.description.split(".")[0]}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
          {cfg.label}
        </span>
      </div>

      <div className="p-5">
        {!hasData ? (
          <div className="text-center py-8 text-sm text-gray-400">
            No responses for {currentLabel}
          </div>
        ) : (
          <>
            {currentSurveys.map((survey) => (
              <SurveyNpsSummary key={survey.id} survey={survey} previousSurveys={previousSurveys} prevLabel={prevLabel} />
            ))}
          </>
        )}

        {currentSurveys.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400">
            No {cfg.label} surveys for {currentLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function SurveyNpsSummary({ survey, previousSurveys, prevLabel }: {
  survey: SurveyRow;
  previousSurveys: SurveyRow[];
  prevLabel: string;
}) {
  // We don't have response data here — just counts. Link to detail for full breakdown.
  const responseCount = survey._count.responses;
  return (
    <Link href={`/performance/survey/${survey.id}`} className="block p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-800">{survey.title}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{responseCount} response{responseCount !== 1 ? "s" : ""}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
      </div>
      <StatusBadge status={survey.status} />
    </Link>
  );
}

// ─── Survey Card ───────────────────────────────────────────────────────────────

function SurveyCard({
  survey, onCopy, copied, onDelete,
}: {
  survey: SurveyRow;
  onCopy: () => void;
  copied: boolean;
  onDelete: () => void;
}) {
  const cfg          = SURVEY_TYPE_CONFIG[survey.type as SurveyType];
  const updateMut    = useUpdateSurvey(survey.id);
  const deleteMut    = useDeleteSurvey(survey.id);
  const confirm      = useConfirm();

  async function cycleStatus() {
    const next: SurveyStatus = survey.status === "draft" ? "active" : survey.status === "active" ? "closed" : "draft";
    await updateMut.mutateAsync({ status: next });
  }

  async function handleDelete() {
    if (!(await confirm({ title: "Delete this survey?", description: "All responses will be permanently deleted.", confirmLabel: "Delete", tone: "danger" }))) return;
    await deleteMut.mutateAsync();
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${cfg.border}`}>
      <div className="p-4 flex items-start gap-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.headerBg}`}>
          <Users className={`h-4 w-4 ${cfg.badgeText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{survey.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                {survey.questions?.[0]?.text ?? survey.question}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <StatusBadge status={survey.status} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="text-xs text-gray-400">{survey.quarter} {survey.year}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>{cfg.label}</span>
            <span className="text-xs text-gray-500">
              {survey._count.questions ?? survey.questions?.length ?? 1} question{(survey._count.questions ?? survey.questions?.length ?? 1) !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-gray-500">·</span>
            <span className="text-xs text-gray-500">{survey._count.responses} response{survey._count.responses !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-2 bg-gray-50/50">
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-indigo-600 px-2 py-1 rounded hover:bg-white transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy Link"}
        </button>
        <a
          href={`/s/${survey.publicToken}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-indigo-600 px-2 py-1 rounded hover:bg-white transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Preview Form
        </a>
        <Link
          href={`/performance/survey/${survey.id}`}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-indigo-600 px-2 py-1 rounded hover:bg-white transition-colors"
        >
          <BarChart2 className="h-3.5 w-3.5" /> View Results
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={cycleStatus}
            disabled={updateMut.isPending}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-white transition-colors disabled:opacity-50"
          >
            {survey.status === "draft" ? "Activate" : survey.status === "active" ? "Close" : "Reopen"}
          </button>
          <button onClick={handleDelete} disabled={deleteMut.isPending} className="p-1 rounded text-red-400 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Responses aggregate ───────────────────────────────────────────────────────

function ResponsesAggregateView({ surveys }: { surveys: SurveyRow[] }) {
  if (surveys.length === 0) {
    return <div className="text-center py-16 text-sm text-gray-400">No surveys yet.</div>;
  }
  return (
    <div className="space-y-3">
      {surveys.map((survey) => (
        <Link key={survey.id} href={`/performance/survey/${survey.id}`}
          className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-200 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{survey.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{survey.quarter} {survey.year} · {survey._count.responses} responses</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={survey.status} />
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── Trend Table ───────────────────────────────────────────────────────────────

function TrendTable({ surveys }: { surveys: SurveyRow[] }) {
  const periods = Array.from(
    new Set(surveys.map((s) => `${s.quarter} ${s.year}`))
  ).sort((a, b) => {
    const [qa, ya] = a.split(" ");
    const [qb, yb] = b.split(" ");
    return Number(ya) !== Number(yb) ? Number(ya) - Number(yb) : qa.localeCompare(qb);
  }).slice(-6);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-5 py-2.5 text-left text-gray-500 font-medium">Type</th>
            {periods.map((p) => (
              <th key={p} className="px-4 py-2.5 text-center text-gray-500 font-medium">{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SURVEY_TYPES.map((type) => {
            const cfg = SURVEY_TYPE_CONFIG[type];
            return (
              <tr key={type} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-3">
                  <span className={`font-semibold ${cfg.badgeText}`}>{cfg.label}</span>
                </td>
                {periods.map((p) => {
                  const [q, y] = p.split(" ");
                  const periodSurveys = surveys.filter((s) => s.type === type && s.quarter === q && s.year === Number(y));
                  const hasResponses  = periodSurveys.some((s) => s._count.responses > 0);
                  return (
                    <td key={p} className="px-4 py-3 text-center">
                      {!hasResponses ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <Link href={`/performance/survey/${periodSurveys[0].id}`} className="font-bold text-gray-800 hover:text-indigo-600 transition-colors">
                          {periodSurveys[0]._count.responses}r
                        </Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    draft:  { label: "Draft",  cls: "bg-gray-100 text-gray-500" },
    active: { label: "Active", cls: "bg-green-100 text-green-700" },
    closed: { label: "Closed", cls: "bg-red-100 text-red-600" },
  }[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
  );
}
