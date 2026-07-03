"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "qf:sidebar-collapsed";
const GROUPS_KEY = "qf:sidebar-collapsed-groups";

type SidebarContextValue = {
  /** Desktop collapsed state (persisted to localStorage). */
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  /** Mobile drawer open state (not persisted). */
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
  /** Labels of navigation groups the user has collapsed (persisted). Default = all open. */
  collapsedGroups: string[];
  toggleGroup: (label: string) => void;
  openGroup: (label: string) => void;
  /** True once the client has mounted — used to gate width transitions and avoid a hydration flash. */
  mounted: boolean;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  // Read persisted state after mount so server and first client render match.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        setCollapsedState(stored === "true");
      }
      const storedGroups = window.localStorage.getItem(GROUPS_KEY);
      if (storedGroups) {
        const parsed = JSON.parse(storedGroups) as unknown;
        if (Array.isArray(parsed)) {
          setCollapsedGroups(parsed.filter((item): item is string => typeof item === "string"));
        }
      }
    } catch {
      // localStorage may be unavailable (private mode / SSR) — ignore.
    }
    setMounted(true);
  }, []);

  const persist = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore write failures
    }
  }, []);

  const persistGroups = useCallback((groups: string[]) => {
    try {
      window.localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch {
      // ignore write failures
    }
  }, []);

  const toggleGroup = useCallback(
    (label: string) => {
      setCollapsedGroups((previous) => {
        const next = previous.includes(label) ? previous.filter((item) => item !== label) : [...previous, label];
        persistGroups(next);
        return next;
      });
    },
    [persistGroups]
  );

  const openGroup = useCallback(
    (label: string) => {
      setCollapsedGroups((previous) => {
        if (!previous.includes(label)) {
          return previous;
        }
        const next = previous.filter((item) => item !== label);
        persistGroups(next);
        return next;
      });
    },
    [persistGroups]
  );

  const setCollapsed = useCallback(
    (value: boolean) => {
      setCollapsedState(value);
      persist(value);
    },
    [persist]
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((previous) => {
      const next = !previous;
      persist(next);
      return next;
    });
  }, [persist]);

  const value = useMemo<SidebarContextValue>(
    () => ({ collapsed, setCollapsed, toggleCollapsed, mobileOpen, setMobileOpen, collapsedGroups, toggleGroup, openGroup, mounted }),
    [collapsed, setCollapsed, toggleCollapsed, mobileOpen, collapsedGroups, toggleGroup, openGroup, mounted]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
