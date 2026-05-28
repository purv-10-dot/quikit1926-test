"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  Eye, EyeOff, HardHat, Lock, CheckCircle2,
  ShieldCheck, Building2, Users, ArrowRight,
} from "lucide-react";

/**
 * /reset-password
 *
 * Forced when `session.user.mustChangePassword === true` (middleware.ts).
 * The user picks a new password that satisfies the policy and we POST to
 * /api/account/reset-password. On success we sign them out — the existing
 * JWT still says `mustChangePassword: true`, so the cleanest way to reflect
 * the new DB state is a fresh login with the new password.
 *
 * UI mirrors /login: hero panel on the left, form panel on the right.
 */

// Same hero image the login page uses — keeps the visual language
// consistent across the unauthenticated flow.
const HERO_URL =
  "https://images.unsplash.com/photo-1581094794329-c8112a89af12?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80";

export default function ResetPasswordPage() {
  const { data: session } = useSession();
  const [newPassword, setNewP] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Live policy hints (mirrors validatePolicy() in the API).
  const lenOk = newPassword.length >= 8;
  const upperOk = /[A-Z]/.test(newPassword);
  const digitOk = /[0-9]/.test(newPassword);
  const policyOk = lenOk && upperOk && digitOk;
  const matchOk = newPassword !== "" && newPassword === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!policyOk) {
      setError("Password must be at least 8 characters with one uppercase letter and one digit.");
      return;
    }
    if (!matchOk) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Reset failed. Please try again.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      // signOut clears the next-auth cookie. We forward the user's email
      // through the callbackUrl so /login can pre-fill it — they only
      // need to type the new password to sign in again.
      const email = session?.user?.email ?? "";
      const callbackUrl = email
        ? `/login?email=${encodeURIComponent(email)}`
        : "/login";
      await signOut({ callbackUrl });
    } catch (e: any) {
      setError(e?.message ?? "Network error.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#FFF8F1]">
      {/* ─── LEFT: Hero image panel ───────────────────────────────── */}
      <div
        className="relative hidden lg:flex lg:w-[55%] xl:w-[60%] min-h-[40vh] lg:min-h-screen flex-col justify-between p-10 xl:p-14 text-white overflow-hidden"
        style={{
          backgroundImage: `url("${HERO_URL}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Dark gradient overlay so the white text stays legible
            regardless of which part of the photo is in view. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/55 to-orange-900/40"
        />
        {/* Subtle vignette at the bottom for the trust badges block */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/80 to-transparent"
        />

        {/* Top: brand */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-sky-600 flex items-center justify-center shadow-lg ring-1 ring-orange-300/40">
            <HardHat className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">QuikInfra</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-orange-200/80">
              Construction · ERP
            </div>
          </div>
        </div>

        {/* Middle: headline tuned to the reset context (not the login one) */}
        <div className="relative z-10 max-w-xl">
          <h2 className="text-4xl xl:text-5xl font-semibold leading-[1.1] tracking-tight">
            Secure your
            <br />
            <span className="font-serif italic font-normal text-orange-300">
              account
            </span>{" "}
            in one quick step.
          </h2>
          <p className="mt-5 text-[15px] text-white/80 leading-relaxed max-w-md">
            Replace the temporary password from your invite with something only
            you know. We'll sign you out so the next login uses the new one.
          </p>
        </div>

        {/* Bottom: trust strip */}
        <div className="relative z-10 grid grid-cols-3 gap-4 max-w-lg">
          <div className="flex flex-col gap-1.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-orange-200" />
            </div>
            <div className="text-[11px] uppercase tracking-wider text-white/60">Projects</div>
            <div className="text-sm font-semibold text-white">Multi-site ready</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-orange-200" />
            </div>
            <div className="text-[11px] uppercase tracking-wider text-white/60">Compliance</div>
            <div className="text-sm font-semibold text-white">GST + TDS</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center">
              <Users className="w-4 h-4 text-orange-200" />
            </div>
            <div className="text-[11px] uppercase tracking-wider text-white/60">Roles</div>
            <div className="text-sm font-semibold text-white">RBAC built-in</div>
          </div>
        </div>
      </div>

      {/* ─── RIGHT: Reset-password form panel ─────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8 relative">
        {/* Mobile-only ambient blobs (the hero panel is hidden < lg) */}
        <div aria-hidden className="lg:hidden absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full opacity-50 blur-[100px] bg-gradient-to-br from-orange-300 via-sky-200 to-rose-200" />
          <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full opacity-40 blur-[110px] bg-gradient-to-br from-rose-200 via-pink-200 to-violet-200" />
        </div>

        <div className="relative z-10 w-full max-w-[420px]">
          {/* Mobile-only logo above card (desktop has it on the hero panel) */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-sky-600 flex items-center justify-center shadow-md ring-1 ring-orange-300/40">
              <HardHat className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="mt-2.5 text-center">
              <div className="text-[15px] font-semibold text-slate-900 tracking-tight">
                QuikInfra
              </div>
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-[0.2em] mt-0.5">
                Construction · ERP
              </div>
            </div>
          </div>

          <div className="text-center lg:text-left mb-7">
            <h1 className="text-[28px] font-semibold text-slate-900 tracking-[-0.02em] leading-[1.15]">
              Set a <span className="font-serif italic font-normal text-orange-600">new password</span>
            </h1>
            <p className="text-[14px] text-slate-500 mt-2">
              You're signed in with a temporary password — choose a new one to continue.
            </p>
          </div>

          {/* Temporary-password banner mirrors the "Invitation accepted"
              banner on the login page so the flow visually continues. */}
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
            <div className="font-semibold mb-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Temporary password active
            </div>
            Pick a permanent password that satisfies the policy below.
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-medium text-slate-700 mb-1.5">
                New password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewP(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 bg-white text-[14.5px] text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-400 transition-all hover:border-slate-300"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide password" : "Show password"}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <ul className="mt-2 text-[11px] space-y-0.5 text-slate-500">
                <li className={lenOk ? "text-emerald-600" : ""}>
                  {lenOk ? "✓" : "•"} 8 characters or more
                </li>
                <li className={upperOk ? "text-emerald-600" : ""}>
                  {upperOk ? "✓" : "•"} 1 uppercase letter
                </li>
                <li className={digitOk ? "text-emerald-600" : ""}>
                  {digitOk ? "✓" : "•"} 1 digit
                </li>
              </ul>
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-slate-700 mb-1.5">
                Confirm new password
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 bg-white text-[14.5px] text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-4 focus:ring-orange-100 focus:border-orange-400 transition-all hover:border-slate-300"
                  placeholder="Re-enter the new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirm.length > 0 && (
                <p className={`mt-1.5 text-[11px] ${matchOk ? "text-emerald-600" : "text-rose-500"}`}>
                  {matchOk ? "✓ Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>

            {error && (
              <p className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                {error}
              </p>
            )}
            {success && (
              <p className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Password updated. Signing you out…
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !policyOk || !matchOk}
              className="group relative w-full py-3 rounded-xl bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-500 hover:to-orange-700 text-white font-semibold text-[14.5px] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_24px_-8px_rgba(249,115,22,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] active:translate-y-[1px] flex items-center justify-center gap-2 overflow-hidden ring-1 ring-orange-600/20"
            >
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
              />
              {loading ? (
                <span className="relative flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating…
                </span>
              ) : (
                <>
                  <span className="relative">Set new password &amp; sign out</span>
                  <ArrowRight className="relative w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          {/* Trust strip — same shape as the login page so the two screens
              visually pair when navigating between them. */}
          <div className="mt-7 flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ISO 27001
            </span>
            <span className="w-px h-3 bg-slate-300" />
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              All systems operational
            </span>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-4">
            © {new Date().getFullYear()} QuikInfra · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
