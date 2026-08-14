"use client";

/**
 * Shared toolbar filter-button used across every quikscale list module
 * (Dashboard, Individual/Teams KPI, Priority, WWW, Critical Numbers). Shows
 * the resolved filter summary (e.g. "Team: X · Owner: Y") when something is
 * active, truncating with a full-text tooltip, and falls back to the plain
 * "Filter" label otherwise. Extracted so every module shares one markup/style
 * instead of re-implementing the same button per page.
 */

export interface FilterSummaryButtonProps {
  /** Output of `buildFilterSummaryLabel(...)` — "" means nothing is active. */
  label: string;
  /** Whether at least one filter is currently applied (drives accent styling). */
  active: boolean;
  /** Whether the filter dropdown panel is open (also drives accent styling). */
  open: boolean;
  onClick: () => void;
  /** Tailwind max-width class applied to the truncating label span. */
  maxWidthClass?: string;
  className?: string;
}

export function FilterSummaryButton({
  label,
  active,
  open,
  onClick,
  maxWidthClass = "max-w-[220px]",
  className = "",
}: FilterSummaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${
        open || active ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"
      } ${className}`}
    >
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
        />
      </svg>
      {active && label ? (
        <span className={`${maxWidthClass} truncate`} title={label}>
          {label}
        </span>
      ) : (
        "Filter"
      )}
    </button>
  );
}
