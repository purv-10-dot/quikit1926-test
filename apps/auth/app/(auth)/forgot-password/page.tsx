"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSubmitting(false);
    setSent(true);
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <h1 className="text-2xl font-semibold text-center">Forgot password?</h1>
      <p className="text-sm text-gray-500 mt-1 text-center">We'll email you a reset link.</p>

      {sent ? (
        <div className="mt-6 rounded-lg bg-green-50 border border-green-200 px-3 py-3 text-sm text-green-800 text-center">
          If an account exists for <strong>{email}</strong>, a reset link is on its way.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="email" />
          </label>
          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-600">
        <Link href="/login" className="text-indigo-600 hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
