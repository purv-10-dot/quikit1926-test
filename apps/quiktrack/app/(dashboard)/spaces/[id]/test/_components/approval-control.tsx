"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Clock, FileEdit, Archive } from "lucide-react";
import { APPROVAL_CLASS, labelOf } from "./case-meta";

/**
 * Case approval control — Draft → In Review → Approved → Deprecated.
 *
 * The reason this exists (QUIKTR-319): a run excludes DRAFT cases by design, but
 * nothing could move a case out of DRAFT, so every run needed "include draft
 * cases" ticked or it matched zero cases. This is the missing transition.
 *
 * Shows the current state as a pill, the legal next states in a menu, and the
 * sign-off log so it is visible who approved what and when.
 */

interface ApprovalLogEntry {
  id: string;
  state: string;
  reviewerId: string | null;
  note: string | null;
  createdAt: string;
}

interface ApprovalData {
  currentState: string;
  allowedNext: string[];
  log: ApprovalLogEntry[];
}

const STATE_ICON: Record<string, React.ElementType> = {
  DRAFT: FileEdit,
  IN_REVIEW: Clock,
  APPROVED: Check,
  DEPRECATED: Archive,
};

/** Plain-language consequence of each state — the bit users actually need. */
const STATE_HINT: Record<string, string> = {
  DRAFT: "Excluded from new test runs unless drafts are explicitly included.",
  IN_REVIEW: "Awaiting sign-off. Still excluded from runs.",
  APPROVED: "Included in new test runs by default.",
  DEPRECATED: "Kept for history but excluded from new runs.",
};

export function ApprovalControl({
  caseId,
  onChanged,
  disabled,
}: {
  caseId: string | null;
  onChanged?: () => void;
  disabled?: boolean;
}) {
  const [data, setData] = useState<ApprovalData | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const load = () => {
    if (!caseId) return;
    fetch(`/api/test/cases/${caseId}/approval`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: ApprovalData }) => {
        if (j.success && j.data) setData(j.data);
      })
      .catch(() => undefined);
  };

  useEffect(load, [caseId]);

  const move = async (state: string) => {
    if (!caseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/test/cases/${caseId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Could not change the approval state.");
        return;
      }
      setOpen(false);
      load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (!caseId) {
    return (
      <p className="text-xs text-gray-400">
        A new case starts as Draft. Save it, then submit for review or approve it.
      </p>
    );
  }

  if (!data) {
    return <p className="text-xs text-gray-400">Loading approval state…</p>;
  }

  const CurrentIcon = STATE_ICON[data.currentState] ?? FileEdit;

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            APPROVAL_CLASS[data.currentState] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          <CurrentIcon className="h-3.5 w-3.5" />
          {labelOf(data.currentState)}
        </span>

        {!disabled && data.allowedNext.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Change
              <ChevronDown className="h-3 w-3" />
            </button>
            {open && (
              <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                {data.allowedNext.map((s) => {
                  const Icon = STATE_ICON[s] ?? FileEdit;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => move(s)}
                      className="block w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-800">
                        <Icon className="h-3.5 w-3.5" />
                        {labelOf(s)}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                        {STATE_HINT[s]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {data.log.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            {showLog ? "Hide" : `History (${data.log.length})`}
          </button>
        )}
      </div>

      <p className="text-[11px] leading-snug text-gray-500">
        {STATE_HINT[data.currentState]}
      </p>

      {showLog && (
        <div className="rounded border border-gray-200 divide-y divide-gray-100">
          {data.log.map((e) => (
            <div key={e.id} className="px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-800">
                  {labelOf(e.state)}
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
              {e.note && (
                <p className="mt-0.5 text-[11px] text-gray-600">{e.note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
