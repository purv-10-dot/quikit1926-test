"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5_000;
const DEDUPE_WINDOW_MS = 2_500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const recent = useRef<Map<string, number>>(new Map());

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const key = `${kind}:${message}`;
    const now = Date.now();
    const last = recent.current.get(key);
    if (last && now - last < DEDUPE_WINDOW_MS) return;
    recent.current.set(key, now);
    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
  };

  // Cleanup recent map periodically
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
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={
              "pointer-events-auto rounded-lg px-4 py-3 shadow-crm-modal text-sm text-white " +
              (t.kind === "success"
                ? "bg-emerald-600"
                : t.kind === "error"
                ? "bg-red-600"
                : "bg-slate-800")
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
