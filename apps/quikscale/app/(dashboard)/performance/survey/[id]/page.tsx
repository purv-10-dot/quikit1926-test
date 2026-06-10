"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft, Download, ExternalLink, Copy,
  TrendingUp, TrendingDown, Minus, Users, MessageSquare,
  ThumbsUp, ThumbsDown,
} from "lucide-react";
import { useSurvey, useSurveyResponses } from "@/lib/hooks/useSurvey";
import {
  SURVEY_TYPE_CONFIG, calcNpsBreakdown, calcYesNoBreakdown, getNpsCategory,
  type SurveyType, type AnswerType,
} from "@/lib/schemas/surveySchema";

interface AnswerRow {
  questionId: string;
  scoreInt: number | null;
  scoreBool: boolean | null;
  comment: string | null;
}

interface ResponseRow {
  id: string;
  score: number; // legacy
  comment: string | null; // legacy
  respondentName: string | null;
  respondentEmail: string | null;
  submittedAt: string;
  answers: AnswerRow[];
}

interface QuestionRow {
  id: string;
  order: number;
  text: string;
  answerType: AnswerType;
  allowComment: boolean;
  required: boolean;
}

interface SurveyDetail {
  id: string;
  type: string;
  title: string;
  question: string;
  quarter: string;
  year: number;
  status: string;
  publicToken: string;
  questions: QuestionRow[];
  _count: { responses: number; questions: number };
}

export default function SurveyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: surveyData, isLoading: surveyLoading } = useSurvey(id);
  const { data: responsesData, isLoading: responsesLoading } = useSurveyResponses(id);

  const survey: SurveyDetail | undefined = surveyData;
  const responses: ResponseRow[] = useMemo(() => (responsesData as ResponseRow[] | undefined) ?? [], [responsesData]);

  if (surveyLoading) {
    return <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>;
  }
  if (!survey) {
    return <div className="flex items-center justify-center h-full text-sm text-gray-400">Survey not found.</div>;
  }

  const typeCfg = SURVEY_TYPE_CONFIG[survey.type as SurveyType];

  function downloadReport() {
    window.open(`/api/surveys/${id}/report`, "_blank");
  }
  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/s/${survey!.publicToken}`);
  }

  // Primary NPS = first nps_rank question (per validated design decision).
  const primaryNpsQ = survey.questions.find((q) => q.answerType === "nps_rank");
  const primaryNpsScores = primaryNpsQ
    ? responses
        .map((r) => r.answers.find((a) => a.questionId === primaryNpsQ.id))
        .filter((a): a is AnswerRow => Boolean(a) && a!.scoreInt !== null)
        .map((a) => ({ score: a.scoreInt! }))
    : [];
  const primaryBreakdown = calcNpsBreakdown(primaryNpsScores);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link href="/performance/survey" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Surveys
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeCfg.badgeBg} ${typeCfg.badgeText}`}>
                {typeCfg.label}
              </span>
              <span className="text-xs text-gray-400">{survey.quarter} {survey.year}</span>
              <StatusBadge status={survey.status} />
            </div>
            <h1 className="text-base font-semibold text-gray-900">{survey.title}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {survey.questions.length} question{survey.questions.length !== 1 ? "s" : ""} · {responses.length} response{responses.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={copyLink} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <Copy className="h-3.5 w-3.5" /> Copy Link
            </button>
            <a href={`/s/${survey.publicToken}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> Open Form
            </a>
            <button onClick={downloadReport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 transition-colors">
              <Download className="h-3.5 w-3.5" /> Download CSV
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-5 min-h-0">
        <div className="max-w-4xl mx-auto space-y-5">

          {/* Primary NPS headline */}
          {primaryNpsQ && (
            <PrimaryNpsBlock breakdown={primaryBreakdown} questionText={primaryNpsQ.text} />
          )}

          {/* Per-question report blocks */}
          {survey.questions.map((q) => (
            <QuestionReport key={q.id} question={q} responses={responses} />
          ))}

          {/* Empty state */}
          {!responsesLoading && responses.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Users className="h-8 w-8" />
              <p className="text-sm">No responses yet</p>
              <p className="text-xs">Share the survey link to start collecting responses.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Primary NPS block ─────────────────────────────────────────────────────────

function PrimaryNpsBlock({
  breakdown, questionText,
}: {
  breakdown: ReturnType<typeof calcNpsBreakdown>;
  questionText: string;
}) {
  const npsColor = breakdown.nps >= 50 ? "text-green-600" : breakdown.nps >= 0 ? "text-amber-600" : "text-red-600";
  const npsLabel = breakdown.nps >= 50 ? "Excellent" : breakdown.nps >= 30 ? "Good" : breakdown.nps >= 0 ? "Needs Work" : "Critical";

  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-2 uppercase tracking-wider">Primary NPS · "{questionText}"</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 md:col-span-1 bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">NPS Score</p>
          <p className={`text-5xl font-black ${npsColor}`}>{breakdown.nps}</p>
          <p className={`text-xs font-semibold mt-1 ${npsColor}`}>{npsLabel}</p>
          <p className="text-[10px] text-gray-400 mt-2">{breakdown.total} total responses</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700">Promoters</span>
          </div>
          <p className="text-3xl font-black text-green-600">{breakdown.promoters}</p>
          <p className="text-[10px] text-gray-400">{breakdown.promoterPct}% · scores 9–10</p>
          <NpsBar pct={breakdown.promoterPct} color="bg-green-500" />
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Minus className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Passives</span>
          </div>
          <p className="text-3xl font-black text-amber-600">{breakdown.passives}</p>
          <p className="text-[10px] text-gray-400">{breakdown.passivePct}% · scores 7–8</p>
          <NpsBar pct={breakdown.passivePct} color="bg-amber-400" />
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="text-xs font-semibold text-red-700">Detractors</span>
          </div>
          <p className="text-3xl font-black text-red-600">{breakdown.detractors}</p>
          <p className="text-[10px] text-gray-400">{breakdown.detractorPct}% · scores 0–6</p>
          <NpsBar pct={breakdown.detractorPct} color="bg-red-500" />
        </div>
      </div>
    </div>
  );
}

// ─── Per-question report ───────────────────────────────────────────────────────

function QuestionReport({ question, responses }: { question: QuestionRow; responses: ResponseRow[] }) {
  // Slice the answers for this specific question
  const answers = useMemo(
    () =>
      responses
        .map((r) => {
          const a = r.answers.find((x) => x.questionId === question.id);
          return a ? { ...a, respondentName: r.respondentName, respondentEmail: r.respondentEmail, submittedAt: r.submittedAt } : null;
        })
        .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    [responses, question.id],
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">Question {question.order + 1}</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{question.text}</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0 ml-3">
            {question.answerType === "nps_rank" ? "NPS Rank" : "Yes / No"}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {question.answerType === "nps_rank" ? (
          <NpsRankReport answers={answers} />
        ) : (
          <YesNoReport answers={answers} />
        )}

        {question.allowComment && (
          <CommentList answers={answers} />
        )}
      </div>
    </div>
  );
}

function NpsRankReport({ answers }: { answers: { scoreInt: number | null }[] }) {
  const scores = answers.filter((a) => a.scoreInt !== null).map((a) => ({ score: a.scoreInt! }));
  const breakdown = calcNpsBreakdown(scores);

  if (breakdown.total === 0) {
    return <p className="text-center text-xs text-gray-400 py-4">No responses for this question yet.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <p className="text-[10px] text-gray-400">NPS</p>
          <p className={`text-2xl font-black ${breakdown.nps >= 50 ? "text-green-600" : breakdown.nps >= 0 ? "text-amber-600" : "text-red-600"}`}>
            {breakdown.nps}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-green-700">Promoters</p>
          <p className="text-2xl font-black text-green-600">{breakdown.promoters}</p>
          <p className="text-[10px] text-gray-400">{breakdown.promoterPct}%</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-amber-700">Passives</p>
          <p className="text-2xl font-black text-amber-600">{breakdown.passives}</p>
          <p className="text-[10px] text-gray-400">{breakdown.passivePct}%</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-red-700">Detractors</p>
          <p className="text-2xl font-black text-red-600">{breakdown.detractors}</p>
          <p className="text-[10px] text-gray-400">{breakdown.detractorPct}%</p>
        </div>
      </div>
      <ScoreDistribution scores={scores.map((s) => s.score)} />
    </>
  );
}

function YesNoReport({ answers }: { answers: { scoreBool: boolean | null }[] }) {
  const breakdown = calcYesNoBreakdown(answers);

  if (breakdown.total === 0) {
    return <p className="text-center text-xs text-gray-400 py-4">No responses for this question yet.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[10px] text-gray-400">% Yes</p>
          <p className="text-3xl font-black text-green-600">{breakdown.yesPct}<span className="text-base">%</span></p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
            <p className="text-[10px] text-green-700">Yes</p>
          </div>
          <p className="text-2xl font-black text-green-600">{breakdown.yes}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <ThumbsDown className="h-3.5 w-3.5 text-red-600" />
            <p className="text-[10px] text-red-700">No</p>
          </div>
          <p className="text-2xl font-black text-red-600">{breakdown.no}</p>
        </div>
      </div>
      <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex">
        <div className="h-full bg-green-500 transition-all" style={{ width: `${breakdown.yesPct}%` }} title={`${breakdown.yes} Yes`} />
        <div className="h-full bg-red-400 transition-all" style={{ width: `${breakdown.noPct}%` }} title={`${breakdown.no} No`} />
      </div>
    </>
  );
}

function CommentList({
  answers,
}: {
  answers: {
    comment: string | null;
    respondentName: string | null;
    submittedAt: string;
    scoreInt: number | null;
    scoreBool: boolean | null;
  }[];
}) {
  const withComments = answers.filter((a) => a.comment && a.comment.trim().length > 0);
  if (withComments.length === 0) {
    return <p className="text-[11px] text-gray-400 text-center pt-2">No comments yet.</p>;
  }
  return (
    <div className="pt-3 border-t border-gray-100">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Comments ({withComments.length})</p>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {withComments.map((a, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <MessageSquare className="h-3 w-3 text-gray-400 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-gray-700 leading-relaxed">{a.comment}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {a.respondentName ?? "Anonymous"}
                {a.scoreInt !== null && ` · scored ${a.scoreInt}`}
                {a.scoreBool !== null && a.scoreBool !== undefined && ` · ${a.scoreBool ? "Yes" : "No"}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NpsBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-auto">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ScoreDistribution({ scores }: { scores: number[] }) {
  const counts = Array.from({ length: 11 }, (_, i) => scores.filter((s) => s === i).length);
  const max = Math.max(...counts, 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {counts.map((count, score) => {
        const cat = getNpsCategory(score);
        const color = cat === "promoter" ? "bg-green-400" : cat === "passive" ? "bg-amber-400" : "bg-red-400";
        const height = `${Math.round((count / max) * 100)}%`;
        return (
          <div key={score} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end" style={{ height: "64px" }}>
              <div className={`w-full rounded-t-sm ${color} transition-all`} style={{ height }} title={`Score ${score}: ${count} response${count !== 1 ? "s" : ""}`} />
            </div>
            <span className="text-[9px] text-gray-400">{score}</span>
          </div>
        );
      })}
    </div>
  );
}

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
