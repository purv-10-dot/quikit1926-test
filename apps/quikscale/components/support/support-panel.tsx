"use client";

/**
 * Support popup shell — the panel half of the floating support launcher.
 *
 * Four-view state machine ported from the reference Quikit Chat Support widget:
 *
 *   menu ──┬─→ guide    (getting-started docs)
 *          ├─→ chat     (AI Copilot, scripted KB)
 *          └─→ request  (raise a ticket — the one view with a real backend)
 *
 * The header shows a back arrow on every view except menu, exactly as in the
 * reference. Views are conditionally rendered rather than CSS-toggled (the
 * reference used `is-chat`/`is-guide` classes), which gives the chat its
 * fresh-conversation-on-entry behaviour for free via unmount.
 *
 * Docked bottom-right above the FAB, with no backdrop: the user should be able
 * to keep reading the page they're reporting a problem about.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import { SupportMenu } from "@/components/support/support-menu";
import { SupportChat } from "@/components/support/support-chat";
import { SupportGuide } from "@/components/support/support-guide";
import { SupportRequestForm } from "@/components/support/support-request-form";

export type SupportView = "menu" | "chat" | "guide" | "request";

interface SupportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ref of the launcher button, so an outside-click on it doesn't double-toggle. */
  launcherRef?: React.RefObject<HTMLElement | null>;
}

const TITLES: Record<SupportView, string> = {
  menu: "How can we help?",
  chat: "QuikScale Assistant",
  guide: "User Guide",
  request: "Raise a request",
};

export function SupportPanel({ open, onOpenChange, launcherRef }: SupportPanelProps) {
  const [view, setView] = useState<SupportView>("menu");
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    onOpenChange(false);
    // Always reopen on the menu, as in the reference.
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
          aria-label="QuikScale support"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          /* Anchored above the FAB (56px tall at bottom-6). On small screens it
             spans the viewport width minus a gutter instead of overflowing.
             Fixed height so the chat and guide scroll internally. */
          className="fixed z-[201] bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[380px] h-[min(560px,calc(100vh-8rem))] flex flex-col rounded-2xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
        >
          {/* Header — back arrow on every view except the menu */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-accent-600 flex-shrink-0">
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
            <h2 className="flex-1 min-w-0 text-sm font-semibold text-white truncate flex items-center gap-2">
              {TITLES[view]}
              {view === "chat" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/20 text-white flex-shrink-0">
                  AI
                </span>
              )}
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

          {view === "menu" && <SupportMenu onSelect={setView} />}
          {view === "guide" && <SupportGuide />}
          {view === "chat" && <SupportChat />}
          {view === "request" && <SupportRequestForm onClose={close} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
