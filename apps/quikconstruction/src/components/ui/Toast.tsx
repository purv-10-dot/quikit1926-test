"use client";

/**
 * Minimal toast system.
 *
 * Self-mounting: the first call to `useToast()` mounts a host portal onto
 * `document.body` if one isn't already there. No `<ToastProvider>` wrapper
 * is required, which keeps the API identical to the finance/approvals pages
 * that import this hook directly without any layout-level setup.
 *
 * API:
 *   const toast = useToast();
 *   toast.success("Saved");
 *   toast.error("Something went wrong");
 *   toast.info("Heads up");
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, AlertTriangle, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

interface ToastEntry {
  id: number;
  tone: ToastTone;
  message: string;
}

// ─── Singleton store ────────────────────────────────────────────────

let nextId = 1;
let toasts: ToastEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function push(tone: ToastTone, message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, tone, message }];
  emit();
  // auto-dismiss after 4s — long enough to read, short enough to not pile up
  setTimeout(() => dismiss(id), 4000);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => toasts;
const getServerSnapshot = () => toasts;

// ─── Hook ───────────────────────────────────────────────────────────

export function useToast() {
  // Mount the host once per page. Multiple components calling useToast()
  // share the same singleton host — only the first call actually mounts.
  useEffect(() => {
    ensureHostMounted();
  }, []);

  return {
    success: (msg: string) => push("success", msg),
    error: (msg: string) => push("error", msg),
    info: (msg: string) => push("info", msg),
  };
}

// ─── Host (singleton portal target) ─────────────────────────────────

let hostMounted = false;

function ensureHostMounted() {
  if (typeof window === "undefined") return;
  if (hostMounted) return;
  hostMounted = true;
  // Use a dynamic import so React DOM root creation only happens client-side
  // and only when at least one toast hook is in use.
  import("react-dom/client").then(({ createRoot }) => {
    const el = document.createElement("div");
    el.setAttribute("data-toast-host", "");
    document.body.appendChild(el);
    createRoot(el).render(<ToastHost />);
  });
}

function ToastHost() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed top-4 right-4 z-[1000] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
      {items.map((t) => (
        <ToastCard key={t.id} entry={t} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ entry }: { entry: ToastEntry }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Trigger entrance animation: start translated + transparent, then mount
  // adds the visible class on next frame.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.classList.remove("translate-x-3", "opacity-0");
    });
  }, []);

  const tone = TONE_STYLES[entry.tone];

  return (
    <div
      ref={cardRef}
      role="status"
      className={`pointer-events-auto translate-x-3 opacity-0 transition-all duration-200 flex items-start gap-3 px-3.5 py-3 rounded-lg shadow-lg border bg-white ${tone.border}`}
    >
      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center ${tone.iconBg} ${tone.iconColor}`}>
        <tone.Icon className="w-3 h-3" strokeWidth={3} />
      </div>
      <p className="flex-1 text-sm text-slate-800 leading-relaxed">{entry.message}</p>
      <button
        onClick={() => dismiss(entry.id)}
        className="text-slate-400 hover:text-slate-700 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

const TONE_STYLES: Record<
  ToastTone,
  { border: string; iconBg: string; iconColor: string; Icon: typeof Check }
> = {
  success: { border: "border-emerald-200", iconBg: "bg-emerald-100", iconColor: "text-emerald-700", Icon: Check },
  error:   { border: "border-rose-200",    iconBg: "bg-rose-100",    iconColor: "text-rose-700",    Icon: AlertTriangle },
  info:    { border: "border-sky-200",     iconBg: "bg-sky-100",     iconColor: "text-sky-700",     Icon: Info },
};
