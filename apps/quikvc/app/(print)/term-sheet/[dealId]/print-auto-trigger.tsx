"use client";

import { useEffect } from "react";

/**
 * Triggers the browser print dialog once the page is fully laid out.
 *
 * `?auto=0` in the URL disables auto-print (useful for previewing the
 * print stylesheet without the dialog popping). Otherwise we wait one
 * animation frame so fonts + images settle before printing.
 */
export default function PrintAutoTrigger() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") === "0") return;

    const id = window.setTimeout(() => {
      window.print();
    }, 250);

    return () => window.clearTimeout(id);
  }, []);

  return null;
}
