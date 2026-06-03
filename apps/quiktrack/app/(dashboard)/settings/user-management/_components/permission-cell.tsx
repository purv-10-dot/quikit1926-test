"use client";

import { Check, Minus, X } from "lucide-react";

// Visual states for a single permission cell:
//   on      – granted (blue circle + check)
//   off      – not granted but valid (gray circle + ✕)
//   partial  – module aggregate: some children granted (green circle + dash)
//   na       – action not applicable to this resource (empty placeholder)
export type CellState = "on" | "off" | "partial" | "na";

export function PermissionCell({
  state,
  onClick,
  title,
}: {
  state: CellState;
  onClick?: () => void;
  title?: string;
}) {
  if (state === "na") {
    return <span className="inline-block h-6 w-6 align-middle" aria-hidden="true" />;
  }

  const base =
    "inline-flex h-6 w-6 items-center justify-center rounded-full align-middle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900";

  const styles =
    state === "on"
      ? "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400"
      : state === "partial"
        ? "bg-lime-100 text-lime-700 hover:bg-lime-200 focus-visible:ring-lime-400 dark:bg-lime-500/20 dark:text-lime-300 dark:hover:bg-lime-500/30"
        : "bg-gray-100 text-gray-400 hover:bg-gray-200 focus-visible:ring-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:hover:bg-gray-700";

  const Icon = state === "on" ? Check : state === "partial" ? Minus : X;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={state === "on"}
      className={`${base} ${styles}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}
