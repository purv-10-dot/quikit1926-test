"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SuggestedComp {
  name: string;
  sector: string | null;
  reason: string;
  link: string | null;
}

export default function ComparableSuggestButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [comps, setComps] = useState<SuggestedComp[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [isStub, setIsStub] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/comparables/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Suggest failed");
        return;
      }
      setComps(j.data.comps);
      setIsStub(j.data.isStub);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function add(comp: SuggestedComp) {
    setAdding(comp.name);
    try {
      const r = await fetch("/api/comparables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          name: comp.name,
          sector: comp.sector ?? undefined,
          reason: comp.reason,
          link: comp.link ?? undefined,
        }),
      });
      const j = await r.json();
      if (j.success) {
        setComps((prev) => prev.filter((c) => c.name !== comp.name));
        router.refresh();
      }
    } finally {
      setAdding(null);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={suggest}
        className="text-sm px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg disabled:opacity-50"
      >
        {loading ? "Asking Claude…" : "Suggest with AI"}
      </button>

      {open && (
        <div className="absolute right-6 top-32 z-20 w-[28rem] bg-white border border-gray-200 rounded-xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">AI suggestions</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Close
            </button>
          </div>
          {isStub && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              AI stub mode — set ANTHROPIC_API_KEY to enable real suggestions.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {comps.length === 0 ? (
            <p className="text-xs text-gray-400">No more suggestions.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {comps.map((c) => (
                <li key={c.name} className="border border-gray-100 rounded-lg p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      {c.sector && (
                        <p className="text-[10px] text-gray-500">{c.sector}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={adding === c.name}
                      onClick={() => add(c)}
                      className="text-[11px] px-2 py-1 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
                    >
                      {adding === c.name ? "Adding…" : "Add"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-1.5">{c.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
