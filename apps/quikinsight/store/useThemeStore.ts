import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

// Persisted via a first-party cookie so the choice survives refresh and is
// applied server-side in app/layout.tsx (no flash of the wrong theme).
function readCookieTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").includes("theme=dark");
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: readCookieTheme(),
  toggle: () =>
    set((s) => {
      const next = !s.isDark;
      if (typeof document !== "undefined") {
        document.body.classList.toggle("dark", next);
        document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
      }
      return { isDark: next };
    }),
}));
