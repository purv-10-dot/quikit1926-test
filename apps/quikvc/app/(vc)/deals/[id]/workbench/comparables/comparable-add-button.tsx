"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ComparableAddButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", sector: "", reason: "", link: "" });

  async function submit() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/comparables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, ...form, link: form.link || undefined }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      setOpen(false);
      setForm({ name: "", sector: "", reason: "", link: "" });
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
        + Add comparable
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 w-96 shadow-lg space-y-3 absolute right-6 top-32 z-20">
      <p className="text-sm font-semibold text-gray-900">Add comparable company</p>
      <input
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Company name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
      />
      <input
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Sector (e.g., FinTech)"
        value={form.sector}
        onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
      />
      <textarea
        rows={2}
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Why is this comp relevant?"
        value={form.reason}
        onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
      />
      <input
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Link (optional)"
        value={form.link}
        onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
      />
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
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
