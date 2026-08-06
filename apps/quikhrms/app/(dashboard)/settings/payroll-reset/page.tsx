"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { PageBackground } from "@/components/hrms/page-background";
import { RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert, Mail } from "lucide-react";

/** 5–7 char alphanumeric confirm string, regenerated fresh on every page load. */
function generateConfirmCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const length = 5 + Math.floor(Math.random() * 3); // 5, 6 or 7
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function PayrollResetPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const [confirmCode] = useState(generateConfirmCode);
  const [confirmText, setConfirmText] = useState("");
  const [step, setStep] = useState<"confirm" | "otp">("confirm");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const requestOtpMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/payroll/setup/reset/request-otp", {}),
    onSuccess: () => {
      setErr(null);
      setStep("otp");
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e instanceof ApiError ? e.message : e.message),
  });

  const resetMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/payroll/setup/reset", { otp: otp.trim() }),
    onSuccess: () => {
      qc.invalidateQueries();
      setDone(true);
      setErr(null);
      setTimeout(() => router.push("/payroll/setup"), 1500);
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => {
      setErr(e instanceof ApiError ? e.message : e.message);
    },
  });

  const canConfirm = confirmText.trim().toUpperCase() === confirmCode;
  const canReset = /^\d{4}$/.test(otp.trim());

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-red-100 bg-gradient-to-r from-red-50 to-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Reset Payroll Setup</h1>
            <p className="text-xs text-gray-500">Danger zone &middot; destructive action</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">This permanently deletes all payroll data for this tenant.</p>
              <p className="mt-1 text-xs text-amber-800">The walkthrough restarts from 0/7. There is no undo — back up first if needed.</p>
            </div>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-gray-800 mb-2">The following data will be wiped:</p>
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

          {step === "confirm" ? (
            <div className="pt-2 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Type <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-red-600">{confirmCode}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmCode}
                disabled={requestOtpMut.isPending}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-50 font-mono uppercase"
              />
            </div>
          ) : (
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-2">
                <Mail size={14} className="shrink-0" />
                A 4-digit verification code was emailed to you and every admin. Valid for 10 minutes.
              </div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Enter verification code</label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                disabled={resetMut.isPending || done}
                className="w-full px-3 py-2 text-sm tracking-[0.5em] text-center border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-50 font-mono"
              />
              <button
                type="button"
                disabled={requestOtpMut.isPending}
                onClick={() => requestOtpMut.mutate()}
                className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          )}

          {err && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
              {err}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              <CheckCircle2 size={16} /> Payroll setup reset. Redirecting to walkthrough...
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <Link
              href="/settings"
              className="px-3 py-1.5 text-xs border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md font-medium"
            >
              Cancel
            </Link>
            {step === "confirm" ? (
              <button
                type="button"
                disabled={!canConfirm || requestOtpMut.isPending}
                onClick={() => requestOtpMut.mutate()}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium shadow-sm"
              >
                <RotateCcw size={13} /> {requestOtpMut.isPending ? "Sending code..." : "Send Verification Code"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!canReset || resetMut.isPending || done}
                onClick={() => resetMut.mutate()}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium shadow-sm"
              >
                <RotateCcw size={13} /> {resetMut.isPending ? "Resetting..." : "Reset Everything"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
