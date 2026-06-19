"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Criterion {
  id: string;
  slug: string;
  name: string;
  description: string;
  weight: number;
}

interface VerticalGroup {
  id: string;
  name: string;
  criteria: Criterion[];
}

export default function ScoringCriteriaClient({ verticals }: { verticals: VerticalGroup[] }) {
  const router = useRouter();
  const [activeVerticalId, setActiveVerticalId] = useState(verticals[0]?.id ?? "");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState<number>(20);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = verticals.find((v) => v.id === activeVerticalId);
  const totalWeight = active?.criteria.reduce((s, c) => s + c.weight, 0) ?? 0;

  async function add() {
    if (!activeVerticalId || !name.trim()) return;
    setBusy("add"); setError(null);
    try {
      const r = await fetch("/api/scoring-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verticalId: activeVerticalId,
          name: name.trim(),
          weight,
          description: description.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error); return; }
      setName(""); setDescription(""); setWeight(20);
      router.refresh();
    } finally { setBusy(null); }
  }

  async function patchWeight(id: string, w: number) {
    setBusy(`w-${id}`); setError(null);
    try {
      const r = await fetch(`/api/scoring-criteria/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: w }),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error); return; }
      router.refresh();
    } finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this criterion?")) return;
    setBusy(`del-${id}`); setError(null);
    try {
      const r = await fetch(`/api/scoring-criteria/${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) { setError(j.error); return; }
      router.refresh();
    } finally { setBusy(null); }
  }

  if (verticals.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
        Create verticals first.{" "}
        <a href="/admin/verticals" className="underline">Go to Verticals →</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <nav className="flex flex-wrap gap-2">
        {verticals.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setActiveVerticalId(v.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border",
              activeVerticalId === v.id
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
            )}
          >
            {v.name}
            <span className={cn("ml-1.5 tabular-nums", activeVerticalId === v.id ? "text-slate-300" : "text-gray-400")}>
              {v.criteria.length}
            </span>
          </button>
        ))}
      </nav>

      {active && (
        <>
          <div
            className={cn(
              "px-4 py-2 rounded-lg text-xs",
              totalWeight === 100
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-amber-50 text-amber-700 border border-amber-200",
            )}
          >
            Total weight: <strong>{totalWeight}%</strong> {totalWeight !== 100 && "(should be 100)"}
          </div>

          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Add criterion</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                placeholder="Name (e.g. Market size)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm md:col-span-2"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={weight}
                onChange={(e) => setWeight(parseInt(e.target.value, 10) || 0)}
                placeholder="Weight %"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
              />
              <button
                type="button"
                disabled={busy === "add" || !name.trim()}
                onClick={add}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {busy === "add" ? "Adding…" : "+ Add"}
              </button>
            </div>
            <input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </section>

          {active.criteria.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
              No criteria yet for this vertical.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5 text-left">Criterion</th>
                    <th className="px-5 py-2.5 text-left">Slug</th>
                    <th className="px-5 py-2.5 text-right">Weight %</th>
                    <th className="px-5 py-2.5 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {active.criteria.map((c) => (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{c.name}</p>
                        {c.description && <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500 font-mono">{c.slug}</td>
                      <td className="px-5 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={c.weight}
                          onBlur={(e) => {
                            const w = parseInt(e.target.value, 10);
                            if (!isNaN(w) && w !== c.weight) patchWeight(c.id, w);
                          }}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-right tabular-nums"
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled={busy === `del-${c.id}`}
                          onClick={() => remove(c.id)}
                          className="text-xs text-red-600 hover:underline disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
