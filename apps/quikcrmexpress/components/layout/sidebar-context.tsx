"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  /** Desktop-only icon-only mode. Persisted to localStorage. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Off-canvas drawer state used on `<lg` viewports. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);
const STORAGE_KEY = "quikcrm.sidebar.collapsed";
/** Tailwind's `lg` breakpoint. Below this, the sidebar starts collapsed by
 * default on narrow screens, and the leads/accounts tables need every available
 * pixel. Users who toggle the sidebar persist their choice in localStorage and
 * override the auto-default. */
const AUTO_COLLAPSE_BREAKPOINT_PX = 1024;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1" || stored === "0") {
        setCollapsed(stored === "1");
        return;
      }
      // No saved preference yet — auto-collapse on narrow desktops.
      if (window.innerWidth < AUTO_COLLAPSE_BREAKPOINT_PX) {
        setCollapsed(true);
      }
    } catch {
      // ignore — private mode / disabled storage
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, toggleCollapsed, mobileOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}
