"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STAGE_LABEL, type StageId } from "@/lib/pipeline";

/**
 * Advance-stage button. Confirms with optional justification, POSTs to
 * /api/deals/[id]/advance, refreshes the page on success.
 */
export default function AdvanceButton({
  dealId,
  currentStage,
  nextStage,
}: {
  dealId: string;
  currentStage: StageId;
  nextStage: StageId | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    if (!nextStage) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/deals/${dealId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStage: nextStage,
          justification: justification.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Advance failed");
        return;
      }
      setConfirming(false);
      setJustification("");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!nextStage) {
    return (
      <span className="text-xs px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed">
        Final stage
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
      >
        Advance to {STAGE_LABEL[nextStage]} →
      </button>
    );
  }

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-3 w-72 shadow-lg space-y-2 absolute right-0 top-full mt-1 z-10">
      <p className="text-xs text-gray-700">
        Move from <strong>{STAGE_LABEL[currentStage]}</strong> →{" "}
        <strong>{STAGE_LABEL[nextStage]}</strong>?
      </p>
      <textarea
        rows={2}
        placeholder="Justification (optional)"
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs px-2.5 py-1 text-gray-600 hover:bg-gray-100 rounded"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={advance}
          className="text-xs px-2.5 py-1 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Advancing…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
