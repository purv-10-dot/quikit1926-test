"use client";

/**
 * Minimal toast system. Exports:
 *   - <ToastProvider>  — wrap once in dashboard layout
 *   - useToast()       — hook returning { success, error, info, warn }
 *
 * No external deps. Zero-config. Stacks top-right, auto-dismisses in 4s,
 * click to dismiss early.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

type ToastKind = "success" | "error" | "info" | "warn";
interface Toast { id: number; kind: ToastKind; message: string }

interface ToastCtx {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const api: ToastCtx = {
    success: (m) => push("success", m),
    error:   (m) => push("error", m),
    info:    (m) => push("info", m),
    warn:    (m) => push("warn", m),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className={`pointer-events-auto cursor-pointer min-w-[260px] max-w-sm rounded-lg border shadow-sm px-3 py-2 text-sm flex items-start gap-2 animate-[slideIn_0.2s_ease-out] ${TONE[t.kind]}`}>
            {ICON[t.kind]}
            <div className="flex-1 min-w-0 break-words">{t.message}</div>
            <X className="h-3.5 w-3.5 opacity-50 mt-0.5 flex-shrink-0" />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Graceful fallback if used outside provider — log to console
    return {
      success: (m) => console.info("[toast:success]", m),
      error:   (m) => console.error("[toast:error]", m),
      info:    (m) => console.info("[toast:info]", m),
      warn:    (m) => console.warn("[toast:warn]", m),
    };
  }
  return ctx;
}

const TONE: Record<ToastKind, string> = {
  success: "bg-white border-green-200 text-green-900",
  error:   "bg-white border-red-200 text-red-900",
  info:    "bg-white border-blue-200 text-blue-900",
  warn:    "bg-white border-amber-200 text-amber-900",
};
const ICON: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />,
  error:   <XCircle      className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />,
  info:    <Info         className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />,
  warn:    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />,
};
