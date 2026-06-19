"use client";

import { ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  active: boolean;
  direction: "asc" | "desc" | null | undefined;
  className?: string;
}

/**
 * Up/down arrow shown next to a column header label when that column is the
 * currently active server-side sort. Renders nothing when inactive — callers
 * can render it unconditionally inside their header layout.
 *
 * Pair with `text-accent-700` on the column label for the full "active sort"
 * visual (matches the Individual KPI table).
 */
export function SortIndicator({ active, direction, className }: Props) {
  if (!active || !direction) return null;
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <Icon
      className={`h-3 w-3 text-accent-600 flex-shrink-0 ${className ?? ""}`}
      aria-label={`Sorted ${direction === "asc" ? "ascending" : "descending"}`}
    />
  );
}
