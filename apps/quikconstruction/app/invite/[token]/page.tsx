"use client";

/**
 * Public invite-acceptance page — the URL that's embedded in the
 * invitation email. Users land here WITHOUT being logged in, so this
 * page cannot use the usual dashboard shell, permissions hook, or
 * tenant context. It only talks to `/api/invites/:token` and
 * `/api/invites/accept`.
 *
 * Flow:
 *   1. Load GET /api/invites/:token to verify + display the invite
 *   2. User picks a password + retypes it
 *   3. POST /api/invites/accept with { token, password }
 *   4. Success → show a "go to login" button routing to /login
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ShieldCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface InviteInfo {
  fullName: string;
  username: string;
  email: string;
  userType: string;
  department?: string;
  invitedByName?: string;
  expiresAt: string;
}

const USER_TYPE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  HO_USER: "HO User",
  SITE_ADMIN: "Site Admin",
  USER: "User",
};

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token as string;

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [retype, setRetype] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/invites/${token}`);
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json.error ?? `Invite check failed (HTTP ${res.status})`);
        } else {
          setInfo(json);
        }
      } catch (e: any) {
        setLoadError(e?.message ?? "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
      setSubmitError(
        "Password must include at least one uppercase letter and one digit"
      );
      return;
    }
    if (password !== retype) {
      setSubmitError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? `Accept failed (HTTP ${res.status})`);
      } else {
        setAccepted(true);
        // Bounce to login after a short confirmation pause
        setTimeout(() => router.push("/login"), 2200);
      }
    } catch (e: any) {
      setSubmitError(e?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header band */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-500 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-90">
            <ShieldCheck className="w-4 h-4" />
            QuikConstruction
          </div>
          <h1 className="text-xl font-semibold mt-2">Accept your invitation</h1>
        </div>

        <div className="p-6 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Checking your invite…
            </div>
          )}

          {loadError && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Invite unavailable</div>
                <div className="mt-0.5">{loadError}</div>
                <Link
                  href="/login"
                  className="text-xs font-semibold underline mt-2 inline-block"
                >
                  Go to login
                </Link>
              </div>
            </div>
          )}

          {!loading && !loadError && info && !accepted && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-1">
                <div className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
                  Invited
                </div>
                <div className="text-base font-semibold text-gray-900">
                  {info.fullName}
                </div>
                <div className="text-xs text-gray-500">
                  @{info.username} · {info.email}
                </div>
                <div className="flex gap-2 mt-2 text-[11px]">
                  <span className="inline-block bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-semibold">
                    {USER_TYPE_LABELS[info.userType] ?? info.userType}
                  </span>
                  {info.department && (
                    <span className="inline-block bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-full">
                      {info.department}
                    </span>
                  )}
                </div>
                {info.invitedByName && (
                  <div className="text-[11px] text-gray-500 italic mt-1">
                    Invited by {info.invitedByName}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Create a password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 digit"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Retype password
                  </label>
                  <input
                    type="password"
                    value={retype}
                    onChange={(e) => setRetype(e.target.value)}
                    placeholder="Retype password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    required
                  />
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Activating…
                    </>
                  ) : (
                    <>Activate account</>
                  )}
                </button>

                <p className="text-[11px] text-gray-500 text-center">
                  By activating, you agree that {info.invitedByName ?? "your administrator"}{" "}
                  has authorised this account.
                </p>
              </form>
            </>
          )}

          {accepted && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-5 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-base font-semibold text-gray-900">
                Account activated
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Redirecting you to the login screen…
              </p>
              <Link
                href="/login"
                className="text-xs font-semibold text-orange-700 hover:underline mt-3 inline-block"
              >
                Go now →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
