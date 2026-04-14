"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, X, Star, ClipboardList } from "lucide-react";
import {
  usePerformanceReviews,
  useIndividualPerformance,
  useCreateReview,
} from "@/lib/hooks/usePerformance";

function scoreColor(score: number | null) {
  if (score === null) return { text: "text-gray-400", bg: "bg-gray-100", label: "—" };
  if (score >= 80) return { text: "text-green-700", bg: "bg-green-100", label: `${score}%` };
  if (score >= 60) return { text: "text-amber-700", bg: "bg-amber-100", label: `${score}%` };
  return { text: "text-red-700", bg: "bg-red-100", label: `${score}%` };
}

function ScorePill({ score }: { score: number | null }) {
  const c = scoreColor(score);
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text}`}>{c.label}</span>;
}

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-colors"
        >
          <Star className={`h-4 w-4 ${n <= (hover || value) ? "text-amber-400 fill-amber-400" : "text-gray-300"}`} />
        </button>
      ))}
    </div>
  );
}

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

function Skeleton() {
  return (
    <div className="animate-pulse p-6 space-y-3">
      <div className="h-8 bg-gray-200 rounded w-1/3" />
      {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded" />)}
    </div>
  );
}

interface ReviewForm {
  revieweeId: string;
  quarter: string;
  year: number;
  rating: number;
  strengths: string;
  improvements: string;
  notes: string;
  kpiScore: string;
  priorityScore: string;
  attendanceScore: string;
  overallScore: string;
  status: "draft" | "submitted";
}

const DEFAULT_FORM: ReviewForm = {
  revieweeId: "",
  quarter: "Q1",
  year: CURRENT_YEAR,
  rating: 0,
  strengths: "",
  improvements: "",
  notes: "",
  kpiScore: "",
  priorityScore: "",
  attendanceScore: "",
  overallScore: "",
  status: "draft",
};

export default function ReviewsPage() {
  const { data: reviewsData, isLoading: reviewsLoading, error: reviewsError } =
    usePerformanceReviews();
  const { data: usersData } = useIndividualPerformance();
  const createReview = useCreateReview();

  const reviews = useMemo(() => (reviewsData as any[]) ?? [], [reviewsData]);
  const users = useMemo(() => (usersData as any[]) ?? [], [usersData]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ReviewForm>(DEFAULT_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Auto-populate scores when reviewee + quarter + year are selected
  useEffect(() => {
    if (!form.revieweeId) return;
    const person = users.find((u) => u.userId === form.revieweeId);
    if (person) {
      setForm((f) => ({
        ...f,
        kpiScore: person.kpiScore != null ? String(person.kpiScore) : "",
        priorityScore:
          person.priorityScore != null ? String(person.priorityScore) : "",
        attendanceScore:
          person.attendanceScore != null ? String(person.attendanceScore) : "",
        overallScore:
          person.overallScore != null ? String(person.overallScore) : "",
      }));
    }
  }, [form.revieweeId, users]);

  const handleSubmit = async (status: "draft" | "submitted") => {
    if (!form.revieweeId) {
      setSaveError("Please select an employee");
      return;
    }
    setSaveError(null);
    try {
      const result = await createReview.mutateAsync({ ...form, status });
      if (result?.success) {
        setShowModal(false);
        setForm(DEFAULT_FORM);
      } else {
        setSaveError(result?.error ?? "Failed to create review");
      }
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to create review");
    }
  };

  const saving = createReview.isPending;

  if (reviewsLoading) return <Skeleton />;
  if (reviewsError)
    return (
      <div className="p-6 text-xs text-red-600">
        Error: {(reviewsError as Error).message}
      </div>
    );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Performance Reviews</h1>
          <p className="text-xs text-gray-500 mt-0.5">Quarterly review management</p>
        </div>
        <button
          onClick={() => { setForm(DEFAULT_FORM); setSaveError(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-600 hover:bg-accent-700 text-white text-xs font-medium rounded-md transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />New Review
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <ClipboardList className="h-8 w-8 mb-2" />
            <p className="text-xs">No reviews yet. Create one to get started.</p>
          </div>
        ) : (
          <table className="border-separate border-spacing-0 text-xs w-full">
            <thead className="sticky top-0 z-30 bg-accent-50">
              <tr>
                {["Reviewee", "Quarter", "Year", "Reviewer", "KPI Score", "Priority Score", "Overall Score", "Rating", "Status"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-r border-gray-200 bg-accent-50 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 font-medium text-gray-800">
                    {r.reviewee?.firstName} {r.reviewee?.lastName}
                  </td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{r.quarter}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{r.year}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-500">{r.reviewer?.firstName} {r.reviewer?.lastName}</td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100"><ScorePill score={r.kpiScore} /></td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100"><ScorePill score={r.priorityScore} /></td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100"><ScorePill score={r.overallScore} /></td>
                  <td className="px-3 py-2.5 border-b border-r border-gray-100 text-amber-500">
                    {r.rating ? "★".repeat(r.rating) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 border-b border-gray-100">
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${r.status === "submitted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Review Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex">
          {/* Overlay */}
          <div className="flex-1 bg-black/40" onClick={() => setShowModal(false)} />
          {/* Slide-over */}
          <div className="w-full max-w-md bg-white shadow-xl flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">New Performance Review</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded transition-colors">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Employee */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Employee *</label>
                <select
                  value={form.revieweeId}
                  onChange={e => setForm(f => ({ ...f, revieweeId: e.target.value }))}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500"
                >
                  <option value="">Select employee…</option>
                  {users.map(u => (
                    <option key={u.userId} value={u.userId}>{u.firstName} {u.lastName} ({u.email})</option>
                  ))}
                </select>
              </div>

              {/* Quarter + Year */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quarter</label>
                  <select
                    value={form.quarter}
                    onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))}
                    className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                  <select
                    value={form.year}
                    onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Auto-populated scores */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Scores (auto-populated, editable)</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["kpiScore", "priorityScore", "attendanceScore", "overallScore"] as const).map(field => (
                    <div key={field}>
                      <label className="block text-[11px] text-gray-500 mb-1">
                        {field === "kpiScore" ? "KPI Score %" : field === "priorityScore" ? "Priority Score %" : field === "attendanceScore" ? "Attendance %" : "Overall Score %"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={form[field]}
                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                        className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500"
                        placeholder="0-100"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Rating</label>
                <StarRating value={form.rating} onChange={n => setForm(f => ({ ...f, rating: n }))} />
              </div>

              {/* Strengths */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Strengths</label>
                <textarea
                  value={form.strengths}
                  onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))}
                  rows={3}
                  placeholder="What did this person do well?"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500 resize-none"
                />
              </div>

              {/* Improvements */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Areas for Improvement</label>
                <textarea
                  value={form.improvements}
                  onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))}
                  rows={3}
                  placeholder="What could be improved?"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500 resize-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Additional Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any other notes…"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500 resize-none"
                />
              </div>

              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit("draft")}
                disabled={saving}
                className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Draft"}
              </button>
              <button
                onClick={() => handleSubmit("submitted")}
                disabled={saving}
                className="px-3 py-1.5 text-xs bg-accent-600 hover:bg-accent-700 text-white rounded-md transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Submit Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
