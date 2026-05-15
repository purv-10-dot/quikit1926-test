"use client";
import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { formatHours } from "@/lib/utils/timesheetPeriod";
import type { EntryDetail } from "./worklog-popover";

interface Props {
  entry: EntryDetail;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteWorklogConfirm({ entry, onClose, onDeleted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/timesheets/${entry.id}`, { method: "DELETE" })
        .then((r) => r.json());
      if (!res?.success) {
        setError(res?.error ?? "Failed to delete");
        return;
      }
      onDeleted();
    } finally {
      setSubmitting(false);
    }
  }

  const dateShort = new Date(entry.entryDate).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const workItem = entry.issue ? `${entry.issue.key} — ${entry.issue.title}` : "—";

  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-start justify-center pt-24 px-4">
      <div className="bg-white border border-gray-200 rounded-md shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Delete time record?</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <Row label="Work item" value={workItem} />
          <Row label="Date" value={dateShort} />
          <Row label="Logged" value={formatHours(entry.hours)} />
          {entry.description && <Row label="Description" value={entry.description} />}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          This will permanently remove the entry from the timesheet. It cannot be undone.
        </p>

        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-sm text-gray-700 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={submitting}
            className="inline-flex items-center gap-1 h-8 px-3 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:bg-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-24 text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="flex-1 text-gray-800 text-sm break-words">{value}</div>
    </div>
  );
}
