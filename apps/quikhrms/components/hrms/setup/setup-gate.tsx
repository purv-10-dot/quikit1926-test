"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { LogOut, ListChecks } from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import type { HrmsSetupProgress } from "@/lib/services/hrms-setup";
import { SetupChecklist } from "@/components/hrms/setup/setup-checklist";

/**
 * Route prefixes an admin may reach while setup is incomplete, so they can
 * actually finish the checklist without deadlocking behind the overlay.
 * Everything under Settings and Payroll is allowed (that's where all org
 * configuration lives); every other module stays blocked.
 */
const ALLOWED_PREFIXES = ["/settings", "/payroll"];

function isAllowedPath(pathname: string): boolean {
  return ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

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

  // Transparent until we know the user is an admin with incomplete setup.
  if (!isAdmin || configLoading) return null;

  const progress = data?.data;
  if (isLoading || !progress || progress.setupCompleted) return null;

  const onAllowedPath = isAllowedPath(pathname);

  // Non-blocking reminder shown when the CORE (required) items are done but
  // recommended items remain, OR while the admin is on a setup page. The app is
  // usable in both cases — only incomplete core items hard-lock (below).
  if (progress.coreCompleted || onAllowedPath) {
    return (
      <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-lg dark:border-white/10 dark:bg-[#111a2e]">
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
      </div>
    );
  }

  // Core items incomplete + on a blocked page → full blocking overlay.
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hrms-setup-title"
    >
      <div className="my-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#111a2e]">
        <div id="hrms-setup-title">
          <SetupChecklist
            items={progress.items}
            completedCount={progress.completedCount}
            totalCount={progress.totalCount}
          />
        </div>

        <div className="mt-6 flex items-center justify-center border-t border-gray-100 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:underline dark:text-gray-500 dark:hover:text-gray-300"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
