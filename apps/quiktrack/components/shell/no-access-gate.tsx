"use client";

import { useQuery } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowLeft,
  Check,
  LogOut,
  Mail,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { globalSignOut } from "@quikit/ui";

interface AccessSummary {
  isOrgAdmin: boolean;
  isAppAdmin: boolean;
  isAdmin: boolean;
  hasProjects: boolean;
  projectCount: number;
  canCreateProject: boolean;
  orgName: string | null;
  roleName: string | null;
  adminEmails: string[];
}

/**
 * Full-screen wall that replaces the normal dashboard chrome when the
 * signed-in user is a non-admin with **zero** project memberships.
 * Admins and users with at least one project pass through.
 */
export function NoAccessGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userName = session?.user?.name ?? null;
  const userEmail = session?.user?.email ?? null;
  const launcherUrl = process.env.NEXT_PUBLIC_QUIKIT_URL ?? null;

  const accessQ = useQuery({
    queryKey: ["quiktrack", "me-access"],
    queryFn: async () => {
      const r = await fetch("/api/me/access");
      if (!r.ok) return null;
      const j = await r.json();
      return (j.data as AccessSummary) ?? null;
    },
    enabled: status === "authenticated",
    staleTime: 60_000,
  });

  if (status !== "authenticated" || accessQ.isLoading || !accessQ.data) {
    return <>{children}</>;
  }

  const data = accessQ.data;
  // Pass through admins, anyone already in a project, AND anyone who can create
  // a space (e.g. the Space Creator role) — the latter would otherwise be
  // walled off before reaching the "Create space" flow.
  if (data.isAdmin || data.hasProjects || data.canCreateProject) {
    return <>{children}</>;
  }

  return (
    <NoAccessScreen
      data={data}
      userName={userName}
      userEmail={userEmail}
      launcherUrl={launcherUrl}
      isFetching={accessQ.isFetching}
      onRefetch={() => accessQ.refetch()}
    />
  );
}

function NoAccessScreen({
  data,
  userName,
  userEmail,
  launcherUrl,
  isFetching,
  onRefetch,
}: {
  data: AccessSummary;
  userName: string | null;
  userEmail: string | null;
  launcherUrl: string | null;
  isFetching: boolean;
  onRefetch: () => void;
}) {
  const initials = (userName ?? userEmail ?? "U")
    .split(/[\s@]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSignOut() {
    // Single-logout: clear quiktrack cookie, auth-host cookie, AND
    // launcher cookie. Without authUrl, the auth-host cookie would
    // persist and silently re-authenticate on next "Login" click.
    const landingUrl =
      (process.env.NEXT_PUBLIC_QUIKTRACK_URL?.replace(/\/+$/, "") ??
        (typeof window !== "undefined" ? window.location.origin : "")) + "/";
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: launcherUrl ?? undefined,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: landingUrl,
    });
  }

  function requestAccess() {
    const to = data.adminEmails.join(",");
    const subject = encodeURIComponent("QuikTrack access request");
    const body = encodeURIComponent(
      `Hi,\n\nI'd like access to a project in QuikTrack (organisation: ${data.orgName ?? "—"}).\n\nMy account: ${userEmail ?? ""}\n\nThanks!`,
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#dbeafe_0%,_transparent_60%),radial-gradient(ellipse_at_bottom,_#f3e8ff_0%,_transparent_60%)] px-4 py-10 relative overflow-hidden">
      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 60% 50% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      {/* Floating sparkles */}
      <Sparkle className="absolute top-[18%] left-[22%] text-blue-400" size={14} delay="0s" />
      <Sparkle className="absolute top-[28%] right-[20%] text-purple-400" size={18} delay="0.6s" />
      <Sparkle className="absolute bottom-[28%] left-[18%] text-pink-400" size={12} delay="1.2s" />
      <Sparkle className="absolute bottom-[18%] right-[25%] text-blue-400" size={16} delay="1.8s" />

      <div className="relative w-full max-w-2xl">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl border border-white overflow-hidden">
          {/* Top gradient strip */}
          <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

          <div className="grid md:grid-cols-[1fr_1.2fr]">
            {/* LEFT: illustration column */}
            <div className="relative bg-gradient-to-br from-blue-50 to-purple-50 px-8 py-10 flex flex-col items-center justify-center text-center">
              <HeroIllustration />
              <div className="mt-6 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 border border-gray-200 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-purple-500" />
                <span className="text-[11px] font-medium text-gray-600">Almost there</span>
              </div>
            </div>

            {/* RIGHT: content column */}
            <div className="px-8 py-10 flex flex-col">
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                You&apos;re in, but no project yet
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed mt-2">
                Your account is set up — an admin just needs to add you to a
                project so your work surfaces here. The dashboard unlocks the
                moment you&apos;re assigned.
              </p>

              {/* Status checklist */}
              <ul className="mt-5 space-y-2">
                <StatusRow ok label="Signed in to QuikTrack" />
                <StatusRow
                  ok
                  label={
                    data.orgName
                      ? `Member of ${data.orgName}`
                      : "Member of your organisation"
                  }
                  hint={data.roleName ? `role: ${data.roleName}` : undefined}
                />
                <StatusRow
                  ok={false}
                  label="Assigned to a project"
                  hint="0 projects"
                />
              </ul>

              {/* Signed-in chip */}
              {userEmail && (
                <div className="mt-5 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-gray-50 border border-gray-200 self-start">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-[10px] font-semibold flex items-center justify-center">
                    {initials}
                  </span>
                  <span className="text-xs text-gray-600 truncate max-w-[260px]">
                    {userEmail}
                  </span>
                </div>
              )}

              {/* Primary CTAs */}
              <div className="mt-6 flex flex-col gap-2">
                {data.adminEmails.length > 0 ? (
                  <button
                    type="button"
                    onClick={requestAccess}
                    className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg shadow-sm transition-all"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Request access from admin
                  </button>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  {launcherUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = launcherUrl;
                      }}
                      className="inline-flex items-center justify-center gap-1.5 h-10 px-3 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      All apps
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onRefetch}
                    disabled={isFetching}
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-3 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                    {isFetching ? "Checking…" : "Check again"}
                  </button>
                </div>
              </div>

              {/* Footer row */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {data.adminEmails.length > 0
                    ? `${data.adminEmails.length} admin${data.adminEmails.length === 1 ? "" : "s"} can grant access`
                    : "Contact your organisation owner"}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600"
                >
                  <LogOut className="h-3 w-3" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── tiny presentational helpers ─────────────────────────── */

function StatusRow({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
          ok ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
        }`}
      >
        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <span className={ok ? "text-gray-700" : "text-gray-900 font-medium"}>{label}</span>
      {hint && <span className="text-xs text-gray-400">· {hint}</span>}
    </li>
  );
}

function Sparkle({
  className,
  size,
  delay,
}: {
  className?: string;
  size: number;
  delay: string;
}) {
  return (
    <Sparkles
      className={`${className} pointer-events-none animate-pulse`}
      style={{ width: size, height: size, animationDelay: delay, animationDuration: "3s" }}
    />
  );
}

function HeroIllustration() {
  return (
    <div className="relative">
      {/* Outer glow ring */}
      <div className="absolute -inset-3 rounded-3xl bg-gradient-to-tr from-blue-200 to-purple-200 blur-xl opacity-60" />

      {/* Tile-like illustration */}
      <div className="relative w-40 h-40 rounded-2xl bg-white border border-gray-200 shadow-lg flex items-center justify-center">
        <svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="lockGrad" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#3b82f6" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          {/* Floor card / box */}
          <rect x="14" y="44" width="68" height="42" rx="6" fill="url(#lockGrad)" opacity="0.1" />
          <rect x="14" y="44" width="68" height="42" rx="6" stroke="url(#lockGrad)" strokeWidth="2.5" />
          {/* Keyhole */}
          <circle cx="48" cy="62" r="4.5" fill="url(#lockGrad)" />
          <rect x="46" y="62" width="4" height="9" rx="1.5" fill="url(#lockGrad)" />
          {/* Shackle */}
          <path
            d="M30 44V32a18 18 0 0 1 36 0v12"
            stroke="url(#lockGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* Tiny stars */}
          <circle cx="78" cy="22" r="2" fill="#fbbf24" />
          <circle cx="20" cy="18" r="1.5" fill="#f472b6" />
          <circle cx="88" cy="56" r="1.5" fill="#60a5fa" />
        </svg>
      </div>

      {/* Floating dots */}
      <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-amber-300 border-2 border-white shadow" />
      <span className="absolute -bottom-2 -left-2 w-3 h-3 rounded-full bg-purple-300 border-2 border-white shadow" />
    </div>
  );
}
