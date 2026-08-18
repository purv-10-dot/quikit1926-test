"use client";

import type { ReactNode } from "react";

/**
 * Footer row for QuikTest right-panels.
 *
 * Why this exists: `RightPanelFooter` pins its actions to the panel's bottom-RIGHT
 * corner, which is exactly where a floating support-chat bubble sits. The bubble
 * is injected by an external widget (not our code, so we cannot restyle or move
 * it) and it covered the Save/Create button — the single most important control on
 * the form.
 *
 * The fix keeps the primary action out of that corner instead of fighting the
 * bubble's z-index: actions are LEFT-aligned, and a reserved gutter on the right
 * guarantees clearance even when the bubble is present. `pb` adds bottom padding
 * for the same reason on short screens.
 *
 * Modifying `packages/ui` is not permitted for this app (CLAUDE.md rule 2), so
 * this wrapper lives here.
 *
 * TODO(integration): upstream a `footerAlign="left"` option (or bubble-safe
 * gutter) to @quikit/ui's RightPanelFooter — every app with a floating widget has
 * this collision.
 */
export function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full items-center gap-2 pb-1 pr-16 sm:pr-20">
      {children}
    </div>
  );
}
