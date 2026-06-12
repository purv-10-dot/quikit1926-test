"use client";

import { Check, CalendarX, Calendar as CalendarIcon } from "lucide-react";
import { useHasMounted } from "@/hooks/use-has-mounted";

interface Props {
  dueDate: string | Date | null | undefined;
  status: string;
  className?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Compute "days from today" using the user's local calendar boundaries (not
 * UTC). Server stores dueDate in UTC; the chip renders in the viewer's TZ —
 * a 23:00 UTC due time still says "today" in IST.
 */
function diffInDays(due: Date, now: Date): number {
  return Math.floor((startOfLocalDay(due).getTime() - startOfLocalDay(now).getTime()) / MS_PER_DAY);
}

function stableDueLabel(due: Date): string {
  return due.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function TaskDueChip({ dueDate, status, className = "" }: Props) {
  const mounted = useHasMounted();
  const isTerminal = status === "Completed" || status === "Cancelled";
  if (isTerminal) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 ${className}`}
        title={status}
      >
        <Check size={12} /> {status}
      </span>
    );
  }
  if (!dueDate) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs text-crm-muted ${className}`}>
        <CalendarIcon size={12} /> No date
      </span>
    );
  }

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (Number.isNaN(due.getTime())) {
    return <span className={`text-xs text-crm-muted ${className}`}>—</span>;
  }

  if (!mounted) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 ${className}`}
        suppressHydrationWarning
      >
        <CalendarIcon size={12} />
        {stableDueLabel(due)}
      </span>
    );
  }

  const now = new Date();
  const days = diffInDays(due, now);
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(due);

  if (days < 0) {
    const overdue = -days;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 ${className}`}
        title={due.toLocaleString()}
      >
        <CalendarX size={12} />
        {overdue}d overdue
      </span>
    );
  }
  if (days === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 ${className}`}
        title={due.toLocaleString()}
      >
        <CalendarIcon size={12} />
        Due today
      </span>
    );
  }
  if (days === 1) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ${className}`}
        title={due.toLocaleString()}
      >
        <CalendarIcon size={12} />
        Due tomorrow
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ${className}`}
      title={due.toLocaleString()}
    >
      <CalendarIcon size={12} />
      Due in {days}d · {dateLabel}
    </span>
  );
}
