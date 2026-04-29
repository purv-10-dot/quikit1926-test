"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Allocation {
  id: string;
  investorId: string;
  investorName: string;
  amountLakhs: number;
}

interface Payment {
  id: string;
  amountLakhs: number;
  paidAt: string;
  reference: string | null;
}

interface CapitalCall {
  id: string;
  investorId: string;
  investorName: string;
  allocationId: string | null;
  amountLakhs: number;
  paidLakhs: number;
  dueDate: string;
  status: string;
  paidAt: string | null;
  notes: string | null;
  payments: Payment[];
}

const STATUS_BADGE: Record<string, string> = {
  issued:    "bg-blue-100 text-blue-700",
  partial:   "bg-amber-100 text-amber-700",
  paid:      "bg-green-100 text-green-700",
  overdue:   "bg-red-100 text-red-700",
  defaulted: "bg-red-200 text-red-800",
};

export default function CapitalCallsClient({
  dealId,
  startupName,
  allocations,
  calls,
  canManage,
  viewerRole,
}: {
  dealId: string;
  startupName: string;
  allocations: Allocation[];
  calls: CapitalCall[];
  canManage: boolean;
  viewerRole: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Issue-call form state
  const [allocId, setAllocId] = useState(allocations[0]?.id ?? "");
  const [amountLakhs, setAmountLakhs] = useState<number>(0);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");

  const selectedAlloc = allocations.find((a) => a.id === allocId);

  // Default amount to allocation amount when picker changes
  if (selectedAlloc && amountLakhs === 0) {
    setAmountLakhs(selectedAlloc.amountLakhs);
  }

  async function issueCall() {
    if (!selectedAlloc) {
      setError("Pick an allocation");
      return;
    }
    if (amountLakhs <= 0) {
      setError("Amount must be positive");
      return;
    }
    setBusy("issue");
    setError(null);
    try {
      const r = await fetch("/api/capital-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: selectedAlloc.investorId,
          allocationId: selectedAlloc.id,
          dealId,
          amountLakhs,
          dueDate,
          notes: notes.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      setNotes("");
      setAmountLakhs(0);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function recordPayment(callId: string, callRemainingLakhs: number) {
    const amountStr = prompt(`Payment amount (₹L)? Outstanding: ₹${callRemainingLakhs}L`);
    if (!amountStr) return;
    const amt = parseFloat(amountStr);
    if (!isFinite(amt) || amt <= 0) {
      setError("Invalid amount");
      return;
    }
    const reference = prompt("Bank UTR / reference (optional)?") ?? undefined;
    setBusy(`pay-${callId}`);
    setError(null);
    try {
      const r = await fetch(`/api/capital-calls/${callId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountLakhs: amt, reference }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // Roll-up totals for the header summary
  const totalCalled = calls.reduce((s, c) => s + c.amountLakhs, 0);
  const totalPaid = calls.reduce((s, c) => s + c.paidLakhs, 0);
  const totalOutstanding = totalCalled - totalPaid;

  return (
    <div className="space-y-5">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Roll-up */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 grid grid-cols-3 gap-4">
        <Stat label="Called" value={`₹${totalCalled.toLocaleString("en-IN")}L`} />
        <Stat label="Paid" value={`₹${totalPaid.toLocaleString("en-IN")}L`} tone="success" />
        <Stat
          label="Outstanding"
          value={`₹${totalOutstanding.toLocaleString("en-IN")}L`}
          tone={totalOutstanding > 0 ? "warning" : "success"}
        />
      </section>

      {/* Issue new call — capital-ops roles only */}
      {canManage ? (
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Issue capital call</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-xs">
              <span className="text-gray-500">Allocation</span>
              <select
                value={allocId}
                onChange={(e) => {
                  setAllocId(e.target.value);
                  const a = allocations.find((al) => al.id === e.target.value);
                  if (a) setAmountLakhs(a.amountLakhs);
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {allocations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.investorName} (₹{a.amountLakhs}L)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-gray-500">Amount (₹L)</span>
              <input
                type="number"
                min={1}
                value={amountLakhs}
                onChange={(e) => setAmountLakhs(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
              />
            </label>
            <label className="text-xs">
              <span className="text-gray-500">Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy === "issue"}
              onClick={issueCall}
              className="self-end px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === "issue" ? "Issuing…" : "Issue call"}
            </button>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional — visible to investor)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </section>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-600">
          Read-only view. Issuing capital calls is restricted to Partners and Fund
          Admins (your role: {viewerRole}).
        </div>
      )}

      {/* Calls list */}
      {calls.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No capital calls issued yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Issue a call against an allocation to draw down funds for {startupName}.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          {calls.map((c) => {
            const remaining = c.amountLakhs - c.paidLakhs;
            const pct =
              c.amountLakhs > 0
                ? Math.min(100, Math.round((c.paidLakhs / c.amountLakhs) * 100))
                : 0;
            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{c.investorName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full",
                          STATUS_BADGE[c.status] ?? "bg-gray-100 text-gray-600",
                        )}
                      >
                        {c.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        Due{" "}
                        {new Date(c.dueDate).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  {canManage && c.status !== "paid" && (
                    <button
                      type="button"
                      disabled={busy === `pay-${c.id}`}
                      onClick={() => recordPayment(c.id, remaining)}
                      className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40"
                    >
                      {busy === `pay-${c.id}` ? "Saving…" : "+ Record payment"}
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <Stat label="Called" value={`₹${c.amountLakhs.toLocaleString("en-IN")}L`} />
                  <Stat
                    label="Received"
                    value={`₹${c.paidLakhs.toLocaleString("en-IN")}L`}
                    tone="success"
                  />
                  <Stat
                    label="Outstanding"
                    value={`₹${remaining.toLocaleString("en-IN")}L`}
                    tone={remaining > 0 ? "warning" : "success"}
                  />
                </div>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all", pct >= 100 ? "bg-green-500" : "bg-blue-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {c.notes && (
                  <p className="text-xs text-gray-600 mt-3 bg-gray-50 rounded p-2">{c.notes}</p>
                )}

                {c.payments.length > 0 && (
                  <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                    {c.payments.map((p) => (
                      <li
                        key={p.id}
                        className="py-2 flex items-center justify-between text-xs"
                      >
                        <span className="text-gray-700">
                          {new Date(p.paidAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {p.reference && (
                            <span className="text-gray-400 ml-1">· {p.reference}</span>
                          )}
                        </span>
                        <span className="tabular-nums text-gray-900 font-medium">
                          ₹{p.amountLakhs.toLocaleString("en-IN")}L
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={cn(
          "text-base font-semibold tabular-nums mt-0.5",
          tone === "success"
            ? "text-green-600"
            : tone === "warning"
              ? "text-amber-600"
              : "text-gray-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
