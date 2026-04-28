"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InvestorOption {
  id: string;
  name: string;
  type: string;
  availableLakhs: number;
}

export default function AllocateForm({
  dealId,
  gapLakhs,
  investors,
}: {
  dealId: string;
  gapLakhs: number;
  investors: InvestorOption[];
}) {
  const router = useRouter();
  const [investorId, setInvestorId] = useState(investors[0]?.id ?? "");
  const [amountLakhs, setAmountLakhs] = useState<string>(String(gapLakhs));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = investors.find((i) => i.id === investorId);

  async function submit() {
    const amt = Number(amountLakhs);
    if (!Number.isInteger(amt) || amt <= 0) {
      setError("Amount must be a positive integer (lakhs)");
      return;
    }
    if (selected && amt > selected.availableLakhs) {
      setError(`Selected investor has only ₹${selected.availableLakhs}L available`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, investorId, amountLakhs: amt }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Allocation failed");
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Allocate from investor pool</h3>
      <div className="grid grid-cols-2 gap-3">
        <select
          className="text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={investorId}
          onChange={(e) => setInvestorId(e.target.value)}
        >
          {investors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · {i.type.toUpperCase()} · ₹{i.availableLakhs.toLocaleString("en-IN")}L available
            </option>
          ))}
        </select>
        <div className="relative">
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-12"
            placeholder="Amount"
            value={amountLakhs}
            onChange={(e) => setAmountLakhs(e.target.value)}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">L</span>
        </div>
      </div>
      {selected && (
        <p className="text-xs text-gray-500">
          Maximum: ₹{Math.min(selected.availableLakhs, gapLakhs).toLocaleString("en-IN")}L
          (gap is ₹{gapLakhs.toLocaleString("en-IN")}L; investor has ₹{selected.availableLakhs.toLocaleString("en-IN")}L available)
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={submitting || !investorId}
          onClick={submit}
          className="text-sm px-4 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Allocating…" : "Confirm allocation"}
        </button>
      </div>
    </section>
  );
}
