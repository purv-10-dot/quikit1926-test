"use client";

import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { todayInput } from "@/lib/utils/date-input";
import { Select } from "@/components/hrms/ui/select";
import { clsx } from "clsx";
import { Plus, BarChart3, ClipboardList, Star, BarChart2, ListChecks, CheckSquare, Type, Gauge, Trash2, GripVertical, Lock, Calendar, Send, Play, X as XIcon, Eye } from "lucide-react";
import Link from "next/link";
import { SkeletonTable } from "@/components/hrms/skeleton";

type QType = "SurveyRating" | "SurveyScale" | "SingleChoice" | "MultiChoice" | "FreeText" | "NPS";

interface QuestionDraft {
  text: string;
  type: QType;
  isRequired: boolean;
  options?: string[];
  scale?: { min: number; max: number };
}

interface SurveyForm {
  title: string;
  type: string;
  isAnonymous: boolean;
  startDate: string;
  endDate: string;
  questions: QuestionDraft[];
}

const qTypeMeta: Record<QType, { label: string; Icon: LucideIcon; tone: string }> = {
  SurveyRating: { label: "Rating", Icon: Star, tone: "amber" },
  SurveyScale: { label: "Scale", Icon: Gauge, tone: "blue" },
  SingleChoice: { label: "Single", Icon: ListChecks, tone: "violet" },
  MultiChoice: { label: "Multi", Icon: CheckSquare, tone: "emerald" },
  FreeText: { label: "Text", Icon: Type, tone: "gray" },
  NPS: { label: "NPS", Icon: BarChart2, tone: "rose" },
};

const toneMap: Record<string, { bg: string; text: string; ring: string; activeBg: string; activeText: string }> = {
  amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", activeBg: "bg-amber-500", activeText: "text-white" },
  blue: { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200", activeBg: "bg-green-500", activeText: "text-white" },
  violet: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200", activeBg: "bg-violet-500", activeText: "text-white" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", activeBg: "bg-emerald-500", activeText: "text-white" },
  gray: { bg: "bg-gray-100", text: "text-gray-700", ring: "ring-gray-200", activeBg: "bg-gray-700", activeText: "text-white" },
  rose: { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200", activeBg: "bg-rose-500", activeText: "text-white" },
};

interface SurveyItem {
  id: string;
  title: string;
  type: string;
  status: string;
  isAnonymous: boolean;
  startDate: string;
  endDate: string;
  responseRate: string;
  _count: { responses: number };
}

const statusColors: Record<string, string> = {
  SurveyDraft: "bg-gray-100 text-gray-600",
  SurveyActive: "bg-green-100 text-green-700",
  SurveyClosed: "bg-red-100 text-red-700",
  SurveyAnalysed: "bg-[#dcfce7] text-[#16a34a]",
};

function formatDate(d: string) { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }

export default function SurveysPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState<SurveyForm>({
    title: "", type: "PulseCheck", isAnonymous: true,
    startDate: "", endDate: "",
    questions: [{ text: "", type: "SurveyRating", isRequired: true }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["surveys"],
    queryFn: () => api.get<SurveyItem[]>("/api/v1/hrms/engage/surveys?limit=50"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/engage/surveys", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["surveys"] }); setShowCreate(false); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/hrms/engage/surveys/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/engage/surveys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["surveys"] });
      setConfirmTarget(null);
    },
  });

  const addQuestion = () => setForm({ ...form, questions: [...form.questions, { text: "", type: "SurveyRating", isRequired: true }] });
  const removeQ = (i: number) => setForm({ ...form, questions: form.questions.filter((_, idx) => idx !== i) });
  const updateQ = (i: number, patch: Partial<QuestionDraft>) => {
    const qs = [...form.questions];
    qs[i] = { ...qs[i], ...patch };
    setForm({ ...form, questions: qs });
  };
  const setQType = (i: number, type: QType) => {
    const patch: Partial<QuestionDraft> = { type };
    if (type === "SingleChoice" || type === "MultiChoice") {
      patch.options = form.questions[i].options ?? ["Option 1", "Option 2"];
    } else {
      patch.options = undefined;
    }
    if (type === "SurveyScale") {
      patch.scale = form.questions[i].scale ?? { min: 1, max: 10 };
    } else {
      patch.scale = undefined;
    }
    updateQ(i, patch);
  };

  const surveys = data?.data ?? [];

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-page-title text-gray-900">Surveys &amp; pulse checks</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/engage/surveys/my"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <ClipboardList size={13} /> My surveys
          </Link>
          <button onClick={() => { setForm({ title: "", type: "PulseCheck", isAnonymous: true, startDate: "", endDate: "", questions: [{ text: "", type: "SurveyRating", isRequired: true }] }); setShowCreate(true); }}
            className="btn btn-primary">
            <Plus size={13} /> New survey
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-4"><SkeletonTable rows={6} cols={5} /></div> : surveys.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><BarChart3 size={32} className="mx-auto mb-2 text-gray-300" />No surveys</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Survey</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Type</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Period</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Responses</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Rate</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Status</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map((s, i) => (
                <tr key={s.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-gray-900">{s.title}</p>
                    {s.isAnonymous && <p className="text-xs text-gray-400">Anonymous</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{s.type}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{formatDate(s.startDate)} — {formatDate(s.endDate)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-center">{s._count.responses}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-center">{Number(s.responseRate).toFixed(0)}%</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", statusColors[s.status])}>{s.status.replace("Survey", "")}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/engage/surveys/${s.id}/take`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 text-xs font-normal hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-colors"
                        title="Preview survey"
                      >
                        <Eye size={12} /> <span className="hidden md:inline">View</span>
                      </Link>

                      {s.status === "SurveyDraft" && (
                        <button
                          onClick={() => updateMut.mutate({ id: s.id, status: "SurveyActive" })}
                          disabled={updateMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-normal shadow-sm hover:bg-emerald-700 hover:shadow-md disabled:opacity-50 transition-all"
                        >
                          <Play size={11} fill="currentColor" /> Activate
                        </button>
                      )}

                      {s.status === "SurveyActive" && (
                        <button
                          onClick={() => updateMut.mutate({ id: s.id, status: "SurveyClosed" })}
                          disabled={updateMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-200 text-xs font-normal hover:bg-rose-100 disabled:opacity-50 transition-all"
                        >
                          <XIcon size={11} /> Close
                        </button>
                      )}

                      {(s.status === "SurveyClosed" || s.status === "SurveyAnalysed") && (
                        <button
                          onClick={() => setConfirmTarget({ id: s.id, title: s.title })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-normal shadow-sm hover:bg-rose-700 hover:shadow-md transition-all"
                          title="Delete survey"
                        >
                          <Trash2 size={11} /> <span className="hidden md:inline">Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Survey"
        subtitle="Build questions, set audience, gather feedback."
        headerIcon={<BarChart3 size={18} />}
        size="2xl"
        bodyClassName="p-0 overflow-y-auto"
      >
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }}>
          {/* Top section — basics */}
          <div className="px-5 pt-4 pb-4 bg-gradient-to-br from-green-50/50 via-white to-violet-50/30 border-b border-gray-100 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-gray-800">Survey title</label>
                <span className={`text-[11px] font-medium ${form.title.length > 100 ? "text-rose-500" : "text-gray-400"}`}>
                  {form.title.length}/120
                </span>
              </div>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value.slice(0, 120) })}
                required
                placeholder="e.g. Q2 team morale check"
                className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Type</label>
                <Select
                  value={form.type}
                  onChange={(v) => setForm({ ...form, type: v })}
                  options={["Engagement", "PulseCheck", "Exit", "Onboarding", "Custom", "ENPS"].map((t) => ({ value: t, label: t }))}
                />
              </div>
              <button
                type="button"
                onClick={() => setForm({ ...form, isAnonymous: !form.isAnonymous })}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border-2 transition-all ${
                  form.isAnonymous ? "border-violet-400 bg-violet-50/60" : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${form.isAnonymous ? "bg-violet-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Lock size={14} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-800">Anonymous</p>
                    <p className="text-[11px] text-gray-500 truncate">Hide responder identity</p>
                  </div>
                </div>
                <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${form.isAnonymous ? "bg-violet-500" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isAnonymous ? "translate-x-4" : "translate-x-0.5"}`} />
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                  <Calendar size={12} /> Start date
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  min={todayInput()}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                  <Calendar size={12} /> End date
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  min={todayInput()}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
                />
              </div>
            </div>
          </div>

          {/* Questions section */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-gray-900">Questions</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">{form.questions.length} {form.questions.length === 1 ? "question" : "questions"}</p>
              </div>
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100"
              >
                <Plus size={12} /> Add question
              </button>
            </div>

            {form.questions.map((q, i) => {
              const meta = qTypeMeta[q.type];
              const tone = toneMap[meta.tone];
              return (
                <div key={i} className="rounded-xl border-2 border-gray-200 bg-white p-4 space-y-3 hover:border-gray-300 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0 mt-1">
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={q.text}
                      onChange={(e) => updateQ(i, { text: e.target.value })}
                      required
                      placeholder={`Question ${i + 1}…`}
                      className="flex-1 border-0 border-b-2 border-gray-100 focus:border-green-500 px-0 py-1.5 text-sm font-medium focus:outline-none focus:ring-0 bg-transparent"
                    />
                    {form.questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQ(i)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0"
                        aria-label="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Type chips */}
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {(Object.keys(qTypeMeta) as QType[]).map((t) => {
                      const m = qTypeMeta[t];
                      const tm = toneMap[m.tone];
                      const active = q.type === t;
                      const Icon = m.Icon;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setQType(i, t)}
                          className={clsx(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ring-1",
                            active
                              ? `${tm.activeBg} ${tm.activeText} ring-transparent shadow-sm`
                              : `${tm.bg} ${tm.text} ${tm.ring} hover:opacity-80`,
                          )}
                        >
                          <Icon size={11} /> {m.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Type-specific config */}
                  {(q.type === "SingleChoice" || q.type === "MultiChoice") && (
                    <div className="pl-10 space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Choices</p>
                      {(q.options ?? []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-gray-300"><GripVertical size={12} /></span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const opts = [...(q.options ?? [])];
                              opts[oi] = e.target.value;
                              updateQ(i, { options: opts });
                            }}
                            placeholder={`Option ${oi + 1}`}
                            className="flex-1 border border-gray-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                          />
                          {(q.options?.length ?? 0) > 2 && (
                            <button
                              type="button"
                              onClick={() => updateQ(i, { options: (q.options ?? []).filter((_, idx) => idx !== oi) })}
                              className="p-1 text-gray-400 hover:text-rose-600"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => updateQ(i, { options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`] })}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600 hover:text-green-700 mt-1"
                      >
                        <Plus size={11} /> Add choice
                      </button>
                    </div>
                  )}

                  {q.type === "SurveyScale" && (
                    <div className="pl-10 flex items-center gap-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Range</p>
                      <input
                        type="number"
                        value={q.scale?.min ?? 1}
                        onChange={(e) => updateQ(i, { scale: { min: Number(e.target.value), max: q.scale?.max ?? 10 } })}
                        className="w-16 border border-gray-200 rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="number"
                        value={q.scale?.max ?? 10}
                        onChange={(e) => updateQ(i, { scale: { min: q.scale?.min ?? 1, max: Number(e.target.value) } })}
                        className="w-16 border border-gray-200 rounded-md px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  )}

                  {/* Required toggle */}
                  <div className="pl-10 flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.isRequired}
                        onChange={(e) => updateQ(i, { isRequired: e.target.checked })}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      Required
                    </label>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone.bg} ${tone.text}`}>
                      {meta.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gray-50/70 border-t border-gray-100 sticky bottom-0">
            <p className="text-[11px] text-gray-500 hidden sm:block">
              {form.questions.length} {form.questions.length === 1 ? "question" : "questions"}
              {form.isAnonymous ? " · anonymous" : ""}
              {form.startDate && form.endDate ? ` · ${formatDate(form.startDate)} → ${formatDate(form.endDate)}` : ""}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMut.isPending || !form.title.trim() || !form.startDate || !form.endDate || form.questions.some((q) => !q.text.trim())}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#14532d] to-[#16a34a] text-white rounded-lg text-xs font-medium shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={13} />
                {createMut.isPending ? "Creating…" : "Create survey"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!confirmTarget}
        onClose={() => !deleteMut.isPending && setConfirmTarget(null)}
        title="Delete survey?"
        subtitle="This action cannot be undone."
        headerIcon={<Trash2 size={18} />}
        size="sm"
        bodyClassName="p-0"
      >
        <div className="px-5 pt-4 pb-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 ring-1 ring-rose-100">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-900">You're deleting</p>
              <p className="text-xs text-gray-700 mt-0.5 truncate">&ldquo;{confirmTarget?.title}&rdquo;</p>
              <p className="text-[11px] text-gray-500 mt-1.5">
                Responses stay archived but the survey will be hidden from all lists.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-gray-50/70 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setConfirmTarget(null)}
            disabled={deleteMut.isPending}
            className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => confirmTarget && deleteMut.mutate(confirmTarget.id)}
            disabled={deleteMut.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-lg text-xs font-medium shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
          >
            <Trash2 size={13} />
            {deleteMut.isPending ? "Deleting…" : "Delete survey"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
