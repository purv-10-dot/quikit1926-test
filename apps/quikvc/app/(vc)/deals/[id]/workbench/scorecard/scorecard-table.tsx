"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface ScoreRow {
  criterionSlug: string;
  criterionName: string;
  description: string | null;
  weight: number;
  aiScore: number | null;
  analystScore: number | null;
  overrideReason: string | null;
}

export default function ScorecardTable({
  dealId,
  rows: initialRows,
}: {
  dealId: string;
  rows: ScoreRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ScoreRow[]>(initialRows);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState<string>("");
  const [draftReason, setDraftReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(r: ScoreRow) {
    setEditing(r.criterionSlug);
    setDraftScore(r.analystScore?.toString() ?? "");
    setDraftReason(r.overrideReason ?? "");
    setError(null);
  }

  async function submit(slug: string) {
    const num = draftScore === "" ? null : Number(draftScore);
    if (num != null && (Number.isNaN(num) || num < 0 || num > 100)) {
      setError("Score must be 0-100");
      return;
    }
    if (num != null && !draftReason.trim()) {
      setError("Justification required for override");
      return;
    }
    setSubmitting(slug);
    setError(null);
    try {
      const r = await fetch("/api/scores/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          criterionSlug: slug,
          analystScore: num,
          reason: num == null ? undefined : draftReason.trim(),
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Save failed");
        return;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.criterionSlug === slug
            ? {
                ...row,
                analystScore: num,
                overrideReason: num == null ? null : draftReason.trim(),
              }
            : row,
        ),
      );
      setEditing(null);
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <>
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left">Criterion</th>
              <th className="px-4 py-2.5 text-center w-16">Weight</th>
              <th className="px-4 py-2.5 text-center w-16">AI</th>
              <th className="px-4 py-2.5 text-center w-20">Analyst</th>
              <th className="px-4 py-2.5 text-left">Override reason</th>
              <th className="px-4 py-2.5 text-right w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editing === r.criterionSlug;
              return (
                <tr key={r.criterionSlug} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.criterionName}</p>
                    {r.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{r.weight}%</td>
                  <td className="px-4 py-3 text-center">
                    {r.aiScore != null ? (
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          r.aiScore >= 80
                            ? "text-green-600"
                            : r.aiScore >= 60
                              ? "text-amber-600"
                              : "text-red-600",
                        )}
                      >
                        {r.aiScore}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        autoFocus
                        className="w-16 text-sm text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={draftScore}
                        onChange={(e) => setDraftScore(e.target.value)}
                      />
                    ) : r.analystScore != null ? (
                      <span className="text-sm font-semibold text-blue-600 tabular-nums">
                        {r.analystScore}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <textarea
                        rows={2}
                        placeholder="Why override?"
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={draftReason}
                        onChange={(e) => setDraftReason(e.target.value)}
                      />
                    ) : (
                      <span className="text-xs text-gray-600">
                        {r.overrideReason ?? <span className="text-gray-300">—</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => submit(r.criterionSlug)}
                          disabled={submitting === r.criterionSlug}
                          className="text-[11px] px-2 py-1 bg-slate-900 text-white rounded disabled:opacity-50"
                        >
                          {submitting === r.criterionSlug ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="text-[11px] px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="text-[11px] px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        {r.analystScore != null ? "Edit" : "Override"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
