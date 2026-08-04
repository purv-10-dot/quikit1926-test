"use client";

/**
 * Support popup shell — the panel half of the floating support launcher.
 *
 * Five-view state machine:
 *
 *   menu ──┬─→ guide     (getting-started docs)
 *          ├─→ chat      (AI Copilot, scripted KB)
 *          ├─→ request   (raise a ticket)
 *          └─→ requests  (track the tickets you raised)
 *
 * The header shows a back arrow on every view except menu. Views are
 * conditionally rendered rather than CSS-toggled, which gives the chat its
 * fresh-conversation-on-entry behaviour for free via unmount.
 *
 * Docked bottom-right above the FAB, with no backdrop: the user should be able
 * to keep reading the page they're reporting a problem about.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import type { GuideSection, KbEntry } from "@quikit/shared/supportContent";
import { SupportMenu } from "./support-menu";
import { SupportChat } from "./support-chat";
import { SupportGuide } from "./support-guide";
import { SupportRequestForm } from "./support-request-form";
import { SupportRequests } from "./support-requests";
import type { SupportView } from "./types";

export interface SupportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  guide: GuideSection[];
  kb: KbEntry[];
  greeting: string;
  apiBase: string;
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
  kb,
  greeting,
  apiBase,
  launcherRef,
  bottomPx = 96,
}: SupportPanelProps) {
  const [view, setView] = useState<SupportView>("menu");
  const panelRef = useRef<HTMLDivElement>(null);

  const titles: Record<SupportView, string> = {
    menu: "How can we help?",
    chat: `${appName} Assistant`,
    guide: "User Guide",
    request: "Raise a request",
    requests: "Your requests",
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
             viewport width minus a gutter instead of overflowing. Fixed height
             so the chat and guide scroll internally. */
          className="fixed z-[201] right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[380px] h-[560px] flex flex-col rounded-2xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
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
              {titles[view]}
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

          {view === "menu" && <SupportMenu appName={appName} onSelect={setView} />}
          {view === "guide" && <SupportGuide sections={guide} />}
          {view === "chat" && <SupportChat greeting={greeting} kb={kb} />}
          {view === "request" && <SupportRequestForm apiBase={apiBase} onClose={close} />}
          {view === "requests" && <SupportRequests apiBase={apiBase} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
