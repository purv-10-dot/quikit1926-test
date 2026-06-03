/**
 * Tiny lock SVG rendered next to a frozen column's header label so the user
 * can see at a glance which column is the freeze boundary. Used by KPI,
 * Weekly Meeting, and Daily Huddle — keep them in sync if the look changes.
 *
 * Same `blue-400` accent color across all four locked tables (see CLAUDE.md
 * "LOCKED TABLES" rule for why blue stays here even on themed tenants).
 */
export function FreezeIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3 w-3 text-blue-400 flex-shrink-0 ${className}`}
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
