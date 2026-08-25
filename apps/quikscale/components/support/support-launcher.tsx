"use client";

/**
 * QuikScale's support launcher — a thin local shell around the shared support
 * views in `@quikit/ui/support`.
 *
 * Why this exists instead of `<SupportLauncher appSlug="quikscale" />`:
 * QuikScale already ships a full Knowledge Base at `/help` (29 chapters, PDF
 * export, figures). Re-rendering an abridged guide inside a 380px popup is
 * strictly worse than sending the user to the real thing, so "Read the guide"
 * NAVIGATES to `/help` rather than opening the panel's `guide` view. The shared
 * `SupportPanel` owns its `menu | guide | request` state internally and exposes
 * no hook to intercept that choice, hence the local shell.
 *
 * Only the shell is local. `SupportMenu`, `SupportRequestForm` and the
 * `useDraggableFab` drag behaviour are imported from `@quikit/ui/support` — no
 * forked copies, so menu copy, the ticket form and the way the FAB drags stay in
 * lockstep with every other app.
 *
 * If packages/ui ever grows a `guideHref` / `onGuideSelect` prop on
 * `SupportLauncher`, delete this file and go back to the one-liner.
 *
 * Mount ONCE, from the dashboard shell.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, X } from "lucide-react";
import { getSupportContent } from "@quikit/shared/supportContent";
import {
  SupportMenu,
  SupportRequestForm,
  useDraggableFab,
  getAnchoredPanelStyle,
  FAB_SIZE_PX,
} from "@quikit/ui/support";

/** Views this shell can show. Deliberately no `guide` — that is a route now. */
type LocalView = "menu" | "request";

/** Matches the shared launcher's `bottom-6` / `bottom-24` offsets. */
const FAB_BOTTOM_PX = 24;
const PANEL_BOTTOM_PX = 96;

const TITLES: Record<LocalView, string> = {
  menu: "How can we help?",
  request: "Raise a request",
};

export function QuikScaleSupportLauncher({
  apiBase = "/api/support/tickets",
  uploadBase = "/api/support/uploads",
}: {
  apiBase?: string;
  uploadBase?: string;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<LocalView>("menu");
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { position, isDragging, onPointerDown, didDrag } = useDraggableFab();
  const anchored = getAnchoredPanelStyle(
    position ? { ...position, size: FAB_SIZE_PX } : null,
  );

  const { appName } = getSupportContent("quikscale");

  function close() {
    setOpen(false);
    // Always reopen on the menu.
    setView("menu");
  }

  /**
   * The menu's only behavioural difference from every other app: "Read the
   * guide" leaves the widget entirely and lands on the Knowledge Base route.
   */
  function onSelect(next: "guide" | "request") {
    if (next === "guide") {
      close();
      router.push("/help");
      return;
    }
    setView("request");
  }

  // Escape steps back to the menu first, and only closes from the menu — a
  // half-typed request shouldn't vanish on a stray Escape. Same contract as
  // the shared panel.
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
  // it while open would close here and immediately reopen below.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (launcherRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
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
            style={
              anchored
                ? {
                    left: anchored.left,
                    top: anchored.top,
                    bottom: anchored.bottom,
                    maxHeight: anchored.maxHeight,
                  }
                : {
                    bottom: PANEL_BOTTOM_PX,
                    maxHeight: `calc(100vh - ${PANEL_BOTTOM_PX + 32}px)`,
                  }
            }
            /* Follows the draggable FAB via `anchored`; falls back to the
               bottom-right corner before hydration measures the viewport.
               Height follows the view: the menu is two options and should not
               leave a tall empty panel under them; the request form is fixed so
               it doesn't jump as attachments are added and removed. */
            className={`fixed z-[201] ${
              anchored ? "" : "right-4 sm:right-6"
            } w-[calc(100vw-2rem)] sm:w-[380px] flex flex-col rounded-2xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] shadow-2xl overflow-hidden ${
              view === "menu" ? "" : "h-[560px]"
            }`}
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
              <h2 className="flex-1 min-w-0 text-sm font-semibold text-white truncate">
                {TITLES[view]}
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

            {view === "menu" && (
              <SupportMenu
                appName={appName}
                onSelect={(v) => onSelect(v as "guide" | "request")}
              />
            )}
            {view === "request" && (
              <SupportRequestForm apiBase={apiBase} uploadBase={uploadBase} onClose={close} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={launcherRef}
        type="button"
        onPointerDown={onPointerDown}
        onClick={() => {
          // Swallow the click that ends a drag — dropping the button should not
          // toggle the panel.
          if (didDrag()) return;
          setOpen((o) => !o);
        }}
        aria-label={open ? "Close support panel" : "Contact support"}
        aria-expanded={open}
        title="Contact support — drag to move"
        /* `position` is null until the mount effect measures the viewport, so
           the first paint keeps the original bottom-right corner styling. */
        style={
          position
            ? { left: position.x, top: position.y, touchAction: "none" }
            : { bottom: FAB_BOTTOM_PX, touchAction: "none" }
        }
        /* Sits just under the panel (z-201) so the popup always overlaps it
           cleanly, and above page chrome like sticky table headers.
           Transitions are enumerated rather than `transition-all` — animating
           `left`/`top` would make the drag lag behind the pointer. */
        className={`fixed z-[200] ${
          position ? "" : "right-4 sm:right-6"
        } h-14 w-14 rounded-full bg-accent-600 hover:bg-accent-700 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-[transform,background-color,box-shadow] focus:outline-none focus:ring-4 focus:ring-accent-400/40 ${
          isDragging
            ? "cursor-grabbing scale-105 select-none"
            : "cursor-grab hover:scale-105 active:scale-95"
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
