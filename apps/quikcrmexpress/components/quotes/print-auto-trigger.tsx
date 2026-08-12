"use client";

/**
 * Tiny client island for the /quotes/[id]/print?auto=1 case.
 *
 * Triggers window.print() once on mount. We wait a beat for the page to
 * paint (otherwise Chrome sometimes prints a blank page on the first call
 * before the screenshot of the layout is taken).
 */
// Deprecated: the enterprise PDF flow is now server-generated (React-PDF) and
// presented via a fullscreen preview modal. This file remains only for legacy
// deep-links to `/quotes/:id/print`.
import { useEffect } from "react";

export function PrintAutoTrigger() {
  useEffect(() => {
    // ~250ms is enough for layout + image decode for the company logo.
    // Longer than that and the user sees the page flash before the dialog.
    const t = setTimeout(() => {
      window.print();
    }, 250);
    return () => clearTimeout(t);
  }, []);
  return null;
}
