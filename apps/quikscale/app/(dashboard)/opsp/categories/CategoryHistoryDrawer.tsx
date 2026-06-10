"use client";

import { useCallback, useEffect, useState } from "react";
import { RightPanel } from "@quikit/ui";
import { Clock, FileText } from "lucide-react";

interface CategoryLog {
  id: string;
  action: string; // CREATE | UPDATE | DELETE
  name: string;
  changes: string[];
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  actorName: string;
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  dataType: "Data type",
  currency: "Currency",
  categoryType: "Category type",
  description: "Description",
};

const ACTION_META: Record<string, { label: string; cls: string }> = {
  CREATE: { label: "Created", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  UPDATE: { label: "Updated", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  DELETE: { label: "Deleted", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function display(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "string" ? v : String(v);
}

/** Org-wide Category Mgmt audit trail (create / type-change / delete). */
export function CategoryHistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<CategoryLog[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/categories/logs");
      const json = await res.json();
      setLogs(json.success ? (json.data as CategoryLog[]) : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <RightPanel open={open} onClose={onClose} title="Category history" subtitle="Create · edit · delete" size="md">
      {loading && <p className="py-8 text-center text-sm text-gray-400">Loading…</p>}

      {!loading && logs.length === 0 && (
        <div className="py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">No category changes logged yet.</p>
        </div>
      )}

      <ul className="space-y-2">
        {logs.map((l) => {
          const meta = ACTION_META[l.action] ?? { label: l.action, cls: "bg-gray-50 text-gray-700 border-gray-200" };
          // For UPDATE, surface each changed field old → new.
          const diffs =
            l.action === "UPDATE"
              ? l.changes
                  .filter((k) => FIELD_LABELS[k])
                  .map((k) => ({
                    label: FIELD_LABELS[k],
                    old: display(l.oldValues?.[k]),
                    next: display(l.newValues?.[k]),
                  }))
              : [];
          return (
            <li key={l.id} className="rounded-xl border border-gray-200 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="truncate text-sm font-semibold text-gray-800">{l.name}</span>
              </div>

              {l.action === "CREATE" && Boolean(l.newValues?.categoryType) && (
                <p className="text-xs text-gray-500">
                  Type: <span className="text-gray-700">{display(l.newValues?.categoryType)}</span>
                </p>
              )}

              {diffs.length > 0 && (
                <ul className="space-y-1">
                  {diffs.map((d) => (
                    <li key={d.label} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">{d.label}:</span>
                      <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700">{d.old}</span>
                      <span className="text-gray-400">→</span>
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{d.next}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <Clock className="h-3 w-3" />
                <span>{fmtTime(l.createdAt)}</span>
                <span>·</span>
                <span className="truncate">{l.actorName}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </RightPanel>
  );
}
