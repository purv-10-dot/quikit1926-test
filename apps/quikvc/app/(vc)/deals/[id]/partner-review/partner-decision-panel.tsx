"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PartnerDecisionPanel({
  dealId,
  currentStage,
  memoStatus,
  memoVersion,
}: {
  dealId: string;
  currentStage: string;
  memoStatus: string | null;
  memoVersion: number | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function advance(toStage: string, justification: string) {
    setSubmitting(toStage);
    setError(null);
    try {
      const r = await fetch(`/api/deals/${dealId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage, justification }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      // Approved to IC → take partner to the IC screen
      if (toStage === "ic-review") {
        router.push(`/deals/${dealId}/ic`);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  const canApproveToIC = memoStatus === "frozen";

  return (
    <aside className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 sticky top-4">
        <p className="text-xs uppercase tracking-wider text-gray-400">Decision</p>
        <p className="text-xs text-gray-500">
          Current stage: <strong className="text-gray-700">{currentStage}</strong>
        </p>
        <p className="text-xs text-gray-500">
          Memo:{" "}
          <strong className="text-gray-700">
            {memoStatus ? `${memoStatus} · v${memoVersion ?? "?"}` : "Not started"}
          </strong>
        </p>

        {error && (
          <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!canApproveToIC || submitting !== null}
          title={!canApproveToIC ? "Freeze the memo first" : ""}
          onClick={() => advance("ic-review", "Partner approved for IC review")}
          className="w-full text-sm px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting === "ic-review" ? "Routing…" : "✓ Approve to IC"}
        </button>

        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => {
            const reason = prompt("What additional data do you need?");
            if (reason) advance("research", `Partner asked for more data: ${reason}`);
          }}
          className="w-full text-sm px-3 py-2 border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-lg disabled:opacity-40"
        >
          {submitting === "research" ? "Routing…" : "⤺ Ask more data"}
        </button>

        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => {
            const reason = prompt("Reason for rejection?");
            if (reason) advance("final-decision", `Partner rejected: ${reason}`);
          }}
          className="w-full text-sm px-3 py-2 border border-red-300 text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-40"
        >
          {submitting === "final-decision" ? "Routing…" : "✗ Reject"}
        </button>
      </div>
    </aside>
  );
}
