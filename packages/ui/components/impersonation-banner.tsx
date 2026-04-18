"use client";

/**
 * SA-D.4 — Impersonation banner.
 *
 * Shown at the top of every page inside the target app while a super admin
 * is "viewing as" another user. Pulls session data client-side from
 * /api/auth/session, so it works without server-component plumbing.
 *
 * Clicking "Exit" POSTs to /api/auth/impersonate/exit which clears the
 * cookie and redirects to the launcher's /apps page.
 */

import { useEffect, useState, useCallback } from "react";
import { Eye, LogOut, Clock } from "lucide-react";

interface SessionShape {
  user?: {
    impersonating?: boolean;
    impersonatorEmail?: string;
    impersonationExpiresAt?: string;
    email?: string;
  };
}

export function ImpersonationBanner() {
  const [session, setSession] = useState<SessionShape | null>(null);
  const [exiting, setExiting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/session");
      if (!r.ok) return;
      const j = await r.json();
      setSession(j);
    } catch {
      // fail silent — banner just stays hidden
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh when the tab regains focus OR becomes visible. This replaces a
    // 60s polling interval with zero traffic on idle tabs — sessions API
    // calls drop from 60/hr/tab to ~1-2/hr/tab on typical usage.
    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  // Local countdown without polling — decrement every 30s from the cached
  // expiry. No network call needed.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session?.user?.impersonating) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [session?.user?.impersonating]);

  async function exit() {
    setExiting(true);
    try {
      const r = await fetch("/api/auth/impersonate/exit", { method: "POST" });
      const j = await r.json();
      if (j?.data?.redirectUrl) {
        window.location.href = j.data.redirectUrl;
      } else {
        window.location.href = "/";
      }
    } catch {
      setExiting(false);
    }
  }

  if (!session?.user?.impersonating) return null;

  // `tick` is read here purely so React re-renders when the countdown ticks.
  // We don't use its value — the expiry calculation is based on Date.now().
  void tick;
  const expiresAt = session.user.impersonationExpiresAt ? new Date(session.user.impersonationExpiresAt) : null;
  const msLeft = expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : null;
  const mins = msLeft !== null ? Math.floor(msLeft / 60_000) : null;
  const timeText =
    mins === null
      ? ""
      : mins > 60
        ? `${Math.floor(mins / 60)}h ${mins % 60}m left`
        : `${mins}m left`;

  return (
    <div
      role="banner"
      className="sticky top-0 z-50 bg-amber-500 text-white text-sm px-4 py-2 flex items-center gap-3 shadow"
    >
      <Eye className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">Viewing as</span>{" "}
        <span className="font-mono">{session.user.email}</span>
        {session.user.impersonatorEmail && (
          <span className="opacity-80"> · Super admin: {session.user.impersonatorEmail}</span>
        )}
      </div>
      {expiresAt && (
        <span className="inline-flex items-center gap-1 text-xs opacity-90 whitespace-nowrap">
          <Clock className="h-3 w-3" />
          {timeText}
        </span>
      )}
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        className="inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 rounded px-2 py-1 text-xs font-semibold disabled:opacity-50"
      >
        <LogOut className="h-3 w-3" />
        Exit impersonation
      </button>
    </div>
  );
}
