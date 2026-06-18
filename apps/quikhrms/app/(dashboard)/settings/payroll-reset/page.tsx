"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { ChevronLeft, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

export default function PayrollResetPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const resetMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/payroll/setup/reset", {}),
    onSuccess: () => {
      qc.invalidateQueries();
      setDone(true);
      setErr(null);
      setTimeout(() => router.push("/payroll/setup"), 1500);
    },
    onError: (e: Error) => {
      setErr(e instanceof ApiError ? e.message : e.message);
    },
  });

  const canReset = confirmText.trim().toUpperCase() === "RESET";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6]">
        <ChevronLeft size={14} /> Back to Settings
      </Link>

      <div className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-red-100 bg-gradient-to-r from-red-50 to-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Reset Payroll Setup</h1>
            <p className="text-xs text-gray-500">Danger zone &middot; destructive action</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">This permanently deletes all payroll data for this tenant.</p>
              <p className="mt-1 text-xs text-amber-800">The walkthrough restarts from 0/7. There is no undo — back up first if needed.</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">The following data will be wiped:</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-gray-700">
              {[
                "Pay runs & payslips",
                "Tax details",
                "Pay schedule",
                "Statutory configs (EPF, ESI, PT, LWF, Bonus)",
                "Salary components & structures",
                "Employee salaries",
                "Prior payroll data",
                "Company address / CIN / GSTIN",
              ].map((label) => (
                <li key={label} className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Type <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-red-600">RESET</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              disabled={resetMut.isPending || done}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-50 font-mono uppercase"
            />
          </div>

          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
              {err}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              <CheckCircle2 size={16} /> Payroll setup reset. Redirecting to walkthrough...
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Link
              href="/settings"
              className="px-4 py-2 text-sm border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md font-medium"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={!canReset || resetMut.isPending || done}
              onClick={() => resetMut.mutate()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm font-semibold shadow-sm"
            >
              <RotateCcw size={14} /> {resetMut.isPending ? "Resetting..." : "Reset Everything"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
