"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Plus, AlertCircle, GripVertical, X,
} from "lucide-react";
import { useCreateSurvey } from "@/lib/hooks/useSurvey";
import { useConfirm } from "@quikit/ui";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import {
  SURVEY_TYPE_CONFIG, SURVEY_TYPES,
  type SurveyType, type AnswerType, type QuestionInput,
} from "@/lib/schemas/surveySchema";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

export default function NewSurveyPage() {
  const router  = useRouter();
  const confirm = useConfirm();
  const createMutation = useCreateSurvey();
  const years = useMemo(() => Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i), []);

  const initialQuarter = getFiscalQuarter();
  const initialYear    = getFiscalYear();

  const [type,        setType]        = useState<SurveyType>("enps");
  const [title,       setTitle]       = useState(`${SURVEY_TYPE_CONFIG.enps.fullLabel} ${initialQuarter} ${initialYear}`);
  const [quarter,     setQuarter]     = useState<string>(initialQuarter);
  const [year,        setYear]        = useState<number>(initialYear);
  const [questions,   setQuestions]   = useState<QuestionInput[]>([
    { text: SURVEY_TYPE_CONFIG.enps.defaultQuestion, answerType: "nps_rank", allowComment: true, required: true },
  ]);
  const [formError,   setFormError]   = useState<string | null>(null);

  // "Dirty" = anything diverged from a freshly-typed default form for the current selections.
  const isDirty = useMemo(() => {
    const cfg = SURVEY_TYPE_CONFIG[type];
    const defaultTitle = `${cfg.fullLabel} ${quarter} ${year}`;
    if (title !== defaultTitle) return true;
    if (questions.length !== 1) return true;
    const q = questions[0]!;
    return q.text !== cfg.defaultQuestion
      || q.answerType !== "nps_rank"
      || q.allowComment !== true
      || q.required !== true;
  }, [type, title, quarter, year, questions]);

  function handleTypeChange(t: SurveyType) {
    const cfg = SURVEY_TYPE_CONFIG[t];
    setType(t);
    setTitle((prev) => {
      // Only auto-update the title if user hasn't customized it.
      const wasDefaultForOld = prev === `${SURVEY_TYPE_CONFIG[type].fullLabel} ${quarter} ${year}`;
      return wasDefaultForOld ? `${cfg.fullLabel} ${quarter} ${year}` : prev;
    });
    setQuestions((qs) => {
      if (qs.length === 1 && qs[0]!.text === SURVEY_TYPE_CONFIG[type].defaultQuestion) {
        return [{ text: cfg.defaultQuestion, answerType: "nps_rank", allowComment: true, required: true }];
      }
      return qs;
    });
  }

  function updateQuestion(idx: number, patch: Partial<QuestionInput>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function addQuestion() {
    setQuestions((qs) => [...qs, { text: "", answerType: "nps_rank", allowComment: false, required: true }]);
  }
  function removeQuestion(idx: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  }
  function moveQuestion(idx: number, delta: -1 | 1) {
    setQuestions((qs) => {
      const next = [...qs];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return qs;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  async function handleCancel() {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard this survey?",
        description: "Your changes will be lost.",
        confirmLabel: "Discard",
        tone: "danger",
      });
      if (!ok) return;
    }
    router.push("/performance/survey");
  }

  async function handleCreate() {
    if (!title.trim()) { setFormError("Title is required"); return; }
    if (questions.length === 0) { setFormError("At least one question is required"); return; }
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) { setFormError(`Question ${i + 1} text is required`); return; }
    }
    if (!questions.some((q) => q.answerType === "nps_rank")) {
      setFormError("Include at least one NPS Rank question so the NPS analytics work");
      return;
    }
    setFormError(null);
    try {
      const created = await createMutation.mutateAsync({
        type,
        title: title.trim(),
        questions: questions.map((q) => ({ ...q, text: q.text.trim() })),
        quarter,
        year,
      });
      router.push(`/performance/survey/${created.id}`);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create survey");
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link href="/performance/survey" className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Surveys
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Create Survey</h1>
            <p className="text-xs text-gray-500 mt-0.5">Compose questions, choose answer types, and publish a shareable link.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleCancel}
              disabled={createMutation.isPending}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md border border-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating…" : "Create Survey"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-5 min-h-0">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Left column — survey metadata */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Survey Type</label>
                <div className="flex flex-col gap-2">
                  {SURVEY_TYPES.map((t) => {
                    const cfg = SURVEY_TYPE_CONFIG[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleTypeChange(t)}
                        className={`text-left py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                          type === t ? `${cfg.headerBg} ${cfg.badgeText} border-transparent` : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <div>{cfg.label} — {cfg.audience}</div>
                        <div className={`text-[10px] font-normal mt-0.5 ${type === t ? cfg.badgeText : "text-gray-400"}`}>
                          {cfg.description.split(".")[0]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quarter</label>
                  <div className="flex border border-gray-200 rounded-md overflow-hidden">
                    {QUARTERS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuarter(q)}
                        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${quarter === q ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
                  >
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Survey Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q2 2026 Employee NPS"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
            </div>
          </div>

          {/* Right column — questions */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-800">
                  Questions <span className="text-gray-400 font-normal text-xs">({questions.length})</span> *
                </label>
                <button
                  type="button"
                  onClick={addQuestion}
                  disabled={questions.length >= 20}
                  className="flex items-center gap-1 text-xs font-medium text-accent-700 hover:text-accent-800 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Add question
                </button>
              </div>

              <div className="space-y-3">
                {questions.map((q, i) => (
                  <QuestionRow
                    key={i}
                    q={q}
                    index={i}
                    canRemove={questions.length > 1}
                    canMoveUp={i > 0}
                    canMoveDown={i < questions.length - 1}
                    onChange={(patch) => updateQuestion(i, patch)}
                    onRemove={() => removeQuestion(i)}
                    onMoveUp={() => moveQuestion(i, -1)}
                    onMoveDown={() => moveQuestion(i, 1)}
                  />
                ))}
              </div>
            </div>

            {formError && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {formError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionRow({
  q, index, canRemove, canMoveUp, canMoveDown, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  q: QuestionInput;
  index: number;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<QuestionInput>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/40">
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
            title="Move up"
            aria-label="Move up"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-[10px] font-semibold text-gray-500">Q{index + 1}</span>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-gray-300 hover:text-gray-700 disabled:opacity-30 rotate-180"
            title="Move down"
            aria-label="Move down"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2">
          <textarea
            value={q.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            placeholder="Question text…"
            className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
          />
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <select
              value={q.answerType}
              onChange={(e) => onChange({ answerType: e.target.value as AnswerType })}
              className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              <option value="nps_rank">NPS Rank (0–10)</option>
              <option value="yes_no">Yes / No</option>
            </select>
            <label className="flex items-center gap-1 cursor-pointer text-gray-600">
              <input
                type="checkbox"
                checked={q.allowComment}
                onChange={(e) => onChange({ allowComment: e.target.checked })}
                className="h-3 w-3"
              />
              Allow comment
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-gray-600">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="h-3 w-3"
              />
              Required
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="text-gray-300 hover:text-red-500 disabled:opacity-30 mt-1"
          title="Remove"
          aria-label="Remove question"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
