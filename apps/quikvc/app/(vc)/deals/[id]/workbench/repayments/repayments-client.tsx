"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Allocation {
  investorId: string;
  investorName: string;
  amountLakhs: number;
}

interface Payment {
  id: string;
  amountLakhs: number;
  paidAt: string;
  category: string;
  reference: string | null;
}

interface Schedule {
  id: string;
  type: string;
  status: string;
  investorId: string;
  investorName: string;
  totalExpectedLakhs: number;
  totalPaidLakhs: number;
  payments: Payment[];
}

export default function RepaymentsClient({
  dealId,
  defaultLoanType,
  defaultTenureMonths,
  schedules,
  allocationsWithoutSchedule,
  canManage,
}: {
  dealId: string;
  defaultLoanType: string;
  defaultTenureMonths: number;
  schedules: Schedule[];
  allocationsWithoutSchedule: Allocation[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New schedule form
  const [newInvestorId, setNewInvestorId] = useState(allocationsWithoutSchedule[0]?.investorId ?? "");
  const [type, setType] = useState<"emi" | "rbf" | "equity-exit">(
    defaultLoanType === "rbf" ? "rbf" : defaultLoanType === "convertible" ? "equity-exit" : "emi",
  );
  const [interestPct, setInterestPct] = useState(12);
  const [tenureMonths, setTenureMonths] = useState(defaultTenureMonths);
  const [multiple, setMultiple] = useState(1.5);

  async function createSchedule() {
    setBusy("create");
    setError(null);
    try {
      const body: Record<string, unknown> = { dealId, investorId: newInvestorId, type };
      if (type === "emi") {
        body.annualInterestPct = interestPct;
        body.tenureMonths = tenureMonths;
      } else if (type === "rbf") {
        body.multiple = multiple;
      }
      const r = await fetch("/api/repayment-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function recordPayment(scheduleId: string) {
    const amountStr = prompt("Payment amount (in ₹ Lakhs)?");
    if (!amountStr) return;
    const amountLakhs = parseFloat(amountStr);
    if (!isFinite(amountLakhs) || amountLakhs <= 0) {
      setError("Invalid amount");
      return;
    }
    const reference = prompt("Bank UTR / reference (optional)?") ?? undefined;
    setBusy(`pay-${scheduleId}`);
    setError(null);
    try {
      const r = await fetch("/api/repayment-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId, amountLakhs, reference }),
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

  return (
    <div className="space-y-5">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {canManage && allocationsWithoutSchedule.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Create schedule</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs">
              <span className="text-gray-500">Investor</span>
              <select
                value={newInvestorId}
                onChange={(e) => setNewInvestorId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {allocationsWithoutSchedule.map((a) => (
                  <option key={a.investorId} value={a.investorId}>
                    {a.investorName} (₹{a.amountLakhs}L)
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-gray-500">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="emi">EMI (term loan)</option>
                <option value="rbf">RBF (revenue-based)</option>
                <option value="equity-exit">Equity exit</option>
              </select>
            </label>
            {type === "emi" && (
              <>
                <label className="text-xs">
                  <span className="text-gray-500">Interest % p.a.</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={interestPct}
                    onChange={(e) => setInterestPct(parseFloat(e.target.value))}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                  />
                </label>
                <label className="text-xs">
                  <span className="text-gray-500">Tenure (months)</span>
                  <input
                    type="number"
                    min={1}
                    value={tenureMonths}
                    onChange={(e) => setTenureMonths(parseInt(e.target.value, 10))}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                  />
                </label>
              </>
            )}
            {type === "rbf" && (
              <label className="text-xs">
                <span className="text-gray-500">Target multiple</span>
                <input
                  type="number"
                  min={1}
                  step={0.1}
                  value={multiple}
                  onChange={(e) => setMultiple(parseFloat(e.target.value))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm tabular-nums"
                />
              </label>
            )}
          </div>
          <button
            type="button"
            disabled={busy === "create" || !newInvestorId}
            onClick={createSchedule}
            className="text-sm px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "create" ? "Creating…" : "Create schedule"}
          </button>
        </section>
      )}

      {schedules.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No repayment schedules yet.</p>
        </div>
      ) : (
        <section className="space-y-3">
          {schedules.map((s) => {
            const pct = s.totalExpectedLakhs > 0
              ? Math.min(100, Math.round((s.totalPaidLakhs / s.totalExpectedLakhs) * 100))
              : 0;
            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.investorName}</p>
                    <div className="flex gap-2 mt-1 items-center">
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {s.type}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded",
                          s.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : s.status === "defaulted"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700",
                        )}
                      >
                        {s.status}
                      </span>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      disabled={busy === `pay-${s.id}` || s.status === "completed"}
                      onClick={() => recordPayment(s.id)}
                      className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40"
                    >
                      {busy === `pay-${s.id}` ? "Saving…" : "+ Record payment"}
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <Stat label="Expected" value={`₹${s.totalExpectedLakhs.toLocaleString("en-IN")}L`} />
                  <Stat label="Received" value={`₹${s.totalPaidLakhs.toLocaleString("en-IN")}L`} tone="success" />
                  <Stat label="Outstanding" value={`₹${(s.totalExpectedLakhs - s.totalPaidLakhs).toLocaleString("en-IN")}L`} tone="warning" />
                </div>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all", pct >= 100 ? "bg-green-500" : "bg-blue-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {s.payments.length > 0 && (
                  <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                    {s.payments.map((p) => (
                      <li key={p.id} className="py-2 flex items-center justify-between text-xs">
                        <span className="text-gray-700">
                          {new Date(p.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          {" · "}
                          <span className="text-gray-500">{p.category}</span>
                          {p.reference && <span className="text-gray-400 ml-1">· {p.reference}</span>}
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

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={cn(
          "text-base font-semibold tabular-nums mt-0.5",
          tone === "success" ? "text-green-600" : tone === "warning" ? "text-amber-600" : "text-gray-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
