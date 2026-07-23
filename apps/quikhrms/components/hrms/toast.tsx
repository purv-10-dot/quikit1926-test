"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle, AlertCircle, Info, X, AlertTriangle, Loader2 } from "lucide-react";
import { clsx } from "clsx";

type ToastType = "success" | "error" | "info" | "warning" | "loading";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  details?: Record<string, string[]> | string[] | null;
}

/** Options for a promise-driven toast (Sending… → Sent / Failed). */
interface PromiseToastOptions<T> {
  loading: string;
  loadingDescription?: string;
  success: string | ((value: T) => string);
  successDescription?: string | ((value: T) => string | undefined);
  error?: string | ((err: unknown) => string);
}

interface ToastContextValue {
  show: (t: Omit<ToastItem, "id">) => string;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string, details?: ToastItem["details"]) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  /** Persistent spinner toast; returns an id to update()/dismiss() later. */
  loading: (title: string, description?: string) => string;
  /** Mutate an existing toast (e.g. turn a loading toast into success/error). */
  update: (id: string, patch: Partial<Omit<ToastItem, "id">>) => void;
  dismiss: (id: string) => void;
  /** Wrap an async op: shows "loading" then resolves to success/error automatically. */
  promise: <T>(promise: Promise<T>, opts: PromiseToastOptions<T>) => Promise<T>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const [dismissing, setDismissing] = useState<Set<string>>(new Set());

  const beginDismiss = useCallback((id: string) => {
    setDismissing((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      remove(id);
    }, 200);
  }, [remove]);

  // Track pending auto-dismiss timers so update() can cancel/re-arm them.
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const armDismiss = useCallback((id: string, type: ToastType) => {
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    if (type === "loading") return; // loading toasts stay until updated/dismissed
    const ttl = type === "error" ? 7000 : 4000;
    const t = setTimeout(() => { timers.current.delete(id); beginDismiss(id); }, ttl);
    timers.current.set(id, t);
  }, [beginDismiss]);

  const show = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const item: ToastItem = { id, ...t };
    setToasts((prev) => [...prev, item]);
    armDismiss(id, t.type);
    return id;
  }, [armDismiss]);

  const update = useCallback((id: string, patch: Partial<Omit<ToastItem, "id">>) => {
    setToasts((prev) => {
      let found = false;
      const next = prev.map((x) => (x.id === id ? (found = true, { ...x, ...patch }) : x));
      return found ? next : prev;
    });
    if (patch.type) armDismiss(id, patch.type);
  }, [armDismiss]);

  const value: ToastContextValue = {
    show,
    success: (title, description) => { show({ type: "success", title, description }); },
    error: (title, description, details) => { show({ type: "error", title, description, details }); },
    info: (title, description) => { show({ type: "info", title, description }); },
    warning: (title, description) => { show({ type: "warning", title, description }); },
    loading: (title, description) => show({ type: "loading", title, description }),
    update,
    dismiss: (id) => beginDismiss(id),
    promise: async (promise, opts) => {
      const id = show({ type: "loading", title: opts.loading, description: opts.loadingDescription });
      try {
        const result = await promise;
        update(id, {
          type: "success",
          title: typeof opts.success === "function" ? opts.success(result) : opts.success,
          description: typeof opts.successDescription === "function" ? opts.successDescription(result) : opts.successDescription,
        });
        return result;
      } catch (err) {
        const { message, details } = extractErrorDetails(err);
        const title = opts.error
          ? (typeof opts.error === "function" ? opts.error(err) : opts.error)
          : message;
        update(id, { type: "error", title, description: undefined, details });
        throw err;
      }
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} dismissing={dismissing} onDismiss={beginDismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, dismissing, onDismiss }: { toasts: ToastItem[]; dismissing: Set<string>; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[380px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} closing={dismissing.has(t.id)} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, closing, onDismiss }: { item: ToastItem; closing: boolean; onDismiss: () => void }) {
  const config = toastConfig[item.type];

  // Smart stringify: prefer a `.message` field when present so structured
  // violation / error shapes render as plain sentences instead of raw JSON.
  // Falls back to compact JSON for anything else (never "[object Object]").
  const renderValue = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "object") {
      const obj = v as { message?: unknown; reason?: unknown };
      if (typeof obj.message === "string") return obj.message;
      if (typeof obj.reason === "string") return obj.reason;
    }
    try { return JSON.stringify(v); } catch { return "(unprintable value)"; }
  };
  // Skip the "<field>:" prefix when the value already contains a self-explanatory
  // message (e.g. policy-violation arrays whose items have `.message`). The field
  // name in those cases is just structural noise like "violations:".
  const isSelfExplanatory = (v: unknown) =>
    typeof v === "object" && v !== null
    && typeof (v as { message?: unknown }).message === "string";

  const detailList = Array.isArray(item.details)
    ? item.details.map(renderValue)
    : item.details && typeof item.details === "object"
      ? Object.entries(item.details).flatMap(([field, msgs]) =>
          (Array.isArray(msgs) ? msgs : [msgs]).map((m) =>
            isSelfExplanatory(m) ? renderValue(m) : `${field}: ${renderValue(m)}`,
          ),
        )
      : null;

  return (
    <div
      className={clsx(
        "bg-white rounded-lg shadow-lg border overflow-hidden",
        config.border,
        closing ? "toast-slide-out" : "toast-slide-in",
      )}
    >
      <div className="flex items-start gap-2.5 p-3.5">
        <div className={clsx("shrink-0 rounded-full w-7 h-7 flex items-center justify-center", config.iconBg)}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className={clsx("text-[13px] font-semibold", config.titleColor)}>{item.title}</div>
          {item.description && <div className="text-[11px] text-gray-600 mt-0.5 break-words">{item.description}</div>}
          {detailList && detailList.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-gray-700">
              {detailList.slice(0, 5).map((d, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className={clsx("w-1 h-1 rounded-full mt-1.5 shrink-0", config.dot)} />
                  <span className="break-words">{d}</span>
                </li>
              ))}
              {detailList.length > 5 && <li className="text-gray-400 text-[11px]">+{detailList.length - 5} more</li>}
            </ul>
          )}
        </div>
        <button onClick={onDismiss} className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className={clsx("h-1 w-full", config.accent)} />
    </div>
  );
}

const toastConfig: Record<ToastType, {
  border: string; iconBg: string; icon: React.ReactNode; titleColor: string; accent: string; dot: string;
}> = {
  success: {
    border: "border-green-200", iconBg: "bg-green-100",
    icon: <CheckCircle size={16} className="text-green-600" />,
    titleColor: "text-green-900", accent: "bg-green-500", dot: "bg-green-400",
  },
  error: {
    border: "border-red-200", iconBg: "bg-red-100",
    icon: <AlertCircle size={16} className="text-red-600" />,
    titleColor: "text-red-900", accent: "bg-red-500", dot: "bg-red-400",
  },
  warning: {
    border: "border-amber-200", iconBg: "bg-amber-100",
    icon: <AlertTriangle size={16} className="text-amber-600" />,
    titleColor: "text-amber-900", accent: "bg-amber-500", dot: "bg-amber-400",
  },
  info: {
    border: "border-green-200", iconBg: "bg-green-100",
    icon: <Info size={16} className="text-green-600" />,
    titleColor: "text-green-900", accent: "bg-green-500", dot: "bg-green-400",
  },
  loading: {
    border: "border-gray-200", iconBg: "bg-gray-100",
    icon: <Loader2 size={16} className="text-gray-600 animate-spin" />,
    titleColor: "text-gray-900", accent: "bg-gray-300", dot: "bg-gray-400",
  },
};

// Helper to extract error details from API error payloads
export function extractErrorDetails(err: unknown): { message: string; details?: ToastItem["details"] } {
  if (err instanceof Error) {
    // Try parse JSON details from error message
    try {
      const parsed = JSON.parse(err.message);
      if (parsed.error) return { message: parsed.error.message, details: parsed.error.details };
    } catch { /* not JSON */ }
    return { message: err.message };
  }
  return { message: "Unknown error" };
}
