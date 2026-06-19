"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RiskAddButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    severity: "amber" as "red" | "amber" | "green",
    title: "",
    description: "",
    mitigation: "",
  });

  async function submit() {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, ...form }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      setOpen(false);
      setForm({ severity: "amber", title: "", description: "", mitigation: "" });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
      >
        + Add risk
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 w-96 shadow-lg space-y-3 absolute right-6 top-32 z-20">
      <p className="text-sm font-semibold text-gray-900">Add risk</p>
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Severity</label>
        <div className="flex gap-2">
          {(["red", "amber", "green"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setForm((f) => ({ ...f, severity: s }))}
              className={`flex-1 text-xs px-2 py-1.5 rounded-lg border ${
                form.severity === s
                  ? s === "red"
                    ? "bg-red-100 text-red-700 border-red-300"
                    : s === "amber"
                      ? "bg-amber-100 text-amber-700 border-amber-300"
                      : "bg-green-100 text-green-700 border-green-300"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Title</label>
        <input
          className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Concentration risk in top 2 customers"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Description (optional)</label>
        <textarea
          rows={2}
          className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 block">Mitigation (optional)</label>
        <textarea
          rows={2}
          className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={form.mitigation}
          onChange={(e) => setForm((f) => ({ ...f, mitigation: e.target.value }))}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add risk"}
        </button>
      </div>
    </div>
  );
}
