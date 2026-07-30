"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { PageBackground } from "@/components/hrms/page-background";
import { ClipboardList, Lock, ArrowLeft, CheckCircle2, Send, Star } from "lucide-react";

interface SurveyQuestion {
  text: string;
  type: "SurveyRating" | "SurveyScale" | "MultiChoice" | "SingleChoice" | "FreeText" | "NPS" | "Matrix";
  options?: string[];
  scale?: { min: number; max: number; labels?: string[] };
  isRequired?: boolean;
  category?: string;
}

interface SurveyDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  isAnonymous: boolean;
  startDate: string;
  endDate: string;
  questions: SurveyQuestion[];
}

export default function TakeSurveyPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApiClient();
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["survey", params.id],
    queryFn: () => api.get<SurveyDetail>(`/api/v1/hrms/engage/surveys/${params.id}`),
    enabled: !!params.id,
  });

  const survey = data?.data;
  const questions = useMemo(() => (Array.isArray(survey?.questions) ? survey!.questions : []), [survey]);

  const submitMut = useMutation({
    mutationFn: () => {
      const payload = {
        answers: questions.map((_, i) => ({ questionIndex: i, value: answers[i] ?? null })),
      };
      return api.post(`/api/v1/hrms/engage/surveys/${params.id}/respond`, payload);
    },
    onSuccess: async () => {
      setSubmitted(true);
      toast.success("Thanks for your response");
      // Redirect: straight to the dashboard when nothing else is pending,
      // otherwise back to the list to take the next survey. Exclude the survey
      // just submitted (anonymous ones stay flagged un-responded server-side).
      try {
        const res = await api.get<{ id: string; hasResponded: boolean }[]>("/api/v1/hrms/engage/surveys/my");
        const pending = (res.data ?? []).filter((s) => !s.hasResponded && s.id !== params.id);
        router.push(pending.length === 0 ? "/dashboard" : "/engage/surveys/my");
      } catch {
        router.push("/engage/surveys/my");
      }
    },
  });

  const requiredMissing = questions.some((q, i) => q.isRequired !== false && (answers[i] === undefined || answers[i] === null || answers[i] === ""));

  if (isLoading) {
    return <div className="surface-card p-10 text-center text-gray-500">Loading survey…</div>;
  }
  if (!survey) {
    return <div className="surface-card p-10 text-center text-gray-500">Survey not found.</div>;
  }
  if (survey.status !== "SurveyActive") {
    return (
      <div className="surface-card p-10 text-center">
        <p className="font-serif-display text-[13px] font-semibold text-gray-900">Not accepting responses</p>
        <p className="text-xs text-gray-500 mt-2">This survey is {survey.status.replace("Survey", "").toLowerCase()}.</p>
        <Link href="/engage/surveys/my" className="inline-block mt-4 text-xs text-green-600 hover:underline">← Back to my surveys</Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto surface-card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={28} className="text-emerald-600" />
        </div>
        <h2 className="font-serif-display text-[13px] font-semibold text-gray-900">Response received</h2>
        <p className="text-xs text-gray-500 mt-2">Thanks for taking the time. Your input helps shape what comes next.</p>
        <Link href="/engage/surveys/my" className="inline-flex items-center gap-1 mt-6 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-[#15803d]">
          Back to my surveys
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <Link href="/engage/surveys/my" className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft size={14} /> My surveys
      </Link>

      {/* Header */}
      <div className="surface-card p-4 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#14532d] to-[#16a34a] flex items-center justify-center shrink-0 text-white shadow-md">
            <ClipboardList size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider ring-1 ring-green-200">
                {survey.type.replace("Survey", "")}
              </span>
              {survey.isAnonymous && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 text-[10px] font-bold uppercase tracking-wider ring-1 ring-gray-200">
                  <Lock size={9} /> Anonymous
                </span>
              )}
            </div>
            <h1 className="text-page-title text-gray-900 mt-1.5">{survey.title}</h1>
            <p className="text-xs text-gray-500 mt-1">
              {questions.length} {questions.length === 1 ? "question" : "questions"} · Closes{" "}
              {new Date(survey.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
        {survey.isAnonymous && (
          <p className="mt-4 text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
            <Lock size={11} className="inline mr-1" />
            Responses are anonymous. Your name is not stored with the answers.
          </p>
        )}
      </div>

      {/* Questions */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitMut.mutate(); }}
        className="space-y-4"
      >
        {questions.map((q, i) => (
          <div key={i} className="surface-card p-4">
            <div className="flex items-start gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-green-50 text-green-700 text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900">
                  {q.text}
                  {q.isRequired !== false && <span className="text-rose-500 ml-1">*</span>}
                </p>
                {q.category && <p className="text-[11px] text-gray-400 mt-0.5">{q.category}</p>}
              </div>
            </div>
            <QuestionInput q={q} value={answers[i]} onChange={(v) => setAnswers((a) => ({ ...a, [i]: v }))} />
          </div>
        ))}

        {/* Submit */}
        <div className="surface-card p-4 flex items-center justify-between gap-3 sticky bottom-4">
          <p className="text-xs text-gray-500">
            {Object.keys(answers).length}/{questions.length} answered
          </p>
          <button
            type="submit"
            disabled={requiredMissing || submitMut.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#14532d] to-[#16a34a] text-white rounded-lg text-xs font-medium shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Send size={13} />
            {submitMut.isPending ? "Submitting…" : "Submit response"}
          </button>
        </div>
      </form>
    </div>
  );
}

function QuestionInput({
  q, value, onChange,
}: {
  q: SurveyQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (q.type === "SurveyRating") {
    const v = typeof value === "number" ? value : 0;
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`p-2 rounded-lg transition ${v >= n ? "text-amber-500" : "text-gray-300 hover:text-gray-400"}`}
            aria-label={`${n} star`}
          >
            <Star size={28} fill={v >= n ? "currentColor" : "none"} />
          </button>
        ))}
        {v > 0 && <span className="ml-2 text-sm font-bold text-gray-900">{v}/5</span>}
      </div>
    );
  }

  if (q.type === "SurveyScale") {
    const min = q.scale?.min ?? 1;
    const max = q.scale?.max ?? 10;
    const v = typeof value === "number" ? value : null;
    const buttons = [];
    for (let n = min; n <= max; n++) buttons.push(n);
    return (
      <div className="flex flex-wrap gap-2">
        {buttons.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`min-w-[40px] h-10 px-3 rounded-lg border-2 text-sm font-semibold transition ${
              v === n ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "NPS") {
    const v = typeof value === "number" ? value : null;
    return (
      <div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }).map((_, n) => {
            const tone = n <= 6 ? "bg-rose-500" : n <= 8 ? "bg-amber-500" : "bg-emerald-500";
            const active = v === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={`w-10 h-10 rounded-lg text-sm font-bold transition ${
                  active ? `${tone} text-white shadow-md` : "border-2 border-gray-200 text-gray-700 hover:border-gray-300"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] text-gray-500 mt-2">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
      </div>
    );
  }

  if (q.type === "SingleChoice") {
    const opts = q.options ?? [];
    return (
      <div className="space-y-2">
        {opts.map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
              value === opt ? "border-green-500 bg-green-50/60" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="text-green-600"
            />
            <span className="text-xs text-gray-800">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (q.type === "MultiChoice") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    const opts = q.options ?? [];
    const toggle = (opt: string) => {
      onChange(arr.includes(opt) ? arr.filter((o) => o !== opt) : [...arr, opt]);
    };
    return (
      <div className="space-y-2">
        {opts.map((opt) => {
          const checked = arr.includes(opt);
          return (
            <label
              key={opt}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                checked ? "border-green-500 bg-green-50/60" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt)}
                className="rounded text-green-600"
              />
              <span className="text-xs text-gray-800">{opt}</span>
            </label>
          );
        })}
      </div>
    );
  }

  // FreeText fallback (and Matrix simplified to free text for now)
  return (
    <textarea
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      placeholder="Type your answer…"
      className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 resize-none"
    />
  );
}
