"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

/**
 * Global "Log activity" control — available from the top bar on every dashboard page
 * when the user can create activities (enterprise CRM pattern).
 *
 * Navigates to the dedicated /activities/log page (the composer is no longer a
 * modal). No record context here — the standalone composer opens.
 */
export function GlobalLogActivity() {
  const { can } = usePermissions();
  const canCreate = can("activities", "create");

  if (!canCreate) return null;

  return (
    <>
      <Link
        href="/activities/log"
        className="hidden h-9 items-center gap-1.5 rounded-lg border border-crm-border bg-white px-3 text-sm font-medium text-accent-700 transition hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:inline-flex"
        title="Log activity"
        data-testid="global-log-activity"
      >
        <Activity size={16} />
        Log activity
      </Link>
      <Link
        href="/activities/log"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-crm-muted transition hover:bg-crm-panel hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:hidden"
        title="Log activity"
        aria-label="Log activity"
      >
        <Activity size={18} />
      </Link>
    </>
  );
}
