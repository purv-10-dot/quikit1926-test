"use client";

import { useCallback, useState } from "react";

/**
 * Like `useState`, but the value is persisted to `sessionStorage` under `key`
 * so it survives a full page refresh (and is restored on the next mount) for
 * the lifetime of the browser-tab session. Cleared when the tab/window closes.
 *
 * Used for filter state that should "stick" while a user works (the shared
 * owner/year/quarter filter and the WWW status filter) without leaking across
 * sessions the way `localStorage` would.
 *
 * SSR-safe: on the server (`window` undefined) it returns `initial`; the stored
 * value is only read in the browser. In QuikScale every consumer sits behind
 * `SessionGuard` (client-gated), so there is no server-rendered, value-dependent
 * markup to hydrate-mismatch against.
 *
 * Note: the setter takes a concrete value (not a functional updater) to mirror
 * the plain `(v: T) => void` setters already used in FilterContext.
 */
export function useSessionState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* quota / private-mode / SSR — in-memory value still updates */
      }
    },
    [key],
  );

  return [value, set];
}
