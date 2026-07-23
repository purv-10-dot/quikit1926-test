"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, IconButton, LayoutGrid, Popover, Spinner } from "@/components/ui";
import { useTheme } from "@/app/providers";

interface SwitcherApp {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  iconUrl?: string | null;
  baseUrl: string;
}

interface SwitcherResponse {
  success: boolean;
  data: SwitcherApp[];
  quikitUrl: string | null;
}

/**
 * In-app App Library switcher — the standard cross-app nav affordance every
 * QuikIT app carries. Fetches the visibility-filtered `/api/apps/switcher`
 * list and hard-navigates to the chosen app's origin.
 *
 * Icons are THEME-AWARE (matches quiktrack/quikscale): every app ships a themed
 * monogram pair in the launcher's /app-icons (`<slug>.svg` = dark badge for
 * light UI, `<slug>-light.svg` = white badge for dark UI). We resolve them from
 * the launcher's absolute origin (`quikitUrl`) so we don't have to bundle 40
 * icons here, and swap the variant on QuikChat's own `resolved` theme.
 */
export function AppSwitcher() {
  const { resolved } = useTheme();
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<SwitcherApp[] | null>(null);
  const [quikitUrl, setQuikitUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/apps/switcher", { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as SwitcherResponse;
      setApps(json.data ?? []);
      setQuikitUrl(json.quikitUrl ?? null);
    } catch {
      setError(true);
      setApps([]);
    }
  }, []);

  // Fetch lazily on first open.
  useEffect(() => {
    if (open && apps === null) void load();
  }, [open, apps, load]);

  const launcherUrl = (
    quikitUrl ??
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  // Icons are served SAME-ORIGIN from this app's own public/app-icons (bundled,
  // like every other app) — never cross-origin from the launcher, which is
  // unreliable (CSP) and caused a broken-image → fallback reload loop.
  // Dark UI → white monogram (`-light.svg`); light UI → brand/dark badge (`<slug>.svg`).
  const iconFor = (slug: string) =>
    `/app-icons/${slug}${resolved === "dark" ? "-light" : ""}.svg`;

  const go = (url: string) => {
    if (url) window.location.href = url;
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="top"
      label="Switch apps"
      trigger={
        <span className="qc-rail__navbtn">
          <IconButton label="Apps" onClick={() => setOpen((v) => !v)}>
            <LayoutGrid size={18} />
          </IconButton>
        </span>
      }
    >
      <div className="qc-appswitcher" role="menu" aria-label="Your apps">
        <div className="qc-appswitcher__title">Your apps</div>
        {apps === null ? (
          <div className="qc-appswitcher__loading">
            <Spinner />
          </div>
        ) : apps.length === 0 ? (
          <p className="qc-appswitcher__empty">
            {error ? "Couldn’t load your apps." : "No other apps available."}
          </p>
        ) : (
          <div className="qc-appswitcher__grid">
            {apps.map((app) => (
              <button
                key={app.id}
                type="button"
                className="qc-appswitcher__app"
                onClick={() => go(app.baseUrl)}
                disabled={!app.baseUrl}
                title={app.description ?? app.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={iconFor(app.slug)}
                  alt=""
                  className="qc-appswitcher__icon"
                  onError={(e) => {
                    // Non-looping fallback: detach the handler FIRST so a failed
                    // fallback can never re-trigger it (the previous version
                    // re-assigned src on every error → infinite reload loop),
                    // then hide the image and show the letter monogram once.
                    const img = e.currentTarget;
                    img.onerror = null;
                    img.style.display = "none";
                    img.nextElementSibling?.classList.remove("qc-hidden");
                  }}
                />
                <span className="qc-appswitcher__icon qc-appswitcher__icon--fallback qc-hidden">
                  {app.name.charAt(0)}
                </span>
                <span className="qc-appswitcher__name">{app.name}</span>
              </button>
            ))}
          </div>
        )}
        {quikitUrl ? (
          <a className="qc-appswitcher__all" href={`${launcherUrl}/apps`}>
            <ExternalLink size={14} /> All apps
          </a>
        ) : null}
      </div>
    </Popover>
  );
}
