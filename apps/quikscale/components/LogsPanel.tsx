"use client";

/**
 * Generic change-history right panel.
 *
 * Renders a timeline of audit-log entries with CREATE / UPDATE / DELETE diffs.
 * Shared by KPI, Priority, and WWW log views — each caller supplies its own
 * title, data hook results, and field-label map.
 *
 * Entry shape (normalized across KPILog + AuditLog):
 *   { id, action, oldValue, newValue, changedBy, changedByName, reason, createdAt }
 *
 * The `extraRowRenderer` prop lets a caller render a custom body for non-
 * standard actions (e.g. KPI's `UPDATE_WEEKLY`).
 */

import type { ReactNode } from "react";

export interface LogEntry {
  id: string;
  action: string;
  oldValue: string | null | undefined;
  newValue: string | null | undefined;
  changedBy: string;
  changedByName?: string;
  reason?: string | null;
  createdAt: string | Date;
}

export interface LogsPanelProps {
  title: string;
  subtitle?: string;
  logs: LogEntry[];
  isLoading: boolean;
  /** Human-readable labels, keyed by raw field name */
  fieldLabels?: Record<string, string>;
  /** Field names to omit from diffs (e.g. noisy or computed). Merged with built-in defaults. */
  extraSkipFields?: string[];
  /** Optional: custom body renderer for non-standard actions. Return null to fall through. */
  extraRowRenderer?: (log: LogEntry) => ReactNode | null;
  /** Empty-state message when no logs exist */
  emptyMessage?: string;
  onClose: () => void;
}

// Fields to skip in diffs. Three buckets:
//   1. Standard metadata (never interesting to users)
//   2. Auto-computed fields that change on every save (noise)
//   3. Nested objects / arrays that don't serialize cleanly in a diff row
const DEFAULT_SKIP_FIELDS = new Set([
  "updatedAt", "createdAt", "updatedBy", "id", "tenantId", "createdBy",
  "deletedAt",
  // KPI auto-computed
  "currentWeekValue", "progressPercent", "qtdAchieved", "healthStatus",
  "lastNotes", "lastNotesAt", "lastNotedBy",
  "weeklyOwnerTargets", "weeklyTargets", "ownerContributions", "ownerIds",
  "owner_user", "team",
  // WWW / Priority nested
  "weeklyStatuses", "revisionLogs",
]);

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function formatVal(val: unknown): string {
  if (isEmpty(val)) return "—";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "string") {
    // Detect ISO timestamps and format short
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return val.slice(0, 10);
    return val;
  }
  if (typeof val === "object") {
    const v = val as Record<string, unknown>;
    if (v.firstName || v.lastName) {
      const name = `${v.firstName ?? ""} ${v.lastName ?? ""}`.trim();
      return name || "—";
    }
    if (typeof v.name === "string") return v.name;
    if (Array.isArray(val)) return val.length === 0 ? "—" : `${val.length} item(s)`;
    return "—";
  }
  return String(val);
}

function diffObjects(
  oldJson: string | null | undefined,
  newJson: string | null | undefined,
  labels: Record<string, string>,
  skip: Set<string>,
): { field: string; from: string; to: string }[] {
  if (!oldJson || !newJson) return [];
  try {
    const oldObj = JSON.parse(oldJson);
    const newObj = JSON.parse(newJson);
    const diffs: { field: string; from: string; to: string }[] = [];
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const key of keys) {
      if (skip.has(key)) continue;
      const from = oldObj[key];
      const to = newObj[key];
      if (isEmpty(from) && isEmpty(to)) continue;
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      const fromStr = formatVal(from);
      const toStr = formatVal(to);
      if (fromStr === "—" && toStr === "—") continue;
      diffs.push({ field: labels[key] ?? key, from: fromStr, to: toStr });
    }
    return diffs;
  } catch {
    return [];
  }
}

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-accent-100 text-accent-700",
  UPDATE_WEEKLY: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-600",
};

function actionLabel(action: string): string {
  if (action === "UPDATE_WEEKLY") return "WEEKLY";
  return action;
}

export function LogsPanel({
  title,
  subtitle = "Change history",
  logs,
  isLoading,
  fieldLabels = {},
  extraSkipFields = [],
  extraRowRenderer,
  emptyMessage = "No changes recorded yet",
  onClose,
}: LogsPanelProps) {
  const skipSet = new Set([...DEFAULT_SKIP_FIELDS, ...extraSkipFields]);

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto h-full w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-sm font-semibold text-gray-800 truncate">{title}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <svg className="h-8 w-8 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">{emptyMessage}</p>
            </div>
          ) : (
            <ol className="relative border-l border-gray-200 space-y-6 ml-2">
              {logs.map((log) => {
                const diffs = log.action === "UPDATE" ? diffObjects(log.oldValue, log.newValue, fieldLabels, skipSet) : [];
                const extra = extraRowRenderer?.(log);
                const createdDate = typeof log.createdAt === "string" ? new Date(log.createdAt) : log.createdAt;
                return (
                  <li key={log.id} className="ml-4">
                    <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-gray-300" />
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ACTION_STYLES[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                        {actionLabel(log.action)}
                      </span>
                      <span className="text-[11px] font-medium text-gray-700">{log.changedByName ?? log.changedBy}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {createdDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {createdDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {log.action === "CREATE" && !extra && (
                      <p className="text-xs text-gray-500">Created.</p>
                    )}
                    {log.action === "DELETE" && !extra && (
                      <p className="text-xs text-gray-500">Deleted.</p>
                    )}
                    {log.action === "UPDATE" && diffs.length === 0 && !extra && (
                      <p className="text-xs text-gray-400 italic">No tracked field changes.</p>
                    )}
                    {extra}
                    {diffs.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {diffs.map((d, i) => (
                          <li key={i} className="flex items-baseline gap-1.5 text-xs text-gray-600">
                            <span className="font-medium text-gray-500 w-32 flex-shrink-0">{d.field}</span>
                            <span className="line-through text-gray-400 truncate max-w-[120px]">{d.from}</span>
                            <svg className="h-3 w-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="font-medium text-gray-800 truncate max-w-[120px]">{d.to}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {log.reason && (
                      <p className="text-[11px] text-gray-400 mt-1 italic">Reason: {log.reason}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex-shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export { isEmpty };
