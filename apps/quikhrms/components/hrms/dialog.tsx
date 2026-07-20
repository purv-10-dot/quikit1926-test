"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, HelpCircle, X, AlertOctagon } from "lucide-react";
import { clsx } from "clsx";

type Variant = "info" | "warning" | "danger" | "error";

interface BaseOpts {
  title: string;
  description?: string;
  variant?: Variant;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmOpts extends BaseOpts {
  kind: "confirm";
  resolve: (v: boolean) => void;
}

interface PromptOpts extends BaseOpts {
  kind: "prompt";
  defaultValue?: string;
  placeholder?: string;
  inputType?: "text" | "number" | "email";
  resolve: (v: string | null) => void;
}

interface AlertOpts extends BaseOpts {
  kind: "alert";
  resolve: () => void;
}

type DialogState = (ConfirmOpts | PromptOpts | AlertOpts) & { id: string };

interface DialogContextValue {
  confirm: (opts: Omit<ConfirmOpts, "kind" | "resolve">) => Promise<boolean>;
  promptText: (opts: Omit<PromptOpts, "kind" | "resolve">) => Promise<string | null>;
  alertDialog: (opts: Omit<AlertOpts, "kind" | "resolve">) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<DialogState | null>(null);

  const close = useCallback(() => setCurrent(null), []);

  const confirm: DialogContextValue["confirm"] = (opts) =>
    new Promise((resolve) => {
      setCurrent({ kind: "confirm", id: rid(), resolve, ...opts });
    });

  const promptText: DialogContextValue["promptText"] = (opts) =>
    new Promise((resolve) => {
      setCurrent({ kind: "prompt", id: rid(), resolve, ...opts });
    });

  const alertDialog: DialogContextValue["alertDialog"] = (opts) =>
    new Promise((resolve) => {
      setCurrent({ kind: "alert", id: rid(), resolve, ...opts });
    });

  return (
    <DialogContext.Provider value={{ confirm, promptText, alertDialog }}>
      {children}
      {current && <DialogHost state={current} onClose={close} />}
    </DialogContext.Provider>
  );
}

function rid() {
  return Math.random().toString(36).slice(2);
}

function DialogHost({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const [value, setValue] = useState(state.kind === "prompt" ? state.defaultValue ?? "" : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.kind === "prompt") {
      const t = setTimeout(() => inputRef.current?.select(), 50);
      return () => clearTimeout(t);
    }
  }, [state.kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
      if (e.key === "Enter" && state.kind !== "prompt") handleConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.id]);

  const handleCancel = () => {
    if (state.kind === "confirm") state.resolve(false);
    else if (state.kind === "prompt") state.resolve(null);
    else state.resolve();
    onClose();
  };

  const handleConfirm = () => {
    if (state.kind === "confirm") state.resolve(true);
    else if (state.kind === "prompt") state.resolve(value);
    else state.resolve();
    onClose();
  };

  const variant: Variant = state.variant ?? (state.kind === "alert" ? "info" : "info");
  const v = variantConfig[variant];
  const confirmLabel = state.confirmLabel ?? (state.kind === "alert" ? "OK" : state.kind === "prompt" ? "Confirm" : "Confirm");
  const cancelLabel = state.cancelLabel ?? "Cancel";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={handleCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        <button
          onClick={handleCancel}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-4">
          <div className="flex items-start gap-4">
            <div className={clsx("shrink-0 w-11 h-11 rounded-full flex items-center justify-center", v.iconBg)}>
              {v.icon}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-base font-semibold text-gray-900">{state.title}</h3>
              {state.description && (
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{state.description}</p>
              )}
            </div>
          </div>

          {state.kind === "prompt" && (
            <div className="mt-4">
              <input
                ref={inputRef}
                type={state.inputType ?? "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={state.placeholder}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#22c55e] focus:border-transparent"
              />
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          {state.kind !== "alert" && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className={clsx(
              "px-4 py-2 text-sm font-semibold text-white rounded-md shadow-sm transition",
              v.btn,
            )}
            autoFocus={state.kind !== "prompt"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const variantConfig: Record<Variant, { icon: React.ReactNode; iconBg: string; btn: string }> = {
  info: {
    icon: <Info size={20} className="text-[#16a34a]" />,
    iconBg: "bg-[#dcfce7]",
    btn: "bg-[#22c55e] hover:bg-green-700",
  },
  warning: {
    icon: <AlertTriangle size={20} className="text-amber-600" />,
    iconBg: "bg-amber-100",
    btn: "bg-amber-600 hover:bg-amber-700",
  },
  danger: {
    icon: <HelpCircle size={20} className="text-red-600" />,
    iconBg: "bg-red-100",
    btn: "bg-red-600 hover:bg-red-700",
  },
  // "error" is for surfacing a failure that already happened (an alert), vs
  // "danger" which asks the user to confirm a destructive action.
  error: {
    icon: <AlertOctagon size={20} className="text-red-600" />,
    iconBg: "bg-red-100",
    btn: "bg-red-600 hover:bg-red-700",
  },
};
