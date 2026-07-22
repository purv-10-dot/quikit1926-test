"use client";

import * as React from "react";
import { AlertCircle, Check, X } from "./icons";

export type ToastKind = "info" | "success" | "error";

export interface ToastInput {
  title?: React.ReactNode;
  body?: React.ReactNode;
  /** Optional leading node (e.g. an Avatar) — overrides the default kind icon. */
  icon?: React.ReactNode;
  /** Click handler for the whole toast (e.g. jump to a channel). */
  onClick?: () => void;
  /** Auto-dismiss after this many ms (default 3200; 0 disables). */
  durationMs?: number;
}

export interface ToastItem extends ToastInput {
  id: string;
  kind: ToastKind;
}

export interface ToastApi {
  info: (t: ToastInput) => string;
  success: (t: ToastInput) => string;
  error: (t: ToastInput) => string;
  dismiss: (id: string) => void;
}

const noop = () => "";
const ToastContext = React.createContext<ToastApi>({
  info: noop,
  success: noop,
  error: noop,
  dismiss: () => undefined,
});

/** Hook returning the toast API. No-ops when no `ToastProvider` is mounted. */
export function useToast(): ToastApi {
  return React.useContext(ToastContext);
}

let counter = 0;
const nextId = () => `toast-${++counter}`;

const DEFAULT_DURATION = 3200;

export interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Provides `useToast()` and renders the bottom-right stack. Auto-dismisses each
 * toast after its duration; manual close via the × button.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback(
    (kind: ToastKind, input: ToastInput): string => {
      const id = nextId();
      const item: ToastItem = { id, kind, ...input };
      setToasts((list) => [...list, item]);
      const duration = input.durationMs ?? DEFAULT_DURATION;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      info: (t) => push("info", t),
      success: (t) => push("success", t),
      error: (t) => push("error", t),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  info: null,
  success: <Check size={18} aria-hidden />,
  error: <AlertCircle size={18} aria-hidden />,
};

export interface ToastHostProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

/** The fixed bottom-right stack. Exported for stories/tests. */
export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="qc-toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const clickable = !!toast.onClick;
  const lead = toast.icon ?? KIND_ICON[toast.kind];
  return (
    <div
      className="qc-toast"
      data-kind={toast.kind}
      data-clickable={clickable}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={toast.onClick}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toast.onClick?.();
              }
            }
          : undefined
      }
    >
      <span className="qc-toast__bar" aria-hidden />
      {lead ? <span className="qc-toast__icon">{lead}</span> : null}
      <div className="qc-toast__body">
        {toast.title ? <div className="qc-toast__title">{toast.title}</div> : null}
        {toast.body ? <div className="qc-toast__text">{toast.body}</div> : null}
      </div>
      <button
        type="button"
        className="qc-toast__close"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
