"use client";

/**
 * Drag behaviour for the floating Contact Support button.
 *
 * The FAB used to be pinned to the bottom-right corner, where it can sit on top
 * of whatever the user actually needs to read (a table's last row, a sticky
 * action bar). This hook makes it a free-floating widget: press and drag it
 * anywhere, and it stays where it was dropped — clamped to the viewport so it
 * can never be parked off-screen, and remembered in `localStorage` so the
 * preference survives a reload.
 *
 * Shared by every app: `@quikit/ui/support`'s `SupportLauncher` and QuikScale's
 * local shell both call this, so drag behaviour cannot drift between apps.
 *
 * Progressive enhancement: `position` is `null` until the mount effect measures
 * the viewport. Render the original `right-*` / `bottom` corner styling while it
 * is null and there is no first-paint jump — the widget simply becomes draggable
 * once hydrated.
 *
 * Click vs drag: a press that moves less than `DRAG_THRESHOLD` px is a click and
 * opens the panel as before. Anything further is a drag and the resulting click
 * is swallowed via `didDrag()`, so dropping the button never toggles the panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
// Aliased so the DOM's global `PointerEvent` stays reachable for the window listeners.
import type { PointerEvent as ReactPointerEvent } from "react";

export interface FabPosition {
  /** Distance from the viewport left edge, in px. */
  x: number;
  /** Distance from the viewport top edge, in px. */
  y: number;
}

export interface UseDraggableFabOptions {
  /** Width/height of the FAB in px, used for clamping. Defaults to 56 (`h-14 w-14`). */
  size?: number;
  /** Minimum gap between the FAB and any viewport edge while dragging, in px. */
  margin?: number;
  /** Extra px to lift the *default* resting position off the bottom edge. */
  bottomOffset?: number;
  /** `localStorage` key for the remembered position. Pass `""` to disable persistence. */
  storageKey?: string;
  /** Set false to pin the FAB (drag disabled, clicks unaffected). */
  enabled?: boolean;
}

export interface DraggableFab {
  /** Current position, or `null` until the viewport has been measured. */
  position: FabPosition | null;
  /** True while a drag is in progress — use it to swap the cursor. */
  isDragging: boolean;
  /** Attach to the FAB's `onPointerDown`. */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  /**
   * Call first inside the FAB's `onClick`; returns true when that click is the
   * tail of a drag and should be ignored.
   */
  didDrag: () => boolean;
}

/** Movement past this (px, per axis) turns a press into a drag rather than a click. */
const DRAG_THRESHOLD = 4;
/** FAB width/height in px — `h-14 w-14`. Exported so launchers can anchor the panel to it. */
export const FAB_SIZE_PX = 56;
/** How close to a viewport edge a dragged FAB may be parked. */
const DEFAULT_MARGIN = 8;
/** Matches the original `bottom: 24` resting offset. */
const RESTING_BOTTOM_PX = 24;
/** Matches the original `right-4 sm:right-6` resting offsets. */
const RESTING_RIGHT_PX = 16;
const RESTING_RIGHT_SM_PX = 24;
/** Tailwind's `sm` breakpoint — kept in sync with the FAB/panel utility classes. */
const SM_BREAKPOINT = 640;

/** Default key. Shared across apps deliberately — one widget, one remembered spot. */
export const SUPPORT_FAB_STORAGE_KEY = "quikit:support-fab-position";

function readStored(key: string): FabPosition | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { x, y } = parsed as Partial<FabPosition>;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    // Private mode, disabled storage, or a corrupt value — fall back to the corner.
    return null;
  }
}

function writeStored(key: string, position: FabPosition) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(position));
  } catch {
    // Persistence is a nicety; a failed write must never break the widget.
  }
}

export function useDraggableFab({
  size = FAB_SIZE_PX,
  margin = DEFAULT_MARGIN,
  bottomOffset = 0,
  storageKey = SUPPORT_FAB_STORAGE_KEY,
  enabled = true,
}: UseDraggableFabOptions = {}): DraggableFab {
  const [position, setPosition] = useState<FabPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /** True once the user has dragged (or restored) a position of their own. */
  const customRef = useRef(false);
  /** Latest position, readable from event handlers without re-subscribing. */
  const positionRef = useRef<FabPosition | null>(null);
  /** Set when a click is the tail of a drag and must be swallowed. */
  const suppressClickRef = useRef(false);
  /** Tears down the window listeners for the in-flight drag. */
  const cleanupRef = useRef<(() => void) | null>(null);

  const clamp = useCallback(
    (p: FabPosition): FabPosition => {
      const maxX = Math.max(margin, window.innerWidth - size - margin);
      const maxY = Math.max(margin, window.innerHeight - size - margin);
      return {
        x: Math.min(Math.max(p.x, margin), maxX),
        y: Math.min(Math.max(p.y, margin), maxY),
      };
    },
    [margin, size],
  );

  /** The untouched bottom-right corner the FAB has always rested in. */
  const restingPosition = useCallback((): FabPosition => {
    const right = window.innerWidth >= SM_BREAKPOINT ? RESTING_RIGHT_SM_PX : RESTING_RIGHT_PX;
    return clamp({
      x: window.innerWidth - size - right,
      y: window.innerHeight - size - RESTING_BOTTOM_PX - bottomOffset,
    });
  }, [clamp, size, bottomOffset]);

  const commit = useCallback((next: FabPosition) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  // Measure once on mount: restore the remembered spot, else the default corner.
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (initialisedRef.current) return;
    initialisedRef.current = true;
    const stored = readStored(storageKey);
    if (stored) {
      customRef.current = true;
      commit(clamp(stored));
    } else {
      commit(restingPosition());
    }
  }, [storageKey, clamp, restingPosition, commit]);

  // Keep the widget inside the viewport when the window resizes. A FAB the user
  // never moved keeps tracking the corner; a dragged one is only nudged back in.
  useEffect(() => {
    function onResize() {
      if (!positionRef.current) return;
      commit(customRef.current ? clamp(positionRef.current) : restingPosition());
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp, restingPosition, commit]);

  // Drop any in-flight drag listeners if the widget unmounts mid-drag.
  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // A previous drag whose click never landed (pointer released off-target)
      // must not swallow this press.
      suppressClickRef.current = false;
      // A second pointer (multi-touch) starts a fresh drag; drop the first one's
      // listeners rather than orphaning them.
      cleanupRef.current?.();
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const grabX = e.clientX - rect.left;
      const grabY = e.clientY - rect.top;
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;
      let moved = false;

      // Listeners live on `window`, not the button: the pointer routinely leaves
      // the 56px target mid-drag, and a fast flick can leave it before the first
      // pointermove ever reaches the element.
      function onMove(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) return;
        if (!moved) {
          if (
            Math.abs(ev.clientX - startX) < DRAG_THRESHOLD &&
            Math.abs(ev.clientY - startY) < DRAG_THRESHOLD
          ) {
            return;
          }
          moved = true;
          customRef.current = true;
          setIsDragging(true);
        }
        // Suppress text selection and touch scrolling while dragging.
        ev.preventDefault();
        commit(clamp({ x: ev.clientX - grabX, y: ev.clientY - grabY }));
      }

      function onUp(ev: PointerEvent) {
        if (ev.pointerId !== pointerId) return;
        detach();
        if (!moved) return;
        suppressClickRef.current = true;
        setIsDragging(false);
        if (positionRef.current) writeStored(storageKey, positionRef.current);
      }

      // Named so `onUp` tears down *this* drag specifically, even if a second
      // pointer has since taken over `cleanupRef`.
      function detach() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (cleanupRef.current === detach) cleanupRef.current = null;
      }

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      cleanupRef.current = detach;
    },
    [enabled, clamp, commit, storageKey],
  );

  const didDrag = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return { position, isDragging, onPointerDown, didDrag };
}

/* -------------------------------------------------------------------------- */
/*  Panel placement                                                            */
/* -------------------------------------------------------------------------- */

export interface FabAnchor extends FabPosition {
  /** FAB width/height in px. */
  size: number;
}

export interface AnchoredPanelStyle {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/** Gap between the FAB and the panel it opens. */
const PANEL_GAP_PX = 16;
/** Panel gutter from the viewport edges — matches `right-4 sm:right-6` / `w-[calc(100vw-2rem)]`. */
const PANEL_MARGIN_PX = 16;
/** `sm:w-[380px]`. */
const PANEL_WIDTH_PX = 380;

/**
 * Position the support panel relative to a dragged FAB.
 *
 * Right edges are aligned so the panel reads as hanging off the button, exactly
 * like the old fixed bottom-right pairing. It opens upward when there is more
 * room above the FAB and downward otherwise, and `maxHeight` is whatever space
 * that side actually has — so a FAB dragged to the top of the screen still gets
 * a fully visible panel.
 *
 * Returns `null` on the server, where there is no viewport to measure; callers
 * fall back to the original corner-docked styling.
 */
export function getAnchoredPanelStyle(anchor: FabAnchor | null): AnchoredPanelStyle | null {
  if (!anchor || typeof window === "undefined") return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = vw >= SM_BREAKPOINT ? PANEL_WIDTH_PX : vw - PANEL_MARGIN_PX * 2;

  const maxLeft = Math.max(PANEL_MARGIN_PX, vw - width - PANEL_MARGIN_PX);
  const left = Math.min(
    Math.max(anchor.x + anchor.size - width, PANEL_MARGIN_PX),
    maxLeft,
  );

  const spaceAbove = anchor.y - PANEL_GAP_PX - PANEL_MARGIN_PX;
  const spaceBelow = vh - (anchor.y + anchor.size) - PANEL_GAP_PX - PANEL_MARGIN_PX;

  if (spaceAbove >= spaceBelow) {
    return {
      left,
      // CSS `bottom` measures from the viewport bottom to the panel's bottom edge.
      bottom: vh - anchor.y + PANEL_GAP_PX,
      maxHeight: Math.max(0, spaceAbove),
    };
  }

  return {
    left,
    top: anchor.y + anchor.size + PANEL_GAP_PX,
    maxHeight: Math.max(0, spaceBelow),
  };
}
