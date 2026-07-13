"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────── role colour ─────────────────────────── */

const ROLE_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-rose-100 text-rose-700",
];

/** Deterministic pill colour for a role name. Admin is always amber. */
export function roleColor(name: string | null): string {
  if (!name) return "bg-gray-100 text-gray-500";
  if (name.toLowerCase() === "admin") return "bg-amber-100 text-amber-700";
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return ROLE_COLORS[hash % ROLE_COLORS.length];
}

/* ─────────────────────────── modal shell ─────────────────────────── */

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className={cn(
          "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl",
          wide ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── toast ─────────────────────────── */

export type ToastState = { message: string; sub?: string; variant?: "success" | "error" } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback(
    (message: string, sub?: string, variant: "success" | "error" = "success") =>
      setToast({ message, sub, variant }),
    [],
  );

  return { toast, showToast, clearToast: () => setToast(null) };
}

export function Toaster({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const isError = toast?.variant === "error";
  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-[60] transition-all duration-500",
        toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      {toast && (
        <div className="flex min-w-[280px] items-center gap-2.5 rounded-xl bg-gray-900 px-4 py-3 text-white shadow-2xl">
          {isError ? (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-400" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold">{toast.message}</p>
            {toast.sub && <p className="mt-0.5 text-xs text-gray-400">{toast.sub}</p>}
          </div>
          <button onClick={onClose} className="ml-1 text-gray-500 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── buttons ─────────────────────────── */

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
