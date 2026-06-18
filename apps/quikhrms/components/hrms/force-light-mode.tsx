"use client";

import { useEffect } from "react";

/**
 * Forces light mode for the duration this component is mounted, then restores
 * the previous theme on unmount. Use on pre-auth / branded pages (login,
 * forgot-password, invite, candidate portal) that have their own fixed design
 * and must not follow the authenticated app's dark theme.
 */
export function ForceLightMode() {
  useEffect(() => {
    const el = document.documentElement;
    const wasDark = el.classList.contains("dark");
    el.classList.remove("dark");
    return () => {
      if (wasDark) el.classList.add("dark");
    };
  }, []);
  return null;
}
