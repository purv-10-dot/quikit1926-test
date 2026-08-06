"use client";

/**
 * Edit Material Estimation — loads the row by id and feeds it to the
 * shared full-page EstimationForm (mirrors the Work Order edit page).
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import { PageContainer } from "@/components/PageShell";
import { ShimmerBlock } from "@/components/Shimmer";
import { useEstimation } from "@/hooks/use-projects";
import { EstimationForm } from "../../EstimationForm";

export default function EditEstimationPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const { data: estimation, isLoading, isError } = useEstimation(id);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="space-y-2">
            <ShimmerBlock className="h-3 w-48" />
            <ShimmerBlock className="h-7 w-72" />
            <ShimmerBlock className="h-4 w-56" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <ShimmerBlock className="h-3 w-24" />
                  <ShimmerBlock className="h-9 w-full" />
                </div>
              ))}
            </div>
            <ShimmerBlock className="h-px w-full" />
            <ShimmerBlock className="h-5 w-40" />
            <div className="space-y-2">
              {[0, 1, 2].map((r) => (
                <ShimmerBlock key={r} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (isError || !estimation) {
    return (
      <PageContainer>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">Failed to load estimation</div>
            <div className="text-xs mt-1 opacity-80">
              The estimation may have been deleted.
            </div>
            <Link
              href="/projects/estimation"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              <ArrowLeft className="w-3 h-3" /> Back to Material Estimation
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Deep-link guard. The Edit affordances are already disabled once the
  // row leaves draft, but the edit URL is guessable — and PUT answers
  // these statuses with a 409, so rendering the form would only let the
  // user type a change that cannot be saved.
  const status = String(estimation.status ?? "").trim().toLowerCase();
  const lockReason =
    status === "pending_approval" || status === "submitted"
      ? "This estimation is awaiting approval. It stays locked until an approver approves or rejects it."
      : status === "approved"
        ? "This estimation is approved and locked — it is the baseline downstream procurement reads."
        : status === "inactive"
          ? "This estimation has been deleted."
          : null;

  if (lockReason) {
    return (
      <PageContainer>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-900 flex items-start gap-3">
          <Lock className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">Editing is locked</div>
            <div className="text-xs mt-1 opacity-90">{lockReason}</div>
            <Link
              href={`/projects/estimation/${id}`}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              <ArrowLeft className="w-3 h-3" /> View estimation
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  return <EstimationForm editData={estimation} />;
}
