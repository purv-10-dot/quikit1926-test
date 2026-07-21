"use client";

import { useEffect, useRef, useState } from "react";

/**
 * QuikFinance's vertical AppSwitcher — the grid-icon dropdown in the header.
 * Consumes GET /api/apps/switcher (which queries the central platform DB) and
 * lists the apps the current user/org can launch. "View all apps" links to the
 * QuikIT launcher's /apps library page.
 */
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
  quikhrms: { emoji: "👥", bg: "bg-green-100" },
  quikfinance: { emoji: "💰", bg: "bg-amber-100" },
  quikcrm: { emoji: "📈", bg: "bg-teal-100" },
  quikinfra: { emoji: "🏗️", bg: "bg-orange-100" },
  quiktrack: { emoji: "🎯", bg: "bg-indigo-100" },
};
const DEFAULT_ICON = { emoji: "📦", bg: "bg-gray-100" };

/** Brand logos by slug — override the app-relative API iconUrl (which 404s
 *  cross-origin). Each app ships these SVGs in its own public/app-icons. */
const BRAND_ICONS: Record<string, string> = {
  quikit: "/app-icons/quikit.svg",
  admin: "/app-icons/admin.svg",
  quikchat: "/app-icons/quikchat.svg",
  quikinfra: "/app-icons/quikinfra.svg",
  quikscale: "/app-icons/quikscale.svg",
  quiktrack: "/app-icons/quiktrack.svg",
  quiksocial: "/app-icons/quiksocial.svg",
};

export function AppSwitcherVertical() {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [quikitUrl, setQuikitUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  // Slugs whose icon <img> 404'd (cross-origin /app-icons that this app doesn't
  // ship) — fall back to the colored emoji tile instead of a broken image.
  const [errored, setErrored] = useState<Set<string>>(new Set());
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

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
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
        className={`rounded-md p-2 transition-colors ${open ? "bg-muted" : "hover:bg-muted"}`}
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
          className="absolute left-0 top-full z-[1000] mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_12px_32px_-10px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)]"
        >
          <div className="px-4 pb-2 pt-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              Apps
            </p>
          </div>

          <div className="px-1.5 pb-1.5">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            )}

            {!loading && apps.length === 0 && (
              <p className="py-5 text-center text-xs text-gray-400">No apps available</p>
            )}

            {!loading &&
              apps.map((app) => {
                const iconInfo = ICON_FALLBACKS[app.slug] || DEFAULT_ICON;
                const iconSrc = BRAND_ICONS[app.slug] ?? app.iconUrl;
                const showImg = Boolean(iconSrc) && !errored.has(app.slug);
                const isCurrent = app.id === currentApp?.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      window.location.href = app.baseUrl;
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                      isCurrent ? "bg-blue-50 text-blue-700" : "text-gray-800 hover:bg-gray-50"
                    }`}
                    title={app.description || app.name}
                  >
                    {showImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={iconSrc as string}
                        alt={app.name}
                        onError={() =>
                          setErrored((prev) => new Set(prev).add(app.slug))
                        }
                        className="h-7 w-7 shrink-0 rounded-md object-contain"
                      />
                    ) : (
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base ${iconInfo.bg}`}
                      >
                        {iconInfo.emoji}
                      </div>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium leading-tight">
                        {app.name}
                      </span>
                      {app.description && (
                        <span className="mt-0.5 block truncate text-[11px] leading-tight text-gray-500">
                          {app.description}
                        </span>
                      )}
                    </span>
                    {isCurrent && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
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
