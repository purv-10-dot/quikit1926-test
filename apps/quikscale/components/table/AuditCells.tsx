"use client";

/**
 * Audit cell components — shared by every module's data grid for the
 * "Created By / Updated By / Created Date / Updated Date" columns.
 *
 * Visual style mirrors the existing ClientMember table:
 *   - `<UserAuditCell>` — solid initials avatar + name; `—` when null
 *   - `<DateAuditCell>` — small clock icon + DD/MM/YYYY; `—` when null
 *
 * Colors are intentionally `bg-gray-900` / `text-gray-*` (NOT `accent-*`)
 * so the cells respect the locked-table rule in CLAUDE.md and stay
 * theme-neutral across tenants.
 */

import { Clock } from "lucide-react";

/** Initials avatar + display name. Renders `—` when the user is null. */
export function UserAuditCell({
  name,
  initials,
}: {
  name: string | null | undefined;
  initials: string | null | undefined;
}) {
  if (!name) return <span className="text-gray-300">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-[10px] font-semibold flex-shrink-0"
        title={name}
      >
        {initials || "?"}
      </span>
      <span className="text-xs text-gray-700 whitespace-nowrap truncate max-w-[140px]" title={name}>
        {name}
      </span>
    </div>
  );
}

/**
 * Clock icon + formatted date (DD/MM/YYYY).
 * Returns `—` when iso is falsy.
 */
export function DateAuditCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap" title={new Date(iso).toLocaleString()}>
      <Clock className="h-3 w-3 text-gray-400 flex-shrink-0" />
      {fmtDateShort(iso)}
    </span>
  );
}

/** DD/MM/YYYY — matches the format used by the existing audit columns. */
export function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Build initials from a full name. "Sarim Khan" → "SK". */
export function buildInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
