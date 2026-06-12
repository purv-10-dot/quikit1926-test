"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { LogActivityModal } from "@/components/activities/log-activity-modal";
import { usePermissions } from "@/hooks/use-permissions";

/**
 * Global "Log activity" control — available from the top bar on every dashboard page
 * when the user can create activities (enterprise CRM pattern).
 */
export function GlobalLogActivity() {
  const { can } = usePermissions();
  const canCreate = can("activities", "create");
  const canViewLeads = can("leads", "view");

  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!canCreate) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-1.5 rounded-lg border border-crm-border bg-white px-3 text-sm font-medium text-accent-700 transition hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:inline-flex"
        title="Log activity"
        data-testid="global-log-activity"
      >
        <Activity size={16} />
        Log activity
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-crm-muted transition hover:bg-crm-panel hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:hidden"
        title="Log activity"
        aria-label="Log activity"
      >
        <Activity size={18} />
      </button>
      <LogActivityModal
        key={refreshKey}
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          setRefreshKey((k) => k + 1);
          setOpen(false);
        }}
        canViewLeads={canViewLeads}
      />
    </>
  );
}
