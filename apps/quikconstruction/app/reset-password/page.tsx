"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";

/**
 * /reset-password
 *
 * Forced when `session.user.mustChangePassword === true` (middleware.ts).
 * The user pastes the temp password from their invite email, picks a new
 * one that satisfies the policy, and we POST to /api/account/reset-password.
 * On success we sign them out — the existing JWT still says
 * `mustChangePassword: true`, so the cleanest way to reflect the new DB
 * state is a fresh login with the new password.
 */
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-600 text-white text-3xl mb-4 shadow-lg">
            🔐
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
          <p className="text-sm text-gray-500 mt-1">
            You're signed in with a temporary password — choose a new one to continue.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewP(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide password" : "Show password"}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <ul className="mt-2 text-[11px] space-y-0.5 text-gray-500">
                <li className={lenOk ? "text-green-600" : ""}>
                  {lenOk ? "✓" : "•"} 8 characters or more
                </li>
                <li className={upperOk ? "text-green-600" : ""}>
                  {upperOk ? "✓" : "•"} 1 uppercase letter
                </li>
                <li className={digitOk ? "text-green-600" : ""}>
                  {digitOk ? "✓" : "•"} 1 digit
                </li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Re-enter the new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirm.length > 0 && (
                <p className={`mt-1 text-[11px] ${matchOk ? "text-green-600" : "text-red-500"}`}>
                  {matchOk ? "✓ Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                Password updated. Signing you out…
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !policyOk || !matchOk}
              className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? "Updating..." : "Set new password & sign out"}
            </button>
          </form>

          <p className="mt-5 text-[11px] text-gray-400 text-center">
            After saving, you'll be signed out and asked to sign in again with your new password.
          </p>
        </div>
      </div>
    </div>
  );
}
