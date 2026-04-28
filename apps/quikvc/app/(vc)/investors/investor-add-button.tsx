"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InvestorAddButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "lp" as "lp" | "hni" | "angel",
    email: "",
    phone: "",
    accountClass: "",
    notes: "",
    commitmentLakhs: "",
  });

  async function submit() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 1. Create investor
      const r = await fetch("/api/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          email: form.email || undefined,
          phone: form.phone || undefined,
          accountClass: form.accountClass || undefined,
          notes: form.notes || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      // 2. Optionally add a commitment in the same flow
      const commitmentLakhs = parseInt(form.commitmentLakhs);
      if (!Number.isNaN(commitmentLakhs) && commitmentLakhs > 0) {
        await fetch(`/api/investors/${j.data.id}/commitments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountLakhs: commitmentLakhs, type: "one-shot" }),
        });
      }
      setOpen(false);
      setForm({
        name: "", type: "lp", email: "", phone: "", accountClass: "", notes: "", commitmentLakhs: "",
      });
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
        + Add investor
      </button>
    );
  }

  return (
    <div className="absolute right-6 top-32 z-20 w-96 bg-white border border-gray-200 rounded-xl p-4 shadow-lg space-y-3">
      <p className="text-sm font-semibold text-gray-900">Add investor</p>
      <input
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          className="text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "lp" | "hni" | "angel" }))}
        >
          <option value="lp">LP</option>
          <option value="hni">HNI</option>
          <option value="angel">Angel</option>
        </select>
        <input
          className="text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          placeholder="Account class"
          value={form.accountClass}
          onChange={(e) => setForm((f) => ({ ...f, accountClass: e.target.value }))}
        />
      </div>
      <input
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Email (optional)"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
      />
      <input
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Phone (optional)"
        value={form.phone}
        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
      />
      <input
        type="number"
        className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        placeholder="Initial commitment (₹ lakhs, optional)"
        value={form.commitmentLakhs}
        onChange={(e) => setForm((f) => ({ ...f, commitmentLakhs: e.target.value }))}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
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
          {submitting ? "Saving…" : "Add"}
        </button>
      </div>
    </div>
  );
}
