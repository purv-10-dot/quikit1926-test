"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

interface LauncherApp {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  baseUrl: string;
}

interface SwitcherResponse {
  data: LauncherApp[];
  quikitUrl: string | null;
}

/** Two-letter fallback monogram when no icon loads. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * App icon with a fallback chain. The brand SVGs and DB iconUrl are served by
 * the central QuikIT app, so they must be loaded from the QuikIT ORIGIN — a
 * relative path would 404 against HRMS. We try, in order:
 *   1. QuikIT's conventional brand asset:  {quikit}/app-icons/{slug}.svg
 *   2. the DB iconUrl (absolutized to the QuikIT origin if relative)
 *   3. a two-letter monogram
 * `onError` advances to the next candidate.
 */
function AppIcon({ app, base }: { app: LauncherApp; base: string }) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (base && app.slug) list.push(`${base}/app-icons/${app.slug}.svg`);
    if (app.iconUrl) {
      list.push(
        /^https?:\/\//.test(app.iconUrl)
          ? app.iconUrl
          : `${base}${app.iconUrl.startsWith("/") ? "" : "/"}${app.iconUrl}`,
      );
    }
    return list;
  }, [app, base]);

  const [idx, setIdx] = useState(0);

  if (idx >= candidates.length) {
    return (
      <div className="w-9 h-9 rounded-lg bg-[#16243A] text-white flex items-center justify-center text-[12px] font-bold">
        {initials(app.name)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[idx]}
      alt={app.name}
      className="w-9 h-9 rounded-lg object-contain"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

/**
 * Top-bar "waffle" app-switcher. Shows only the apps this user may open in
 * their org. Reads the shared app catalog directly via /api/apps/switcher
 * (same endpoint contract + visibility rule as quikscale/quiktrack) and links
 * straight to each app's env-resolved baseUrl.
 */
export function AppSwitcher() {
  const api = useApiClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Only fetch once the menu is first opened — no cost for users who never use it.
  const { data, isLoading } = useQuery({
    queryKey: ["apps-switcher"],
    queryFn: () => api.get<SwitcherResponse>("/api/apps/switcher"),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const apps = data?.data ?? [];
  const quikitUrl = data?.quikitUrl ?? null;

  // Browser-facing QuikIT origin for assets/links. Prefer the baked public var
  // (always browser-reachable) over the server-returned URL (which may be an
  // internal host like host.docker.internal in containerized deploys).
  const iconBase = (process.env.NEXT_PUBLIC_QUIKIT_URL || quikitUrl || "").replace(/\/$/, "");

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch apps"
        aria-expanded={open}
        title="Apps"
        className="w-9 h-9 rounded-full bg-white ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600"
      >
        <LayoutGrid size={16} />
      </button>

      {open && (
        <div className="absolute z-50 right-0 top-full mt-2 w-[320px] rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 p-4">
          <div className="text-[15px] font-semibold text-gray-700 mb-3 px-1">Apps</div>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : apps.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              No apps available for your account.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {apps.map((app) => (
                <a
                  key={app.id}
                  // Navigate straight to the target app's baseUrl — same as the
                  // QuikScale/QuikTrack switchers. Dev shares the localhost
                  // session cookie across ports; prod relies on each app's own
                  // central-SSO entry. baseUrl is env-resolved server-side
                  // (see /api/apps/switcher) so dev points at localhost.
                  href={app.baseUrl}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-3 hover:bg-gray-100 transition"
                  title={app.name}
                >
                  <AppIcon app={app} base={iconBase} />
                  <span className="text-[11px] text-gray-600 text-center leading-tight truncate w-full">
                    {app.name}
                  </span>
                </a>
              ))}
            </div>
          )}

          {quikitUrl && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-center">
              <a
                href={`${iconBase || quikitUrl.replace(/\/$/, "")}/apps`}
                className="text-[13px] font-medium text-[#3b82f6] hover:text-[#2563eb]"
              >
                View all apps
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
