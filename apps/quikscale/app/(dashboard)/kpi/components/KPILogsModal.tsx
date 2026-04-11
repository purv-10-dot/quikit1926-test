"use client";

import { useLogs } from "@/lib/hooks/useKPI";
import type { KPIRow } from "@/lib/types/kpi";

interface Props { kpi: KPIRow; onClose: () => void; }

// Fields to skip in diffs — noisy / always change on every save
const SKIP_FIELDS = new Set(["updatedAt", "createdAt", "updatedBy", "id", "tenantId", "createdBy"]);

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  name: "KPI Name", description: "Description", owner: "Owner", status: "Status",
  target: "Target Value", quarterlyGoal: "Quarterly Goal", qtdGoal: "QTD Goal",
  qtdAchieved: "QTD Achieved", currentWeekValue: "Current Week Value",
  progressPercent: "Progress %", healthStatus: "Health Status",
  measurementUnit: "Measurement Unit", quarter: "Quarter", year: "Year",
  teamId: "Team", parentKPIId: "Parent KPI", lastNotes: "Last Notes",
};

function formatVal(val: any): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") return String(val);
  return String(val);
}

function diffObjects(oldJson: string | null | undefined, newJson: string | null | undefined): { field: string; from: string; to: string }[] {
  if (!oldJson || !newJson) return [];
  try {
    const oldObj = JSON.parse(oldJson);
    const newObj = JSON.parse(newJson);
    const diffs: { field: string; from: string; to: string }[] = [];
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const key of keys) {
      if (SKIP_FIELDS.has(key)) continue;
      const from = oldObj[key];
      const to = newObj[key];
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        diffs.push({ field: FIELD_LABELS[key] ?? key, from: formatVal(from), to: formatVal(to) });
      }
    }
    return diffs;
  } catch {
    return [];
  }
}

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-accent-100 text-accent-700",
  DELETE: "bg-red-100 text-red-600",
};

export function KPILogsModal({ kpi, onClose }: Props) {
  const { data: logs = [], isLoading } = useLogs(kpi.id);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">{kpi.name}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Change history</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <svg className="h-8 w-8 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No changes recorded yet</p>
            </div>
          ) : (
            <ol className="relative border-l border-gray-200 space-y-6 ml-2">
              {(logs as any[]).map((log) => {
                const diffs = log.action === "UPDATE" ? diffObjects(log.oldValue, log.newValue) : [];
                return (
                  <li key={log.id} className="ml-4">
                    {/* Timeline dot */}
                    <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-gray-300" />

                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ACTION_STYLES[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                        {log.action}
                      </span>
                      <span className="text-[11px] font-medium text-gray-700">{log.changedByName ?? log.changedBy}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {new Date(log.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {new Date(log.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {log.action === "CREATE" && (
                      <p className="text-xs text-gray-500">KPI created.</p>
                    )}
                    {log.action === "DELETE" && (
                      <p className="text-xs text-gray-500">KPI deleted.</p>
                    )}
                    {log.action === "UPDATE" && diffs.length === 0 && (
                      <p className="text-xs text-gray-400 italic">No tracked field changes.</p>
                    )}
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
