"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { QT_TOAST_EVENT, type ToastDetail, type ToastKind } from "@/lib/ui/toast";

interface ToastItem extends ToastDetail {
  id: number;
}

const KIND_STYLE: Record<ToastKind, { ring: string; icon: React.ReactNode }> = {
  success: {
    ring: "border-green-200 bg-green-50 text-green-800",
    icon: <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />,
  },
  error: {
    ring: "border-red-200 bg-red-50 text-red-800",
    icon: <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />,
  },
  info: {
    ring: "border-gray-200 bg-white text-gray-800",
    icon: <Info className="h-4 w-4 text-gray-500 shrink-0" />,
  },
};

const DISMISS_MS = 4000;

/**
 * Global toast stack. Mount once in the dashboard layout. Any code can surface a
 * toast via `showToast(message, kind)` from `@/lib/ui/toast` — no props needed.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message: detail.message, kind: detail.kind }]);
      window.setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        DISMISS_MS,
      );
    }
    window.addEventListener(QT_TOAST_EVENT, onToast);
    return () => window.removeEventListener(QT_TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const style = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-lg text-sm ${style.ring}`}
          >
            {style.icon}
            <span className="flex-1 break-words">{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="shrink-0 rounded p-0.5 hover:bg-black/5"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5 opacity-60" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
