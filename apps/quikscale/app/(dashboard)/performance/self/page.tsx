"use client";

/**
 * Self-Assessment — /performance/self
 *
 * R10c: lets an IC fill in their own view of their quarter before their
 * manager writes the formal review. Uses the existing PerformanceReview
 * model with `status: "self-assessment"` and `revieweeId == session.user.id`
 * to mean "this is my self-assessment".
 *
 * For this MVP, the self-assessment is just an upsert on the existing
 * /api/performance/reviews route with revieweeId === session.user.id
 * (the create API auto-assigns reviewerId to the caller).
 */

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ChevronLeft, Save, CheckCircle2 } from "lucide-react";
import {
  usePerformanceReviews,
  useCreateReview,
} from "@/lib/hooks/usePerformance";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";

interface ReviewRow {
  id: string;
  quarter: string;
  year: number;
  status: string;
  strengths: string | null;
  improvements: string | null;
  notes: string | null;
  rating: number | null;
  revieweeId: string;
  reviewerId: string;
}

export default function SelfAssessmentPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id as string | undefined;
  const quarter = getFiscalQuarter();
  const year = getFiscalYear();

  const { data: reviewsData } = usePerformanceReviews();
  const createReview = useCreateReview();

  const reviews = (reviewsData as ReviewRow[] | undefined) ?? [];
  // Find self-assessment for this quarter (reviewer===reviewee)
  const mySelfAssessment = reviews.find(
    (r) =>
      r.revieweeId === userId &&
      r.reviewerId === userId &&
      r.quarter === quarter &&
      r.year === year,
  );

  const [strengths, setStrengths] = useState(mySelfAssessment?.strengths ?? "");
  const [improvements, setImprovements] = useState(
    mySelfAssessment?.improvements ?? "",
  );
  const [notes, setNotes] = useState(mySelfAssessment?.notes ?? "");
  const [rating, setRating] = useState<number | null>(
    mySelfAssessment?.rating ?? null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function handleSubmit(markComplete = false) {
    if (!userId) return;
    setSaveError(null);
    try {
      await createReview.mutateAsync({
        revieweeId: userId,
        quarter,
        year,
        strengths,
        improvements,
        notes,
        rating,
        status: markComplete ? "self-assessment" : "draft",
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/performance/cycle"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Cycle
        </Link>
        <h1 className="text-base font-semibold text-gray-900">
          Self-Assessment · {quarter} {year}
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Your honest reflection on the quarter — your wins, your blockers, and
          your growth areas. This seeds your manager&apos;s review.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-3xl mx-auto space-y-4">
          {mySelfAssessment && (
            <div className="bg-accent-50 border border-accent-200 rounded-md p-3 text-xs text-accent-700">
              You already have a {mySelfAssessment.status} self-assessment for
              this quarter. Saving here will update it.
            </div>
          )}

          <Section title="Strengths — what went well this quarter?">
            <textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              rows={5}
              placeholder="What did you deliver? What are you proud of? Where did you grow?"
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
            />
          </Section>

          <Section title="Areas for improvement — where could you have done better?">
            <textarea
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              rows={5}
              placeholder="What would you do differently? What skills do you want to develop?"
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
            />
          </Section>

          <Section title="Additional notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything else your manager should know about this quarter?"
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
            />
          </Section>

          <Section title="Self-rating">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`flex-1 py-2 text-xs font-semibold rounded border transition-colors ${
                    rating === n
                      ? "bg-accent-600 text-white border-accent-600"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              1 = below expectations, 3 = met expectations, 5 = exceeded significantly
            </p>
          </Section>

          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
              {saveError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={createReview.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-md disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save draft
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={createReview.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Submit self-assessment
            </button>
          </div>
          {justSaved && (
            <p className="text-xs text-green-600 text-right">Saved ✓</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}
