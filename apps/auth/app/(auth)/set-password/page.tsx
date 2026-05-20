"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requireProdEnv } from "@quikit/shared";

/**
 * FRD FR-SA-009 / FR-SA-010 — Set Password screen.
 *
 * Shown ONCE on first login for users created via native invite (still on
 * the system default password Quikit2026). They may either save a new
 * password or click Skip to keep the default; either action clears
 * `User.mustChangePassword` so subsequent logins go straight to the
 * dashboard (BR-008).
 *
 * Reached when `mustChangePassword` is true (the sign-in flow routes here
 * before the user is sent on to the launcher).
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Env-only — `NEXT_PUBLIC_LAUNCHER_URL` is required in prod (throws at
  // render time if unset); dev falls back to the local launcher.
  const launcherUrl = `${requireProdEnv(
    "NEXT_PUBLIC_LAUNCHER_URL",
    "http://localhost:3001",
  ).replace(/\/+$/, "")}/apps`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setError("Password must contain at least one special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/me/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Could not set your password. Please try again.");
        setSubmitting(false);
        return;
      }
      // FR-SA-010 — after successful set, send the user to the standard
      // post-login destination. Hard nav so the JWT picks up the cleared
      // mustChangePassword flag on the next round-trip.
      window.location.href = launcherUrl;
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/me/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Could not skip. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = launcherUrl;
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  void router; // reserved for future inline back-link

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">
          Set your password
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          You&apos;re using a temporary password. Set a new one now, or skip and
          keep the default for now.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-slate-700">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Enter your default password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-700">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-700">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save & Continue"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Skip for now
          </button>
        </form>
      </div>
    </div>
  );
}
