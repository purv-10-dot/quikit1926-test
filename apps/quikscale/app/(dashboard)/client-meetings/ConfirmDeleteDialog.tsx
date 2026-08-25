"use client";

/**
 * Confirmation for every destructive action in the Export Transcript modal:
 * deleting a transcript, or discarding a generated report.
 *
 * Deliberately names the thing being deleted and lists what goes with it. A
 * transcript is the evidence a signed-off report cites; a report can represent
 * a facilitator's review. "Are you sure?" is not enough information to make
 * that decision, so this dialog spells out the consequence and, when the
 * server says the target was signed off, requires a second, explicit
 * acknowledgement before it will send the delete again.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

export interface DeleteTarget {
  /** "transcript" / "report" — used in the button label. */
  kind: string;
  /** The specific thing, e.g. `Leaders _ Daily Huddle (5) · 2026-08-11`. */
  name: string;
  /** Bullet list of exactly what this delete does and does not touch. */
  consequences: string[];
}

export function ConfirmDeleteDialog({
  target,
  busy,
  error,
  requiresConfirmation,
  onCancel,
  onConfirm,
}: {
  target: DeleteTarget;
  busy: boolean;
  error: string | null;
  /** Set once the server has refused because the target was signed off. */
  requiresConfirmation: boolean;
  onCancel: () => void;
  onConfirm: (opts: { reason: string; confirmValidated: boolean }) => void;
}) {
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);

  // A fresh refusal must be acknowledged on its own — carrying a tick over
  // from a previous attempt would defeat the point of asking.
  useEffect(() => {
    if (requiresConfirmation) setAck(false);
  }, [requiresConfirmation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const blocked = requiresConfirmation && !ack;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => (busy ? null : onCancel())}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 id="confirm-delete-title" className="text-sm font-semibold text-gray-900">
              Delete this {target.kind}?
            </h3>
            <p className="mt-0.5 break-words text-xs text-gray-600">{target.name}</p>
          </div>
        </div>

        <div className="px-5">
          <ul className="space-y-1 rounded-lg bg-gray-50 px-3 py-2.5 text-[11.5px] text-gray-600">
            {target.consequences.map((c) => (
              <li key={c} className="flex gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                <span>{c}</span>
              </li>
            ))}
          </ul>

          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-gray-600">Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Shown in the audit timeline"
              className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </label>

          {requiresConfirmation ? (
            <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 text-blue-600"
              />
              <span>
                This has been <strong>signed off</strong>. I understand that deleting it discards that
                sign-off as well.
              </span>
            </label>
          ) : null}

          {error && !requiresConfirmation ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ reason: reason.trim(), confirmValidated: ack })}
            disabled={busy || blocked}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {busy ? "Deleting…" : `Delete ${target.kind}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The delete call itself, shared by every caller.
 *
 * Returns `requiresConfirmation` when the server refused because the target
 * was signed off (409), so the dialog can escalate rather than show a generic
 * failure.
 */
export async function runDelete(
  url: string,
  opts: { reason: string; confirmValidated: boolean },
): Promise<{ ok: boolean; requiresConfirmation: boolean; error: string | null }> {
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: opts.reason || undefined,
        confirmValidated: opts.confirmValidated,
      }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) return { ok: true, requiresConfirmation: false, error: null };
    return {
      ok: false,
      requiresConfirmation: json?.requiresConfirmation === true,
      error: json?.error ?? `Delete failed (${res.status})`,
    };
  } catch (e) {
    return { ok: false, requiresConfirmation: false, error: (e as Error).message };
  }
}
