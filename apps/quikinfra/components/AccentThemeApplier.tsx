"use client";

import { useEffect } from "react";
import { applyAccentColor } from "@quikit/ui/theme-applier";

/**
 * QuikInfra accent theming.
 *
 * Applies a user's saved accent colour ONLY when they have explicitly chosen
 * one. When there is no chosen colour it does nothing — so the `accent-*`
 * Tailwind classes fall back to QuikInfra's own `construction` palette (see
 * tailwind.config.ts). That keeps the default design pixel-identical to the
 * brand while still allowing per-user theming.
 *
 * `/api/settings/company` returns `accentColor: null` when the user is on the
 * shared platform default (they never picked a colour in QuikInfra), so the
 * default path here is a no-op.
 */
export function AccentThemeApplier() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/company")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const color = json?.success ? json.data?.accentColor : null;
        if (color) applyAccentColor(color);
      })
      .catch(() => {
        /* leave construction fallbacks in place */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
