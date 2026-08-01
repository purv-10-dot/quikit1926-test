"use client";

/**
 * Floating support launcher — a fixed bottom-right FAB plus the Contact Support
 * popup it anchors, mounted once globally from dashboard-shell.
 *
 * Replaces the earlier header icon so support follows the familiar chat-widget
 * placement. Deliberately unconditional: a user locked out of a module must
 * still be able to report that they are locked out, so this is never gated
 * behind a feature flag or an RBAC permission.
 */

import { useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { SupportPanel } from "@/components/support/support-panel";

export function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <SupportPanel open={open} onOpenChange={setOpen} launcherRef={launcherRef} />

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support panel" : "Contact support"}
        aria-expanded={open}
        title="Contact support"
        /* Sits just under the panel (z-201) so the popup always overlaps it
           cleanly, and above page chrome like the sticky table headers. */
        className="fixed z-[200] bottom-6 right-4 sm:right-6 h-14 w-14 rounded-full bg-accent-600 hover:bg-accent-700 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-accent-400/40"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
