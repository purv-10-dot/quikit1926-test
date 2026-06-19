"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePublicSurvey, useSubmitSurveyResponse } from "@/lib/hooks/useSurvey";
import {
  SURVEY_TYPE_CONFIG, NPS_CATEGORIES, getNpsCategory,
  type AnswerType,
} from "@/lib/schemas/surveySchema";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const SCORE_EMOJI: (score: number) => string = (s) => {
  if (s <= 2)  return "😞";
  if (s <= 4)  return "😐";
  if (s <= 6)  return "🙂";
  if (s <= 8)  return "😊";
  return "🤩";
};

interface PublicQuestion {
  id: string;
  order: number;
  text: string;
  answerType: AnswerType;
  allowComment: boolean;
  required: boolean;
}

interface PublicSurvey {
  id: string;
  type: string;
  title: string;
  question: string; // legacy fallback
  quarter: string;
  year: number;
  status: string;
  org: { name: string };
  questions: PublicQuestion[];
}

type AnswerState = {
  scoreInt?: number;
  scoreBool?: boolean;
  comment?: string;
};

export default function PublicSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const { data: survey, isLoading, isError } = usePublicSurvey(token) as {
    data: PublicSurvey | undefined; isLoading: boolean; isError: boolean;
  };
  const submitMutation = useSubmitSurveyResponse(token);

  const [answers,         setAnswers]         = useState<Record<string, AnswerState>>({});
  const [name,            setName]            = useState("");
  const [email,           setEmail]           = useState("");
  const [submitted,       setSubmitted]       = useState(false);
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, AnswerState>>({});
  const [formError,       setFormError]       = useState<string | null>(null);
  const [missingIds,      setMissingIds]      = useState<Set<string>>(new Set());

  function setScoreInt(qId: string, v: number) {
    setAnswers((a) => ({ ...a, [qId]: { ...a[qId], scoreInt: v } }));
    setMissingIds((m) => { const n = new Set(m); n.delete(qId); return n; });
  }
  function setScoreBool(qId: string, v: boolean) {
    setAnswers((a) => ({ ...a, [qId]: { ...a[qId], scoreBool: v } }));
    setMissingIds((m) => { const n = new Set(m); n.delete(qId); return n; });
  }
  function setComment(qId: string, v: string) {
    setAnswers((a) => ({ ...a, [qId]: { ...a[qId], comment: v } }));
  }

  async function handleSubmit() {
    if (!survey) return;
    const missing = new Set<string>();
    for (const q of survey.questions) {
      const a = answers[q.id];
      const answered = q.answerType === "nps_rank"
        ? a?.scoreInt !== undefined
        : a?.scoreBool !== undefined;
      if (q.required && !answered) missing.add(q.id);
    }
    if (missing.size > 0) {
      setMissingIds(missing);
      setFormError("Please answer all required questions.");
      return;
    }
    setMissingIds(new Set());
    setFormError(null);

    const payload = {
      answers: survey.questions
        .filter((q) => {
          const a = answers[q.id];
          return q.answerType === "nps_rank" ? a?.scoreInt !== undefined : a?.scoreBool !== undefined;
        })
        .map((q) => {
          const a = answers[q.id]!;
          return {
            questionId: q.id,
            ...(q.answerType === "nps_rank" ? { scoreInt: a.scoreInt } : { scoreBool: a.scoreBool }),
            ...(q.allowComment && a.comment ? { comment: a.comment } : {}),
          };
        }),
      respondentName:  name  || undefined,
      respondentEmail: email || undefined,
    };

    try {
      await submitMutation.mutateAsync(payload);
      setSubmittedAnswers(answers);
      setSubmitted(true);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to submit");
    }
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading survey…</p>
        </div>
      </Shell>
    );
  }

  if (isError || !survey) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-base font-medium text-gray-600">Survey not found</p>
          <p className="text-sm text-gray-400">This link may be invalid or expired.</p>
        </div>
      </Shell>
    );
  }

  if (survey.status === "closed") {
    return (
      <Shell orgName={survey.org.name}>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <AlertCircle className="h-10 w-10 text-amber-400" />
          <p className="text-base font-medium text-gray-700">This survey is closed</p>
          <p className="text-sm text-gray-400">Responses are no longer being accepted.</p>
        </div>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell orgName={survey.org.name}>
        <div className="flex flex-col items-center py-10 gap-4 text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Thank you for your feedback!</h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Your response has been recorded. Your input helps shape a better experience.
          </p>
          <div className="w-full mt-4 space-y-2 text-left">
            {survey.questions.map((q) => {
              const a = submittedAnswers[q.id];
              if (!a) return null;
              if (q.answerType === "nps_rank" && a.scoreInt !== undefined) {
                const cat = getNpsCategory(a.scoreInt);
                const catCfg = NPS_CATEGORIES[cat];
                return (
                  <div key={q.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${catCfg.bg} ${catCfg.border}`}>
                    <span className="text-gray-700 line-clamp-1">{q.text}</span>
                    <span className={`font-semibold ${catCfg.color}`}>
                      {SCORE_EMOJI(a.scoreInt)} {a.scoreInt} · {catCfg.label}
                    </span>
                  </div>
                );
              }
              if (q.answerType === "yes_no" && a.scoreBool !== undefined) {
                return (
                  <div key={q.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs">
                    <span className="text-gray-700 line-clamp-1">{q.text}</span>
                    <span className={`font-semibold ${a.scoreBool ? "text-green-700" : "text-red-700"}`}>
                      {a.scoreBool ? "Yes" : "No"}
                    </span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      </Shell>
    );
  }

  const typeCfg = SURVEY_TYPE_CONFIG[survey.type as keyof typeof SURVEY_TYPE_CONFIG];

  // Legacy surveys may have no `questions` rows yet (pre-backfill). Synthesize one.
  const questions: PublicQuestion[] = survey.questions.length > 0
    ? survey.questions
    : [{ id: "_legacy", order: 0, text: survey.question, answerType: "nps_rank", allowComment: true, required: true }];

  return (
    <Shell orgName={survey.org.name}>
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${typeCfg.badgeBg} ${typeCfg.badgeText}`}>
          {typeCfg.label}
        </span>
        <span className="text-xs text-gray-400">{survey.quarter} {survey.year}</span>
        <span className="text-xs text-gray-400 ml-auto">{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-6">{survey.title}</h1>

      <div className="space-y-6">
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={idx}
            answer={answers[q.id] ?? {}}
            missing={missingIds.has(q.id)}
            onScoreInt={(v) => setScoreInt(q.id, v)}
            onScoreBool={(v) => setScoreBool(q.id, v)}
            onComment={(v) => setComment(q.id, v)}
          />
        ))}
      </div>

      {/* Optional respondent identification */}
      <div className="grid grid-cols-2 gap-3 mt-6">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Your name <span className="text-gray-400">(optional)</span></label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email <span className="text-gray-400">(optional)</span></label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      {formError && (
        <div className="flex items-center gap-2 mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {formError}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitMutation.isPending}
        className="mt-6 w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitMutation.isPending ? "Submitting…" : "Submit Response"}
      </button>

      <p className="text-center text-[11px] text-gray-400 mt-4">
        Powered by <span className="font-semibold text-gray-500">Quikscale</span>
      </p>
    </Shell>
  );
}

function QuestionCard({
  q, index, answer, missing, onScoreInt, onScoreBool, onComment,
}: {
  q: PublicQuestion;
  index: number;
  answer: AnswerState;
  missing: boolean;
  onScoreInt: (v: number) => void;
  onScoreBool: (v: boolean) => void;
  onComment: (v: string) => void;
}) {
  return (
    <div className={`rounded-xl border p-4 transition-colors ${missing ? "border-red-300 bg-red-50/30" : "border-gray-200 bg-white"}`}>
      <p className="text-sm font-medium text-gray-800 mb-3">
        <span className="text-gray-400 font-normal mr-1">{index + 1}.</span>
        {q.text}
        {q.required && <span className="text-red-500 ml-0.5">*</span>}
      </p>

      {q.answerType === "nps_rank" && (
        <>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => {
              const isSelected = answer.scoreInt === i;
              let bg = "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200";
              if (isSelected) {
                if (i >= 9)      bg = "bg-green-500 border-green-500 text-white";
                else if (i >= 7) bg = "bg-amber-400 border-amber-400 text-white";
                else             bg = "bg-red-500 border-red-500 text-white";
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onScoreInt(i)}
                  className={`aspect-square rounded-lg border text-sm font-bold transition-all ${bg}`}
                >
                  {i}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
            <span>Not at all likely</span>
            <span>Extremely likely</span>
          </div>
          {answer.scoreInt !== undefined && (
            <div className="flex items-center justify-center gap-2 mt-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-xl">{SCORE_EMOJI(answer.scoreInt)}</span>
              <span className="text-xs font-medium text-gray-700">
                {answer.scoreInt} — {NPS_CATEGORIES[getNpsCategory(answer.scoreInt)].label}
              </span>
            </div>
          )}
        </>
      )}

      {q.answerType === "yes_no" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onScoreBool(true)}
            className={`py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
              answer.scoreBool === true
                ? "bg-green-500 border-green-500 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onScoreBool(false)}
            className={`py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
              answer.scoreBool === false
                ? "bg-red-500 border-red-500 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            No
          </button>
        </div>
      )}

      {q.allowComment && (
        <div className="mt-3">
          <textarea
            value={answer.comment ?? ""}
            onChange={(e) => onComment(e.target.value)}
            rows={2}
            placeholder="Tell us more (optional)…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      )}
    </div>
  );
}

function Shell({ orgName, children }: { orgName?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        {orgName && (
          <p className="text-center text-xs text-gray-400 mb-4 font-medium uppercase tracking-widest">
            {orgName}
          </p>
        )}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
