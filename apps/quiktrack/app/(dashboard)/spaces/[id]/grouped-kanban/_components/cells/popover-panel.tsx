"use client";

import {
  ReactNode,
  RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface PopoverPanelProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  placement?: "down" | "up" | "auto";
  width?: number;
  estimatedHeight?: number;
  children: ReactNode;
}

export function PopoverPanel({
  anchorRef,
  open,
  onClose,
  align = "left",
  placement = "down",
  width = 224,
  estimatedHeight = 200,
  children,
}: PopoverPanelProps) {
  const [coords, setCoords] = useState<{ top: number; left: number; transform?: string } | null>(
    null,
  );
  const portalTarget = useMemo<HTMLElement | null>(
    () => (typeof document === "undefined" ? null : document.body),
    [],
  );

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setCoords(null);
      return;
    }
    const r = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    let goUp = placement === "up";
    if (placement === "auto") {
      goUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    }
    const top = goUp ? r.top - 4 : r.bottom + 4;
    const transform = goUp ? "translateY(-100%)" : undefined;
    const left = align === "right" ? r.right - width : r.left;
    const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    setCoords({ top, left: clampedLeft, transform });
  }, [open, align, width, placement, estimatedHeight, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      // Ignore clicks inside ANY portaled popover so nested popovers (e.g. a
      // filter panel that itself contains dropdown menus) don't close each other.
      if (target instanceof Element && target.closest("[data-portal-popover]")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScrollOrResize(e?: Event) {
      // Scrolling *inside* the panel (e.g. a long member list) must not close
      // it. The scroll listener is in capture mode so it also receives scroll
      // events from descendants — ignore those; only close when the page or
      // anchor scrolls, since the fixed panel would otherwise detach from it.
      if (e?.type === "scroll") {
        const t = e.target;
        if (t instanceof Element && t.closest("[data-portal-popover]")) return;
      }
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !coords || !portalTarget) return null;

  return createPortal(
    <div
      id="qt-popover-panel-active"
      data-portal-popover
      role="dialog"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width,
        zIndex: 60,
        transform: coords.transform,
      }}
      className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-lg py-1"
    >
      {children}
    </div>,
    portalTarget,
  );
}
