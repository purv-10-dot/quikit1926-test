"use client";

import { useEffect, useRef } from "react";

/**
 * Re-run `revalidate` when the user returns to the tab/window — on window
 * `focus` and on `visibilitychange` → visible.
 *
 * Closes the "loads once, never revalidates" gap (the C10 family): plain
 * fetch-on-mount pages don't refetch after a mutation made on another page or
 * tab, so an already-open view goes stale (e.g. My Assets still showing a
 * just-returned asset). App Router remounts on route navigation, so this
 * specifically covers the same-tab-already-mounted and tab-refocus cases.
 *
 * - Does NOT fire on mount — the page's own effect already does the first load.
 * - Debounced so the focus + visibility events that both fire on tab return
 *   only trigger one refetch.
 * - Always reads the latest `revalidate` via a ref, so listeners aren't
 *   re-bound when the callback identity changes.
 */
export function useRevalidateOnFocus(revalidate: () => unknown, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const cb = useRef(revalidate);
  cb.current = revalidate;

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const run = () => {
      const now = Date.now();
      if (now - last < 800) return; // collapse focus+visibility double-fire
      last = now;
      cb.current();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
