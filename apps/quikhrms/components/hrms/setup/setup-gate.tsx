"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, X } from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import type { HrmsSetupProgress } from "@/lib/services/hrms-setup";
import { SetupChecklist } from "@/components/hrms/setup/setup-checklist";

/**
 * Route prefixes an admin may reach while setup is incomplete, so they can
 * actually finish the checklist without deadlocking behind the overlay.
 * Everything under Settings and Payroll is allowed (that's where most org
 * configuration lives), plus /leaves/policies since the leaveTypes/leaveGroups
 * checklist items live there; every other module stays blocked. Any checklist
 * item's `href` MUST resolve under one of these prefixes, or the takeover
 * re-covers the page the instant "Set up" navigates there.
 */
const ALLOWED_PREFIXES = ["/settings", "/payroll", "/leaves/policies"];

function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// Remembers whether the full-page takeover was showing, purely so a page
// refresh can hold a placeholder instead of flashing the dashboard behind it
// while /setup/status re-fetches (React Query's cache is empty on a fresh
// load, so `isLoading` is briefly true again on every refresh).
const TAKEOVER_FLAG_KEY = "hrms:setupTakeoverActive";

/**
 * First-run setup gate. For org admins only (permissions include "*"), blocks
 * the app behind a non-dismissible checklist until Departments, Locations, an
 * Approval chain, and Payroll setup are complete. Renders nothing for
 * non-admins, while loading, or once setup is done.
 */
export function SetupGate() {
  const api = useApiClient();
  const pathname = usePathname();
  const { permissions, isLoading: configLoading } = useDashboardConfig();
  const isAdmin = permissions.includes("*");

  // Once setup is complete we STOP polling — no point re-hitting the API on
  // every page/focus for the rest of the session.
  const [done, setDone] = useState(false);
  const active = isAdmin && !done;

  // Read once on mount (client-only) — if the takeover was showing before
  // this refresh, hold its place while we re-check instead of revealing the
  // dashboard underneath for a couple seconds.
  const [wasShowingTakeover, setWasShowingTakeover] = useState(false);
  useEffect(() => {
    setWasShowingTakeover(localStorage.getItem(TAKEOVER_FLAG_KEY) === "1");
  }, []);

  // Voluntary re-open of the checklist from the compact reminder (e.g. after
  // finishing a step on /settings, there was previously no way back to see
  // progress / jump to the next step). Resets on navigation so it doesn't
  // linger once the admin moves to a different setup page.
  const [manuallyOpen, setManuallyOpen] = useState(false);
  useEffect(() => {
    setManuallyOpen(false);
  }, [pathname]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["hrms", "setup", "status"],
    queryFn: () => api.get<HrmsSetupProgress>("/api/v1/hrms/setup/status"),
    enabled: active,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: active,
  });

  // Latch "done" as soon as the API reports completion → the query disables and
  // no further calls fire this session.
  useEffect(() => {
    if (data?.data?.setupCompleted) setDone(true);
  }, [data]);

  // While setup is still incomplete, re-check when the admin moves between pages
  // (e.g. after saving a department) so the checklist reflects the latest state.
  useEffect(() => {
    if (active) void refetch();
  }, [pathname, active, refetch]);

  // Keep the "was the takeover showing" flag in sync once we have a definitive
  // answer, so the *next* refresh knows whether to hold the placeholder.
  useEffect(() => {
    if (configLoading || !isAdmin || isLoading) return;
    const progress = data?.data;
    const isTakeover = !!progress && !progress.setupCompleted && !progress.coreCompleted && !isAllowedPath(pathname);
    if (isTakeover) localStorage.setItem(TAKEOVER_FLAG_KEY, "1");
    else localStorage.removeItem(TAKEOVER_FLAG_KEY);
  }, [configLoading, isAdmin, isLoading, data, pathname]);

  // Still figuring out admin/permission or setup status — if the takeover was
  // showing before this refresh, hold its place instead of flashing the
  // dashboard underneath while we re-check.
  if (configLoading) return wasShowingTakeover ? <TakeoverPlaceholder /> : null;
  if (!isAdmin) return null;

  const progress = data?.data;
  if (isLoading || !progress) return wasShowingTakeover ? <TakeoverPlaceholder /> : null;
  if (progress.setupCompleted) return null;

  const onAllowedPath = isAllowedPath(pathname);

  // Non-blocking reminder shown when the CORE (required) items are done but
  // recommended items remain, OR while the admin is on a setup page. The app is
  // usable in both cases — only incomplete core items hard-lock (below).
  if (progress.coreCompleted || onAllowedPath) {
    // Re-opened voluntarily — same checklist overlay, but with a close button
    // since nothing is being enforced here (unlike the hard takeover below).
    if (manuallyOpen) {
      return (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Finish setting up QuikHRMS"
        >
          <button
            type="button"
            onClick={() => setManuallyOpen(false)}
            aria-label="Close setup checklist"
            className="fixed top-4 right-4 z-[110] flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-500 shadow-md transition-colors hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:bg-[#111a2e] dark:text-gray-400 dark:hover:text-white"
          >
            <X size={16} />
          </button>
          <SetupChecklist
            items={progress.items}
            completedCount={progress.completedCount}
            totalCount={progress.totalCount}
          />
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setManuallyOpen(true)}
        aria-label="View setup checklist"
        className="fixed bottom-4 right-4 z-[90] flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-lg transition-colors hover:border-accent-200 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:border-white/10 dark:bg-[#111a2e]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
          <ListChecks size={18} />
        </div>
        <div className="text-sm">
          <p className="font-medium text-gray-900 dark:text-white">
            Setup {progress.completedCount}/{progress.totalCount}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {progress.coreCompleted
              ? "A few recommended steps are still pending."
              : "Finish the required steps to unlock HRMS."}
          </p>
        </div>
      </button>
    );
  }

  // Core items incomplete + on a blocked page → full-page setup takeover.
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Finish setting up QuikHRMS"
    >
      <SetupChecklist
        items={progress.items}
        completedCount={progress.completedCount}
        totalCount={progress.totalCount}
      />
    </div>
  );
}

/** Same full-screen overlay shell as the takeover, shown while /setup/status re-fetches on a refresh. */
function TakeoverPlaceholder() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-50 dark:bg-[#0b1220]"
      role="dialog"
      aria-modal="true"
      aria-label="Finish setting up QuikHRMS"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-200 border-t-accent-600 dark:border-white/10 dark:border-t-accent-400" />
    </div>
  );
}
