"use client";

/**
 * Toaster — global notification region. Mount once at the app root.
 *
 * Subscribes to the `toast` emitter in [src/lib/toast.ts](../lib/toast.ts).
 * Renders a fixed top-right stack with auto-dismiss timers per toast.
 *
 * Each toast shows a thin progress bar that drains over the duration, so
 * users can see the auto-dismiss is in progress. Hovering the toast pauses
 * the timer (and the bar) so they can read longer; leaving resumes.
 */

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  X,
} from "lucide-react";
import {
  dismissToast,
  subscribeToasts,
  type ToastRecord,
  type ToastVariant,
} from "@/lib/toast";

const VARIANT_STYLES: Record<
  ToastVariant,
  { ring: string; icon: typeof CheckCircle2; iconClass: string; bar: string }
> = {
  success: {
    ring: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    bar: "bg-emerald-500",
  },
  error: {
    ring: "border-red-200 bg-red-50 text-red-900",
    icon: XCircle,
    iconClass: "text-red-600",
    bar: "bg-red-500",
  },
  warning: {
    ring: "border-amber-200 bg-amber-50 text-amber-900",
    icon: AlertTriangle,
    iconClass: "text-amber-600",
    bar: "bg-amber-500",
  },
  info: {
    ring: "border-sky-200 bg-sky-50 text-sky-900",
    icon: Info,
    iconClass: "text-sky-600",
    bar: "bg-sky-500",
  },
};

export function Toaster() {
  const [items, setItems] = useState<ToastRecord[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
    >
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastRecord }) {
  const { ring, icon: Icon, iconClass, bar } = VARIANT_STYLES[toast.variant];
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const startedAtRef = useRef(Date.now());

  // Drive auto-dismiss with a setTimeout that respects pause-on-hover.
  // We track elapsed time so resuming after a pause subtracts what was
  // already shown rather than restarting the full duration.
  useEffect(() => {
    if (toast.duration <= 0) return;

    if (paused) {
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current),
      );
      return;
    }

    startedAtRef.current = Date.now();
    const timer = window.setTimeout(
      () => dismissToast(toast.id),
      remainingRef.current,
    );
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, paused]);

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg border px-4 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur-sm animate-[slideIn_180ms_ease-out] ${ring}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`} />
      <div className="min-w-0 flex-1">
        {toast.title ? (
          <div className="text-sm font-semibold leading-tight">{toast.title}</div>
        ) : null}
        <div className="text-sm leading-snug">{toast.message}</div>
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        className="shrink-0 rounded p-0.5 text-current/70 transition hover:bg-black/5 hover:text-current"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
      {toast.duration > 0 ? (
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-0.5 ${bar}`}
          style={{
            animation: `toastProgress ${toast.duration}ms linear forwards`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      ) : null}
    </div>
  );
}
