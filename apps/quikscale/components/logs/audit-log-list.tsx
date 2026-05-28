"use client";

/**
 * AuditLogList — pure renderer for audit-log entries.
 *
 * Visual style mirrors the Daily Huddle "Meeting Details" → Log tab: each
 * entry is a card with an action badge, actor name + timestamp on the header
 * row, a one-line headline, and an optional field-diff table.
 *
 * Stateless. Fetching, opening, closing all live in the wrapping drawer.
 */

import { fmtFriendlyAuditEntry } from "@/lib/utils/auditLog";

export interface AuditLogEntry {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy?: string;
  changedByName?: string;
  reason?: string | null;
  createdAt: string;
}

export interface AuditLogListProps {
  entries: AuditLogEntry[];
  loading: boolean;
  nameById?: (id: string) => string | undefined;
  fieldLabels?: Record<string, string>;
  emptyMessage?: string;
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  RESTORE: "bg-amber-100 text-amber-700",
  SCORE_UPDATE: "bg-purple-100 text-purple-700",
};

export function AuditLogList({
  entries,
  loading,
  nameById,
  fieldLabels,
  emptyMessage = "No changes recorded yet.",
}: AuditLogListProps) {
  if (loading) {
    return <p className="text-xs text-gray-400">Loading…</p>;
  }
  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 italic">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const friendly = fmtFriendlyAuditEntry(
          entry.action,
          entry.newValue,
          entry.oldValue,
          { nameById, fieldLabels },
        );
        const badgeClass = ACTION_BADGE[entry.action] ?? "bg-gray-100 text-gray-700";
        const actor = entry.changedByName ?? entry.changedBy ?? "—";
        return (
          <li
            key={entry.id}
            className="border border-gray-100 rounded-lg px-4 py-3 bg-gray-50"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badgeClass}`}
              >
                {entry.action}
              </span>
              <div className="text-[11px] text-gray-500 flex items-center gap-2">
                <span className="font-medium">{actor}</span>
                <span>·</span>
                <span>{fmtTimestamp(entry.createdAt)}</span>
              </div>
            </div>
            <div className="text-[12px] text-gray-800 font-medium mb-1">
              {friendly.headline}
            </div>
            {friendly.rows.length > 0 && (
              <table className="w-full mt-1 text-[11px] border-collapse">
                <tbody>
                  {friendly.rows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-t border-gray-200/70 first:border-t-0"
                    >
                      <td className="py-1 pr-3 text-gray-500 align-top whitespace-nowrap">
                        {r.label}
                      </td>
                      {r.oldValue !== undefined ? (
                        <td className="py-1 text-gray-700 align-top">
                          <span className="text-gray-400 line-through mr-1.5">
                            {r.oldValue}
                          </span>
                          <span className="text-gray-400 mr-1.5">→</span>
                          <span className="font-medium">{r.newValue}</span>
                        </td>
                      ) : (
                        <td className="py-1 text-gray-700 align-top break-words">
                          {r.newValue}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {entry.reason && friendly.rows.length === 0 && (
              <p className="text-[11px] text-gray-500 italic mt-1">
                {entry.reason}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
