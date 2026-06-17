"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";

type Placement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: Placement;
  delay?: number;
  disabled?: boolean;
  maxWidth?: number;
}

export function Tooltip({
  content, children, placement = "top", delay = 150, disabled = false, maxWidth = 220,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const show = () => {
    if (disabled || !content) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 8;
      let top = 0, left = 0;
      switch (placement) {
        case "top": top = rect.top - gap; left = rect.left + rect.width / 2; break;
        case "bottom": top = rect.bottom + gap; left = rect.left + rect.width / 2; break;
        case "left": top = rect.top + rect.height / 2; left = rect.left - gap; break;
        case "right": top = rect.top + rect.height / 2; left = rect.right + gap; break;
      }
      setCoords({ top, left });
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setCoords(null);
  };

  const translate =
    placement === "top" ? "-translate-x-1/2 -translate-y-full" :
    placement === "bottom" ? "-translate-x-1/2" :
    placement === "left" ? "-translate-x-full -translate-y-1/2" :
    "-translate-y-1/2";

  const tooltipNode = visible && coords ? (
    <div
      className={clsx(
        "fixed z-[9999] pointer-events-none rounded-lg px-3 py-1.5",
        "text-[12px] font-medium leading-snug text-white tracking-tight",
        "bg-slate-900 shadow-lg ring-1 ring-white/10",
        translate,
      )}
      style={{ top: coords.top, left: coords.left, maxWidth }}
      role="tooltip"
    >
      {content}
      <TooltipArrow placement={placement} />
    </div>
  ) : null;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex"
      >
        {children}
      </span>
      {mounted && tooltipNode ? createPortal(tooltipNode, document.body) : null}
    </>
  );
}

function TooltipArrow({ placement }: { placement: Placement }) {
  const base = "absolute w-2 h-2 bg-slate-900 rotate-45 ring-1 ring-white/10";
  const pos =
    placement === "top" ? "left-1/2 -bottom-[3px] -translate-x-1/2" :
    placement === "bottom" ? "left-1/2 -top-[3px] -translate-x-1/2" :
    placement === "left" ? "-right-[3px] top-1/2 -translate-y-1/2" :
    "-left-[3px] top-1/2 -translate-y-1/2";
  return <div className={clsx(base, pos)} />;
}
