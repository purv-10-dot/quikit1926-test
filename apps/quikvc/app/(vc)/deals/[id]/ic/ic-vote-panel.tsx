"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface VoteRow {
  voterId: string;
  voterName: string;
  decision: string;
  rationale: string | null;
  conditions: string | null;
}

const DECISION_BADGE: Record<string, string> = {
  approve: "bg-green-100 text-green-700 border-green-200",
  "conditional-approve": "bg-amber-100 text-amber-700 border-amber-200",
  reject: "bg-red-100 text-red-700 border-red-200",
  abstain: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function ICVotePanel({
  memoId,
  myVote,
  allVotes,
  mode,
  quorum,
  threshold,
  canSettle,
  canVote,
}: {
  memoId: string;
  myVote: VoteRow | null;
  allVotes: VoteRow[];
  mode: string;
  quorum: number;
  threshold: string;
  canSettle: boolean;
  canVote: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState(myVote?.decision ?? "");
  const [rationale, setRationale] = useState(myVote?.rationale ?? "");
  const [conditions, setConditions] = useState(myVote?.conditions ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function castVote() {
    if (!decision) {
      setError("Pick a decision");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/ic-votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoId,
          decision,
          rationale: rationale.trim() || undefined,
          conditions: decision === "conditional-approve" ? conditions.trim() || undefined : undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Vote failed");
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function settle() {
    if (!confirm("Close voting and apply the decision to the deal?")) return;
    setSettling(true);
    setError(null);
    try {
      const r = await fetch("/api/ic-votes/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoId }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Settle failed");
        return;
      }
      router.refresh();
    } finally {
      setSettling(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-gray-400">Voting</p>
        <p className="text-xs text-gray-500 mt-1">
          Mode: <strong className="text-gray-700">{mode}</strong>
          {mode === "multi" && (
            <>
              {" · "}quorum {quorum} · {threshold}
            </>
          )}
        </p>
      </header>

      {/* Cast vote — IC voters only */}
      {!canVote ? (
        <section className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">
            Read-only view. Only IC members and partners can cast votes.
          </p>
        </section>
      ) : (
      <section className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-900">Your vote</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["approve", "conditional-approve", "reject", "abstain"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDecision(d)}
              className={cn(
                "text-[10px] uppercase tracking-wider px-2 py-1.5 rounded border",
                decision === d
                  ? DECISION_BADGE[d]
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
              )}
            >
              {d.replace("-", " ")}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          placeholder="Rationale (optional)"
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
        />
        {decision === "conditional-approve" && (
          <textarea
            rows={2}
            placeholder="Conditions to satisfy"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
          />
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <button
          type="button"
          disabled={submitting}
          onClick={castVote}
          className="w-full text-xs px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : myVote ? "Update vote" : "Cast vote"}
        </button>
      </section>
      )}

      {/* All votes */}
      <section>
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
          Votes cast ({allVotes.length})
        </p>
        {allVotes.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No votes yet.</p>
        ) : (
          <ul className="space-y-2">
            {allVotes.map((v) => (
              <li
                key={v.voterId}
                className="bg-white border border-gray-200 rounded-lg p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-900 truncate">{v.voterName}</p>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
                      DECISION_BADGE[v.decision] ?? "bg-gray-100",
                    )}
                  >
                    {v.decision.replace("-", " ")}
                  </span>
                </div>
                {v.rationale && <p className="text-[11px] text-gray-600 mt-1">{v.rationale}</p>}
                {v.conditions && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-1 rounded mt-1">
                    Conditions: {v.conditions}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Settle — partner only */}
      {canSettle && (
        <section className="bg-white border border-amber-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-amber-900">Close voting</p>
          <p className="text-[11px] text-amber-700 mt-1">
            Apply the IC decision to the deal. Approved → due-diligence; rejected → closed-lost.
          </p>
          <button
            type="button"
            disabled={settling || allVotes.length === 0}
            onClick={settle}
            className="mt-2 w-full text-xs px-3 py-1.5 border border-amber-300 text-amber-700 hover:bg-amber-50 rounded disabled:opacity-40"
          >
            {settling ? "Settling…" : "Settle decision"}
          </button>
        </section>
      )}
    </div>
  );
}
