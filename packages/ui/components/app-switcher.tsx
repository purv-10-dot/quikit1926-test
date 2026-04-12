"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Types ─── */
interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
}

interface AppSwitcherProps {
  /** Base URL of the QuikIT gateway (e.g., "http://localhost:3000") — for "View all apps" link */
  quikitUrl: string;
  /** Currently active app slug (e.g., "quikscale") — highlighted in grid */
  currentAppSlug?: string;
  /** API endpoint to fetch apps from (defaults to "/api/apps/switcher") */
  apiUrl?: string;
}

/* ─── Icon fallbacks ─── */
const ICON_FALLBACKS: Record<string, { emoji: string; bg: string }> = {
  quikscale:   { emoji: "📊", bg: "bg-blue-100" },
  admin:       { emoji: "⚙️", bg: "bg-purple-100" },
  "super-admin": { emoji: "🛡️", bg: "bg-red-100" },
  quikhr:      { emoji: "👥", bg: "bg-green-100" },
  quikfinance: { emoji: "💰", bg: "bg-amber-100" },
  quiksales:   { emoji: "📈", bg: "bg-teal-100" },
};

const DEFAULT_ICON = { emoji: "📦", bg: "bg-gray-100" };

/**
 * Google-style app switcher grid.
 *
 * Renders a 3x3 grid icon button that, when clicked, shows a popover
 * with the user's installed apps as icon tiles. Clicking an app
 * navigates to it in the same tab (SSO handles auth).
 *
 * Usage:
 *   <AppSwitcher quikitUrl="http://localhost:3000" currentAppSlug="quikscale" />
 */
export function AppSwitcher({ quikitUrl, currentAppSlug, apiUrl = "/api/apps/switcher" }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch apps from QuikIT launcher API
  const fetchApps = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (json.success) {
        // Only show installed (accessible) apps, exclude "coming_soon"
        const installed = (json.data as AppInfo[]).filter(
          (a) => a.status !== "coming_soon"
        );
        setApps(installed);
      }
    } catch {
      // Silently fail — grid just won't show apps
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [quikitUrl, fetched]);

  // Fetch on first open
  useEffect(() => {
    if (open && !fetched) {
      fetchApps();
    }
  }, [open, fetched, fetchApps]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      {/* Grid icon button */}
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="App switcher"
        title="Switch apps"
      >
        <GridIcon />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 z-[1000] overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-semibold text-gray-900">Apps</p>
          </div>

          {/* Grid */}
          <div className="px-3 pb-3">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
              </div>
            )}

            {!loading && apps.length === 0 && (
              <div className="text-center py-6">
                <p className="text-xs text-gray-400">No apps available</p>
              </div>
            )}

            {!loading && apps.length > 0 && (
              <div className="grid grid-cols-3 gap-1">
                {apps.map((app) => {
                  const iconInfo = ICON_FALLBACKS[app.slug] || DEFAULT_ICON;
                  const isCurrent = app.slug === currentAppSlug;

                  return (
                    <button
                      key={app.id}
                      onClick={() => {
                        setOpen(false);
                        window.location.href = app.baseUrl;
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                        isCurrent
                          ? "bg-indigo-50"
                          : "hover:bg-gray-50"
                      }`}
                      title={app.description || app.name}
                    >
                      {app.iconUrl ? (
                        <img
                          src={app.iconUrl}
                          alt={app.name}
                          className="h-10 w-10 rounded-xl object-cover"
                        />
                      ) : (
                        <div className={`h-10 w-10 rounded-xl ${iconInfo.bg} flex items-center justify-center text-xl`}>
                          {iconInfo.emoji}
                        </div>
                      )}
                      <span className="text-[11px] font-medium text-gray-700 leading-tight text-center truncate w-full">
                        {app.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer — link to full launcher */}
          <div className="border-t border-gray-100 px-4 py-2.5">
            <a
              href={`${quikitUrl}/apps`}
              className="block text-center text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              View all apps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** 3x3 dot grid icon (Google-style) */
function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-gray-600">
      <rect x="2" y="2" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="2" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="2" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="2" y="8" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="8" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="8" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="2" y="14" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="8" y="14" width="4" height="4" rx="1" fill="currentColor" />
      <rect x="14" y="14" width="4" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}
