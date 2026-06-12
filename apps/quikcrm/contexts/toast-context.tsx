"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  actionFailedMessage,
  actionSuccessMessage,
  type ToastActionVerb,
} from "@/lib/utils/toast-message";

export type ToastKind = "success" | "error" | "info";

// ─── Item shapes ──────────────────────────────────────────────────────────────

type ToastItemCore =
  | { kind: ToastKind; variant: "standard"; message: string }
  | { kind: ToastKind; variant: "rich"; title: string; subtitle: string };

type ToastItem = ToastItemCore & { id: string };

// ─── Context API ──────────────────────────────────────────────────────────────

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error:   (m: string) => void;
  info:    (m: string) => void;
  actionSuccess: (entity: string, verb: ToastActionVerb) => void;
  actionFailed:  (entity: string, verb: ToastActionVerb, detail?: string | null) => void;
  rich: (title: string, subtitle: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5_000;
const DEDUPE_WINDOW_MS = 2_500;

// ─── Per-kind visual config ───────────────────────────────────────────────────
//
// Colors are applied via inline `style` props, NOT Tailwind arbitrary-value
// classes. This guarantees the colors are always applied regardless of how
// Tailwind's static scanner processes the file.
//
// Success  → green palette  (#DCFCE7 bg / #16A34A icon / #166534 title)
// Error    → red palette    (#FEE2E2 bg / #DC2626 icon / #DC2626 title)
// Info     → blue palette   (#EFF6FF bg / #2563EB icon / #1E40AF title)

const KIND_CONFIG: Record<
  ToastKind,
  {
    Icon: React.ElementType;
    iconBg: string;           // circle background colour
    iconColor: string;        // icon stroke/fill colour
    titleColor: string;       // title text colour
    accentBorder: string;     // left 4px accent (Tailwind class — always in bundle)
    containerBorder: string;  // outer border colour
    containerBg: string;      // outer background
  }
> = {
  success: {
    Icon: CheckCircle2,
    iconBg:          "#DCFCE7",
    iconColor:       "#16A34A",
    titleColor:      "#166534",
    accentBorder:    "border-l-green-600",
    containerBorder: "#BBF7D0",   // green-200
    containerBg:     "#FFFFFF",
  },
  error: {
    Icon: XCircle,
    iconBg:          "#FEE2E2",
    iconColor:       "#DC2626",
    titleColor:      "#DC2626",
    accentBorder:    "border-l-red-600",
    containerBorder: "#FECACA",   // red-200
    containerBg:     "#FEF2F2",   // red-50 — very subtle tint
  },
  info: {
    Icon: Info,
    iconBg:          "#EFF6FF",
    iconColor:       "#2563EB",
    titleColor:      "#1E40AF",
    accentBorder:    "border-l-blue-600",
    containerBorder: "#BFDBFE",   // blue-200
    containerBg:     "#FFFFFF",
  },
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const recent = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (item: ToastItemCore, dedupeKey: string) => {
      const now = Date.now();
      const last = recent.current.get(dedupeKey);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      recent.current.set(dedupeKey, now);
      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev, { id, ...item } as ToastItem]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      push({ variant: "standard", message, kind }, `${kind}:${message}`);
    },
    [push],
  );

  const richFn = useCallback(
    (title: string, subtitle: string, kind: ToastKind = "success") => {
      push({ variant: "rich", title, subtitle, kind }, `rich:${kind}:${title}`);
    },
    [push],
  );

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, "success"),
    error:   (m) => show(m, "error"),
    info:    (m) => show(m, "info"),
    actionSuccess: (entity, verb) =>
      show(actionSuccessMessage(entity, verb), "success"),
    actionFailed: (entity, verb, detail) =>
      show(actionFailedMessage(entity, verb, detail), "error"),
    rich: richFn,
  };

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of recent.current) {
        if (now - v > DEDUPE_WINDOW_MS * 4) recent.current.delete(k);
      }
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col gap-2.5 font-[family-name:var(--font-jakarta)]"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => {
          const cfg = KIND_CONFIG[t.kind];

          // ── Dismiss button ────────────────────────────────────────────────
          const DismissBtn = (
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          );

          // ── Shared outer shell (inline styles for border + bg) ────────────
          const outerStyle: React.CSSProperties = {
            backgroundColor: cfg.containerBg,
            borderColor: cfg.containerBorder,
            borderLeftColor: cfg.iconColor, // accent matches icon colour
          };

          // ── Rich variant ──────────────────────────────────────────────────
          if (t.variant === "rich") {
            return (
              <div
                key={t.id}
                role="status"
                style={outerStyle}
                className={[
                  "pointer-events-auto flex items-start gap-3.5",
                  "rounded-2xl border border-l-4",
                  "px-4 py-4",
                  "shadow-[0_4px_24px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]",
                  "animate-in slide-in-from-right-4 fade-in-0 duration-200 ease-out",
                ].join(" ")}
              >
                {/* Circular icon badge */}
                <span
                  style={{ backgroundColor: cfg.iconBg }}
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                >
                  <cfg.Icon
                    size={19}
                    strokeWidth={2.5}
                    style={{ color: cfg.iconColor }}
                    aria-hidden
                  />
                </span>

                {/* Title + subtitle */}
                <div className="min-w-0 flex-1 pt-1">
                  <p
                    style={{ color: cfg.titleColor }}
                    className="text-[13.5px] font-semibold leading-tight"
                  >
                    {t.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                    {t.subtitle}
                  </p>
                </div>

                {DismissBtn}
              </div>
            );
          }

          // ── Standard variant ──────────────────────────────────────────────
          return (
            <div
              key={t.id}
              role="status"
              style={outerStyle}
              className={[
                "pointer-events-auto flex items-center gap-3",
                "rounded-2xl border border-l-4",
                "px-4 py-3.5",
                "shadow-[0_4px_20px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]",
                "animate-in slide-in-from-right-4 fade-in-0 duration-200 ease-out",
              ].join(" ")}
            >
              {/* Circular icon badge */}
              <span
                style={{ backgroundColor: cfg.iconBg }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              >
                <cfg.Icon
                  size={16}
                  strokeWidth={2.5}
                  style={{ color: cfg.iconColor }}
                  aria-hidden
                />
              </span>

              <p
                style={{ color: cfg.titleColor }}
                className="min-w-0 flex-1 text-[13px] font-semibold leading-snug"
              >
                {t.message}
              </p>

              {DismissBtn}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
