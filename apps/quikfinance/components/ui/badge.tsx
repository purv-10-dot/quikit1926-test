import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "default" | "success" | "warning" | "danger" | "info" | "muted";
export type BadgeVariant = BadgeTone | "secondary" | "outline" | "destructive";

const tones: Record<BadgeTone, string> = {
  default: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  muted: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
};

const variants: Record<BadgeVariant, BadgeTone> = {
  default: "default",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  muted: "muted",
  destructive: "danger",
  secondary: "muted",
  outline: "muted"
};

export function Badge({ variant = "default", tone, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant; tone?: BadgeTone }) {
  const resolvedTone = tone ?? variants[variant];

  return (
    <span
      className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold capitalize", tones[resolvedTone], className)}
      {...props}
    />
  );
}
