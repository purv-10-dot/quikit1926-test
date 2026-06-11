/**
 * AccountStatusPill — small colored pill for "Active" / "Prospect" / "Inactive".
 * Used in list rows, detail header, and any lead/contact/opportunity badge that
 * surfaces the parent account's status.
 */
import type { ReactElement } from "react";

const TONE: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Prospect: "bg-blue-100 text-blue-800 ring-blue-200",
  Inactive: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function AccountStatusPill({
  status,
  className = "",
}: {
  status: string | null | undefined;
  className?: string;
}): ReactElement {
  const s = status || "—";
  const tone = TONE[s] ?? "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {s}
    </span>
  );
}
