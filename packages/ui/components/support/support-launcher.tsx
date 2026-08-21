"use client";

/**
 * Floating support launcher — a draggable FAB plus the Contact Support popup it
 * anchors. Mount ONCE per app, from the dashboard shell.
 *
 * The FAB starts in the bottom-right corner and can be dragged anywhere on
 * screen; `useDraggableFab` clamps it to the viewport and remembers where it was
 * dropped. The panel follows it. See `use-draggable-fab.ts`.
 *
 * Deliberately unconditional: a user locked out of a module must still be able
 * to report that they are locked out, so this is never gated behind a feature
 * flag or an RBAC permission.
 *
 * Usage — one line per app, everything else is looked up from the slug:
 *
 *   import { SupportLauncher } from "@quikit/ui/support";
 *   <SupportLauncher appSlug="quikcrm" />
 *
 * The guide sections come from `@quikit/shared/supportContent`, keyed by that
 * slug. An app with no bespoke content there still gets a working widget (a
 * generic guide), so shipping support in a new app never blocks on writing its
 * copy first.
 */

import { useMemo, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { getSupportContent, type GuideSection } from "@quikit/shared/supportContent";
import { SupportPanel } from "./support-panel";
import { FAB_SIZE_PX, useDraggableFab } from "./use-draggable-fab";

export interface SupportLauncherProps {
  /** App registry slug, e.g. "quikcrm". Selects the guide content. */
  appSlug: string;
  /** Override the product name shown in the panel header. */
  appName?: string;
  /** Override the guide sections for this app. */
  guide?: GuideSection[];
  /**
   * Ticket endpoint. Defaults to `/api/support/tickets` — override only for an
   * app whose API lives under a version prefix (e.g. QuikFinance's `/api/v1`).
   */
  apiBase?: string;
  /**
   * Attachment upload endpoint. Defaults to `/api/support/uploads` — override
   * alongside `apiBase` for an app whose API lives under a version prefix.
   */
  uploadBase?: string;
  /**
   * Extra pixels to lift the FAB (and the panel above it) off the bottom edge.
   *
   * For apps that already own the bottom-right corner — QuikFinance's AiDock
   * sits at `bottom-5 right-5` — so the two buttons stack instead of covering
   * each other. Defaults to 0. Applies to the FAB's default resting spot only;
   * once the user drags it, their position wins.
   */
  bottomOffset?: number;
  /** Set false to pin the FAB to its corner (drag disabled). Defaults to draggable. */
  draggable?: boolean;
}

/** Default distance from the viewport bottom, matching `bottom-6` / `bottom-24`. */
const FAB_BOTTOM_PX = 24;
const PANEL_BOTTOM_PX = 96;

export function SupportLauncher({
  appSlug,
  appName,
  guide,
  apiBase = "/api/support/tickets",
  uploadBase = "/api/support/uploads",
  bottomOffset = 0,
  draggable = true,
}: SupportLauncherProps) {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const { position, isDragging, onPointerDown, didDrag } = useDraggableFab({
    bottomOffset,
    enabled: draggable,
  });

  const content = useMemo(() => {
    const base = getSupportContent(appSlug);
    return {
      appName: appName ?? base.appName,
      guide: guide ?? base.guide,
    };
  }, [appSlug, appName, guide]);

  return (
    <>
      <SupportPanel
        open={open}
        onOpenChange={setOpen}
        appName={content.appName}
        guide={content.guide}
        apiBase={apiBase}
        uploadBase={uploadBase}
        launcherRef={launcherRef}
        bottomPx={PANEL_BOTTOM_PX + bottomOffset}
        anchor={position ? { ...position, size: FAB_SIZE_PX } : null}
      />

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
        title={draggable ? "Contact support — drag to move" : "Contact support"}
        /* `position` is null until the mount effect measures the viewport, so
           the first paint keeps the original bottom-right corner styling and
           there is no jump on hydration. `touch-action: none` lets a finger drag
           the FAB instead of scrolling the page under it — only worth paying
           when the FAB is actually draggable. */
        style={{
          ...(position
            ? { left: position.x, top: position.y }
            : { bottom: FAB_BOTTOM_PX + bottomOffset }),
          ...(draggable ? { touchAction: "none" as const } : {}),
        }}
        /* Sits just under the panel (z-201) so the popup always overlaps it
           cleanly, and above page chrome like sticky table headers.
           Transitions are enumerated rather than `transition-all` — animating
           `left`/`top` would make the drag lag behind the pointer. */
        className={`fixed z-[200] ${position ? "" : "right-4 sm:right-6"} h-14 w-14 rounded-full bg-accent-600 hover:bg-accent-700 text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-[transform,background-color,box-shadow] focus:outline-none focus:ring-4 focus:ring-accent-400/40 ${
          isDragging
            ? "cursor-grabbing scale-105 select-none"
            : `${draggable ? "cursor-grab" : ""} hover:scale-105 active:scale-95`
        }`}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
