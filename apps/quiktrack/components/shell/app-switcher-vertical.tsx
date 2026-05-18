"use client";

import { useEffect, useRef, useState } from "react";

// TODO(integration): upstream the vertical variant to @quikit/ui once the
// other apps agree on the layout. For now this is a QuikTrack-only override
// that consumes the same /api/apps/switcher endpoint as the shared
// <AppSwitcher /> grid in @quikit/ui.

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
  installed?: boolean;
}

const ICON_FALLBACKS: Record<string, { emoji: string; bg: string }> = {
  quikscale: { emoji: "📊", bg: "bg-blue-100" },
  admin: { emoji: "⚙️", bg: "bg-purple-100" },
  "super-admin": { emoji: "🛡️", bg: "bg-red-100" },
  quikhr: { emoji: "👥", bg: "bg-green-100" },
  quikfinance: { emoji: "💰", bg: "bg-amber-100" },
  quiksales: { emoji: "📈", bg: "bg-teal-100" },
  quiktrack: { emoji: "🎯", bg: "bg-indigo-100" },
};
const DEFAULT_ICON = { emoji: "📦", bg: "bg-gray-100" };

/**
 * QuikTrack's vertical AppSwitcher — same data source as the shared
 * @quikit/ui <AppSwitcher /> (GET /api/apps/switcher) but laid out as a
 * single-column list instead of a 3×3 grid.
 */
export function AppSwitcherVertical() {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [quikitUrl, setQuikitUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || fetched) return;
    setLoading(true);
    fetch("/api/apps/switcher")
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) return;
        const list = (j.data as AppInfo[]).filter(
          (a) => a.status !== "coming_soon" && a.installed !== false,
        );
        setApps(list);
        setQuikitUrl(typeof j.quikitUrl === "string" ? j.quikitUrl : null);
      })
      .catch(() => undefined)
      .finally(() => {
        setLoading(false);
        setFetched(true);
      });
  }, [open, fetched]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const currentApp = apps.find((app) => {
    try {
      return new URL(app.baseUrl).origin === currentOrigin;
    } catch {
      return false;
    }
  });

  const viewAllHref = quikitUrl ? `${quikitUrl}/apps` : "/apps";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-2 rounded-full transition-colors ${
          open ? "bg-gray-100" : "hover:bg-gray-100"
        }`}
        aria-label="App switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch apps"
      >
        <GridIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-[0_12px_32px_-10px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)] z-[1000] overflow-hidden"
        >
          <div className="px-4 pt-3.5 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              Apps
            </p>
          </div>

          <div className="px-1.5 pb-1.5">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              </div>
            )}

            {!loading && apps.length === 0 && (
              <p className="text-center text-xs text-gray-400 py-5">
                No apps available
              </p>
            )}

            {!loading &&
              apps.map((app) => {
                const iconInfo = ICON_FALLBACKS[app.slug] || DEFAULT_ICON;
                const isCurrent = app.id === currentApp?.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      window.location.href = app.baseUrl;
                    }}
                    className={`w-full flex items-center gap-3 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                      isCurrent
                        ? "bg-blue-50 text-blue-700"
                        : "hover:bg-gray-50 text-gray-800"
                    }`}
                    title={app.description || app.name}
                  >
                    {app.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={app.iconUrl}
                        alt={app.name}
                        className="h-7 w-7 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className={`h-7 w-7 rounded-md ${iconInfo.bg} flex items-center justify-center text-base shrink-0`}
                      >
                        {iconInfo.emoji}
                      </div>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium leading-tight truncate">
                        {app.name}
                      </span>
                      {app.description && (
                        <span className="block text-[11px] text-gray-500 leading-tight truncate mt-0.5">
                          {app.description}
                        </span>
                      )}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-600 shrink-0">
                        Current
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          <div className="border-t border-gray-100 px-4 py-2">
            <a
              href={viewAllHref}
              className="block text-center text-[12px] font-medium text-blue-600 hover:text-blue-700"
            >
              View all apps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-gray-600">
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
