"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemePref } from "@/lib/shared";
import { fetchUiPrefs, patchUiPrefs } from "@/lib/api";

interface ThemeContextValue {
  /** The stored preference (system | light | dark). */
  theme: ThemePref;
  /** The resolved theme actually applied (light | dark). */
  resolved: "light" | "dark";
  /** Set + persist the preference (writes through /api/me/ui-prefs). */
  setTheme: (theme: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => undefined,
});
export const useTheme = () => useContext(ThemeContext);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Resolves the per-user theme pref (default `system` → follows
 * `prefers-color-scheme`) and applies it via `[data-theme]`. No localStorage —
 * the preference lives in the UI-prefs store and is written through on change.
 */
function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [systemDark, setSystemDark] = useState(false);

  // Seed from the per-user prefs (best-effort; unauthenticated/login → system).
  useEffect(() => {
    let alive = true;
    void fetchUiPrefs()
      .then((p) => alive && setThemeState(p.theme))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Track the OS scheme while in `system` mode.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const resolved: "light" | "dark" = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", resolved);
    }
  }, [resolved]);

  const setTheme = useCallback((next: ThemePref) => {
    setThemeState(next);
    if (next === "system") setSystemDark(systemPrefersDark());
    void patchUiPrefs({ theme: next }).catch(() => undefined);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

/** SessionProvider → QueryClientProvider → ThemeProvider, per the brief. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
