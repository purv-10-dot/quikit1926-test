"use client";

/**
 * Reads the signed-in user's persisted `themeMode` from
 * `/api/settings/company` once on mount and pushes it into next-themes.
 *
 * Mounted in the dashboard layout. (Accent color is not synced here —
 * QuikTrack pins a fixed blue brand accent via `--accent-*` in globals.css
 * and does not mount the shared ThemeApplier.) The
 * next-themes provider already handles class injection on <html> and
 * cross-tab sync via localStorage; this component closes the loop by
 * making the DB the source of truth on first load.
 */

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { THEME_MODES, type ThemeMode } from "@/lib/validation/settings";

const VALID = new Set<string>(THEME_MODES);

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && VALID.has(value);
}

export function ThemeSync() {
  const { setTheme } = useTheme();
  const { status } = useSession();
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    if (status !== "authenticated") return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/settings/company", {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          success?: boolean;
          data?: { themeMode?: string | null };
        };
        if (!json.success) return;
        const mode = json.data?.themeMode;
        if (isThemeMode(mode)) {
          setTheme(mode);
        }
      } catch {
        // Network errors are non-fatal — next-themes keeps the last
        // localStorage value, so the user still sees a sensible theme.
      } finally {
        hydrated.current = true;
      }
    })();

    return () => controller.abort();
  }, [status, setTheme]);

  return null;
}
