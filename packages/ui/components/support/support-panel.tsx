"use client";

/**
 * Support popup shell — the panel half of the floating support launcher.
 *
 * Three-view state machine:
 *
 *   menu ──┬─→ guide    (getting-started docs)
 *          └─→ request  (raise a ticket)
 *
 * The header shows a back arrow on every view except menu. Views are
 * conditionally rendered rather than CSS-toggled, so leaving a view discards
 * its state — a half-typed request doesn't survive a trip to the guide.
 *
 * Docked bottom-right above the FAB, with no backdrop: the user should be able
 * to keep reading the page they're reporting a problem about.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import type { GuideSection } from "@quikit/shared/supportContent";
import { SupportMenu } from "./support-menu";
import { SupportGuide } from "./support-guide";
import { SupportRequestForm } from "./support-request-form";
import type { SupportView } from "./types";

export interface SupportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  guide: GuideSection[];
  apiBase: string;
  /** Attachment upload endpoint, e.g. `/api/support/uploads`. */
  uploadBase: string;
  /** Ref of the launcher button, so an outside-click on it doesn't double-toggle. */
  launcherRef?: React.RefObject<HTMLElement | null>;
  /** Distance from the viewport bottom, in px. Set by the launcher so the
   *  panel clears the FAB even when the FAB is itself offset. */
  bottomPx?: number;
}

export function SupportPanel({
  open,
  onOpenChange,
  appName,
  guide,
  apiBase,
  uploadBase,
  launcherRef,
  bottomPx = 96,
}: SupportPanelProps) {
  const [view, setView] = useState<SupportView>("menu");
  const panelRef = useRef<HTMLDivElement>(null);

  const titles: Record<SupportView, string> = {
    menu: "How can we help?",
    guide: "User Guide",
    request: "Raise a request",
  };

  function close() {
    onOpenChange(false);
    // Always reopen on the menu.
    setView("menu");
  }

  // Escape: step back to the menu first, only close from the menu itself — a
  // half-typed request shouldn't vanish on a stray Escape. Registered only
  // while open so it never competes with other Escape handlers on the page.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (view === "menu") close();
      else setView("menu");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  // Outside-click closes. The launcher button is excluded, otherwise clicking
  // it while open would close here and immediately reopen in the launcher.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (launcherRef?.current?.contains(target)) return;
      close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, launcherRef]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label={`${appName} support`}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{ bottom: bottomPx, maxHeight: `calc(100vh - ${bottomPx + 32}px)` }}
          /* Anchored above the FAB (56px tall). On small screens it spans the
             viewport width minus a gutter instead of overflowing.
             Height follows the VIEW rather than being fixed:
               - menu    → auto, so the short option list doesn't leave a big
                           empty panel under it (it did when the menu dropped
                           from four options to two);
               - guide   → tall, it's long-form content that must scroll;
               - request → tall enough that the form doesn't jump in height as
                           attachments are added and removed.
             `maxHeight` still caps everything to the viewport, and the inner
             views own their scrolling via `flex-1 overflow-y-auto`. */
          className={`fixed z-[201] right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[380px] flex flex-col rounded-2xl bg-[var(--color-bg-primary,#FFFFFF)] border border-[var(--color-border,#E2E8F0)] shadow-2xl overflow-hidden ${
            view === "menu" ? "" : "h-[560px]"
          }`}
        >
          {/* Header — back arrow on every view except the menu */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border,#E2E8F0)] bg-accent-600 flex-shrink-0">
            {view !== "menu" && (
              <button
                type="button"
                onClick={() => setView("menu")}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors flex-shrink-0"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="flex-1 min-w-0 text-sm font-semibold text-white truncate">
              {titles[view]}
            </h2>
            <button
              type="button"
              onClick={close}
              className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors flex-shrink-0"
              aria-label="Close support panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {view === "menu" && <SupportMenu appName={appName} onSelect={setView} />}
          {view === "guide" && <SupportGuide sections={guide} />}
          {view === "request" && (
            <SupportRequestForm apiBase={apiBase} uploadBase={uploadBase} onClose={close} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
