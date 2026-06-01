"use client";

/**
 * QuikitAppSwitcher — local replacement for @quikit/ui's <AppSwitcher>.
 *
 * Why this lives in apps/quiksocial/components/ instead of being imported
 * from @quikit/ui:
 *
 *   packages/ui/components/app-switcher.tsx is hardcoded with Tailwind
 *   utilities for a light theme (bg-white, text-gray-900, indigo accent).
 *   It accepts no className, no style, no CSS-variable hooks — so a
 *   consumer cannot restyle it from outside without forking. QuikSocial's
 *   dashboard is dark-glass (see apps/web/src/lib/constants/design-tokens.md)
 *   and a white popover dropped into that header would read as a foreign
 *   widget from another app.
 *
 *   App-level CLAUDE.md "Must do" rule #1 explicitly covers this case:
 *   "If a component is missing [a feature], copy the closest analog from
 *   @quikit/ui's source as inspiration but rebuild it inside this app's
 *   components/ (clearly marked TODO(integration) to upstream)." That is
 *   what this file is.
 *
 * TODO(integration): upstream a `className` / `theme` prop to
 * @quikit/ui's AppSwitcher (or expose CSS variables) and replace this file
 * with `import { AppSwitcher } from "@quikit/ui"` once available.
 *
 * Functional parity with the shared component (do NOT diverge):
 *   - Hits the same `/api/apps/switcher` endpoint, same response shape.
 *   - Same 5-minute module-level cache with in-flight dedupe.
 *   - Same idle-time prefetch on mount (requestIdleCallback + setTimeout
 *     fallback) so the first click renders instantly.
 *   - Same current-app detection via window.location.origin matching.
 *   - Same "View all apps" fallback chain: api quikitUrl →
 *     NEXT_PUBLIC_QUIKIT_URL → "/apps".
 *   - Same filters: drops status=coming_soon and installed=false rows.
 *
 * Visual styling sourced from
 * apps/web/src/lib/constants/design-tokens.md sections 1, 6, 8.
 */

import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Types — match the shared component exactly so server payload is identical ─── */

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

interface CacheEntry {
  apps: AppInfo[];
  quikitUrl: string | null;
  fetchedAt: number;
}

/* ─── Module-level cache (5-min TTL, in-flight dedupe) ─────────────────── */

const APP_CACHE = new Map<string, CacheEntry>();
const APP_CACHE_TTL_MS = 5 * 60 * 1000;
const APP_INFLIGHT = new Map<string, Promise<CacheEntry | null>>();

async function fetchAppsNetwork(apiUrl: string): Promise<CacheEntry | null> {
  const cached = APP_CACHE.get(apiUrl);
  if (cached && Date.now() - cached.fetchedAt < APP_CACHE_TTL_MS) {
    return cached;
  }
  const existing = APP_INFLIGHT.get(apiUrl);
  if (existing) return existing;

  const p = (async (): Promise<CacheEntry | null> => {
    try {
      const res = await fetch(apiUrl, { credentials: "include" });
      const json = await res.json();
      if (!json.success) return null;
      const list = (json.data as AppInfo[]).filter(
        (a) => a.status !== "coming_soon" && a.installed !== false,
      );
      const quikitUrl =
        typeof json.quikitUrl === "string" && json.quikitUrl ? json.quikitUrl : null;
      const entry: CacheEntry = { apps: list, quikitUrl, fetchedAt: Date.now() };
      APP_CACHE.set(apiUrl, entry);
      return entry;
    } catch {
      return null;
    } finally {
      APP_INFLIGHT.delete(apiUrl);
    }
  })();
  APP_INFLIGHT.set(apiUrl, p);
  return p;
}

/* ─── Icon fallback emojis (parity with @quikit/ui) ─────────────────────── */

const ICON_FALLBACKS: Record<string, string> = {
  quiksocial: "📣",
  quikscale: "📊",
  admin: "⚙️",
  "super-admin": "🛡️",
  quikhr: "👥",
  quikfinance: "💰",
  quiksales: "📈",
  quiktrack: "🎯",
  quikvc: "💼",
  quikinfra: "🛠️",
};
const DEFAULT_ICON = "📦";

/* ─── Component ─────────────────────────────────────────────────────────── */

interface QuikitAppSwitcherProps {
  apiUrl?: string;
  prefetch?: boolean;
}

export function QuikitAppSwitcher({
  apiUrl = "/api/apps/switcher",
  prefetch = true,
}: QuikitAppSwitcherProps = {}) {
  const [open, setOpen] = useState(false);
  // Hydrate initial state from the module cache so a re-mount doesn't flash
  // "loading" when data is already warm.
  const initialCache = APP_CACHE.get(apiUrl);
  const initialFresh = initialCache && Date.now() - initialCache.fetchedAt < APP_CACHE_TTL_MS;
  const [apps, setApps] = useState<AppInfo[]>(initialFresh ? initialCache.apps : []);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(!!initialFresh);
  const [quikitUrl, setQuikitUrl] = useState<string | null>(
    initialFresh ? initialCache.quikitUrl : null,
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchApps = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    const entry = await fetchAppsNetwork(apiUrl);
    if (entry) {
      setApps(entry.apps);
      setQuikitUrl(entry.quikitUrl);
    }
    setLoading(false);
    setFetched(true);
  }, [apiUrl, fetched]);

  // Idle prefetch — first click is instant.
  useEffect(() => {
    if (!prefetch || fetched || typeof window === "undefined") return;
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(
        () => {
          void fetchApps();
        },
        { timeout: 3000 },
      );
    } else {
      timeoutId = setTimeout(() => {
        void fetchApps();
      }, 1500);
    }
    return () => {
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [prefetch, fetched, fetchApps]);

  // Fallback fetch on first open if prefetch hadn't fired yet.
  useEffect(() => {
    if (open && !fetched) void fetchApps();
  }, [open, fetched, fetchApps]);

  // Close on click outside / Escape.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Current-app detection: match origin against each app's baseUrl.
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const currentApp = apps.find((app) => {
    try {
      return new URL(app.baseUrl).origin === currentOrigin;
    } catch {
      return false;
    }
  });

  // "View all apps" destination — prefer api-provided launcher URL, fall back
  // to the build-time env, fall back to bare "/apps" as the last resort.
  const launcherBase = (quikitUrl ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const viewAllHref = launcherBase ? `${launcherBase}/apps` : "/apps";

  return (
    <div style={{ position: "relative" }} ref={popoverRef}>
      {/* ── Trigger button — 36×36 circle matching the Bell/theme buttons
            beside it in dashboard-layout. Tokens from design-tokens.md §1. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch apps"
        title="Switch apps"
        style={{
          width: 36,
          height: 36,
          borderRadius: 9999,
          background: open ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.18)";
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)";
        }}
      >
        <GridIcon />
      </button>

      {/* ── Popover — heavy glass surface from design-tokens.md §1.3
            (matches the brand-selector dropdown styling). */}
      {open && (
        <div
          role="dialog"
          aria-label="Apps"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 312,
            zIndex: 1000,
            background: "rgba(33, 33, 33, 0.20)",
            border: "0.5px solid rgba(255, 255, 255, 0.35)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
            borderRadius: 24,
            overflow: "hidden",
          }}
          className="animate-fade-in"
        >
          {/* Header */}
          <div style={{ padding: "16px 18px 8px" }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 500,
                color: "rgba(255, 255, 255, 0.65)",
                letterSpacing: 0.2,
              }}
            >
              Apps
            </p>
          </div>

          {/* Body */}
          <div style={{ padding: "4px 14px 14px" }}>
            {loading && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "32px 0",
                }}
              >
                <div
                  className="animate-spin"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.18)",
                    borderTopColor: "#ffffff",
                  }}
                />
              </div>
            )}

            {!loading && apps.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                  No apps available
                </p>
              </div>
            )}

            {!loading && apps.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                }}
              >
                {apps.map((app) => {
                  const isCurrent = app.id === currentApp?.id;
                  const fallbackEmoji = ICON_FALLBACKS[app.slug] ?? DEFAULT_ICON;
                  return (
                    <AppTile
                      key={app.id}
                      app={app}
                      fallbackEmoji={fallbackEmoji}
                      isCurrent={isCurrent}
                      onClick={() => {
                        setOpen(false);
                        window.location.href = app.baseUrl;
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer — "View all apps" link */}
          <div
            style={{
              borderTop: "1px solid rgba(255, 255, 255, 0.10)",
              padding: "10px 18px",
            }}
          >
            <a
              href={viewAllHref}
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255, 255, 255, 0.85)",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "rgba(255, 255, 255, 0.85)";
              }}
            >
              View all apps
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── App tile — design-tokens.md §1.3 brand-row treatment ─────────────── */

function AppTile({
  app,
  fallbackEmoji,
  isCurrent,
  onClick,
}: {
  app: AppInfo;
  fallbackEmoji: string;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Background reads exactly off design-tokens.md §1.3:
  //   active                      → rgba(255,255,255,0.16)
  //   inactive default            → transparent (cleaner against the panel)
  //   inactive hover              → rgba(255,255,255,0.10)
  const bg = isCurrent
    ? "rgba(255, 255, 255, 0.16)"
    : hovered
    ? "rgba(255, 255, 255, 0.10)"
    : "transparent";
  const border = isCurrent
    ? "1px solid rgba(255, 255, 255, 0.35)"
    : "1px solid transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      title={app.description || app.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "10px 6px 8px",
        background: bg,
        border,
        borderRadius: 12,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        minWidth: 0,
      }}
    >
      {/* Icon — 40×40, rounded-md (per design-tokens.md §8) */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(255, 255, 255, 0.10)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {app.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.iconUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 18, lineHeight: 1 }}>{fallbackEmoji}</span>
        )}
      </div>

      {/* Label — micro/hint per design-tokens.md §6 */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "rgba(255, 255, 255, 0.85)",
          textAlign: "center",
          lineHeight: 1.2,
          width: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {app.name}
      </span>
    </button>
  );
}

/* ─── 3×3 grid trigger icon (Google-style) ──────────────────────────────── */

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="4" height="4" rx="1" />
      <rect x="8" y="2" width="4" height="4" rx="1" />
      <rect x="14" y="2" width="4" height="4" rx="1" />
      <rect x="2" y="8" width="4" height="4" rx="1" />
      <rect x="8" y="8" width="4" height="4" rx="1" />
      <rect x="14" y="8" width="4" height="4" rx="1" />
      <rect x="2" y="14" width="4" height="4" rx="1" />
      <rect x="8" y="14" width="4" height="4" rx="1" />
      <rect x="14" y="14" width="4" height="4" rx="1" />
    </svg>
  );
}
