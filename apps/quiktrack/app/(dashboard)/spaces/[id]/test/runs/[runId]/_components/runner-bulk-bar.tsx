"use client";

import { useState } from "react";
import { Tag, Trash2, User, X } from "lucide-react";
import { FilterPicker, type FilterOption } from "@quikit/ui";
import type { RunnerCaseLabel, TestStatusLite } from "./runner-types";
import type { MemberOption } from "./assignee-picker";

/**
 * Selection toolbar for the runner grid (QUIKTR-341) — Assign To / Add Results
 * (status) / Add Label / Remove, matching the reference UI's bulk row.
 *
 * Each action opens a small picker rather than acting immediately on click: a
 * bulk action needs a VALUE (which assignee, which status, which label) before
 * it can run, unlike the case grid's bulk delete/restore which take none.
 */
export function RunnerBulkBar({
  count,
  busy,
  statuses,
  members,
  labels,
  onAssign,
  onSetStatus,
  onAddLabel,
  onRemove,
  onClear,
}: {
  count: number;
  busy: boolean;
  statuses: TestStatusLite[];
  members: MemberOption[];
  labels: RunnerCaseLabel[];
  onAssign: (userId: string | null) => void;
  onSetStatus: (statusId: string) => void;
  onAddLabel: (tagId: string) => void;
  onRemove: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState<"assign" | "status" | "label" | null>(null);

  if (count === 0) return null;

  const pick = (key: typeof open) => setOpen(open === key ? null : key);

  const statusOptions: FilterOption[] = statuses.map((s) => ({ value: s.id, label: s.label }));
  const memberOptions: FilterOption[] = members.map((m) => ({ value: m.userId, label: m.name }));
  const labelOptions: FilterOption[] = labels.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div className="flex items-center gap-3 border-b border-accent-200 bg-accent-50 px-3 py-2">
      <span className="text-xs font-medium text-accent-900">{count} selected</span>

      <div className="relative">
        <button
          type="button"
          onClick={() => pick("assign")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <User className="h-3.5 w-3.5" />
          Assign To
        </button>
        {open === "assign" && (
          <div className="absolute left-0 top-full z-30 mt-1 w-52">
            <FilterPicker
              value=""
              onChange={(v) => {
                onAssign(v || null);
                setOpen(null);
              }}
              options={memberOptions}
              allLabel="Unassign"
            />
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => pick("status")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Add Results
        </button>
        {open === "status" && (
          <div className="absolute left-0 top-full z-30 mt-1 w-52">
            <FilterPicker
              value=""
              onChange={(v) => {
                if (v) onSetStatus(v);
                setOpen(null);
              }}
              options={statusOptions}
              allLabel="Choose a status…"
            />
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => pick("label")}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Tag className="h-3.5 w-3.5" />
          Add Label
        </button>
        {open === "label" && (
          <div className="absolute left-0 top-full z-30 mt-1 w-52">
            <FilterPicker
              value=""
              onChange={(v) => {
                if (v) onAddLabel(v);
                setOpen(null);
              }}
              options={labelOptions}
              allLabel="Choose a label…"
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          // Untested-only is enforced server-side and reported via the skip
          // summary; this confirms the destructive part up front.
          if (window.confirm(`Remove ${count} test${count === 1 ? "" : "s"} from this run? Only untested tests can be removed.`)) {
            onRemove();
          }
        }}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove
      </button>

      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>
    </div>
  );
}
