"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { LeadChangeLogTimeline } from "@/components/leads/lead-change-log-timeline";

interface Props {
  leadId: string;
  leadName: string;
  open: boolean;
  onClose: () => void;
}

export function LeadChangeLogDrawer({ leadId, leadName, open, onClose }: Props) {
  // Esc closes the drawer; only attached while it's open so we don't capture
  // global Escape presses.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      role="dialog"
      aria-modal="true"
      aria-label={`Change log for ${leadName}`}
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-2xl flex-col bg-crm-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-crm-border bg-white px-5 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-crm-muted">
              Change log
            </p>
            <h2 className="truncate text-base font-semibold text-crm-text">{leadName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close change log"
            className="rounded-md p-1.5 text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-hidden p-4">
          <LeadChangeLogTimeline leadId={leadId} />
        </div>
      </aside>
    </div>
  );
}
