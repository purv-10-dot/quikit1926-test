"use client";

/**
 * "Track your requests" view — the user's own tickets, inside the panel.
 *
 * This is the tracking surface EVERY app gets. The full Settings → Support
 * Status table (`SupportStatusTab`) is the richer version, but it can only live
 * where an app actually has a per-user settings page — and in several apps the
 * whole settings subtree is admin-gated, which would hide support status from
 * exactly the people who raise tickets. Putting the list in the panel means
 * "raise it" and "check on it" are one button away in all of them.
 *
 * Shows tickets from every QuikIT app, not just the current one: a user who
 * raised something from QuikCRM and then opens QuikScale should still find it.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  SUPPORT_REQUEST_TYPE_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  formatSupportTicketNo,
  type SupportRequestType,
  type SupportTicketStatus,
} from "@quikit/shared";

interface TicketRow {
  id: string;
  ticketNo: number;
  appSlug: string;
  subject: string;
  description: string;
  requestType: SupportRequestType;
  status: SupportTicketStatus;
  adminResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Status pill colours. Semantic (data state), so intentionally not accent-*. */
const STATUS_CLASSES: Record<SupportTicketStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700",
  reopened: "bg-purple-100 text-purple-700",
};

/** Most recent N — the panel is 380px wide, not a table. */
const LIMIT = 20;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SupportRequests({ apiBase }: { apiBase: string }) {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // `no-store`: a super-admin may have responded since this view was last
      // opened, so a cached list is worse than a slightly slower one.
      const res = await fetch(`${apiBase}?page=1&limit=${LIMIT}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to load your requests");
      }
      setRows(json.data as TicketRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load your requests");
    } finally {
      setIsLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-px" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-neutral-50)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">No requests yet</p>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Anything you raise here will show up in this list with its status and our reply.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {rows.map((r) => {
        const isOpen = expanded === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => setExpanded(isOpen ? null : r.id)}
            aria-expanded={isOpen}
            className="w-full text-left p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-accent-300 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                {formatSupportTicketNo(r.ticketNo)}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                  STATUS_CLASSES[r.status] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {SUPPORT_TICKET_STATUS_LABELS[r.status] ?? r.status}
              </span>
            </div>

            <p
              className={`mt-1 text-sm font-medium text-[var(--color-text-primary)] ${
                isOpen ? "" : "truncate"
              }`}
            >
              {r.subject}
            </p>

            <p className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
              {SUPPORT_REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType} · {fmtDate(r.createdAt)}
            </p>

            {isOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {r.description}
                </p>
                <div className="rounded-lg bg-[var(--color-neutral-100)] px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    QuikIT Support
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                    {r.adminResponse ?? "Awaiting response — we'll get back to you shortly."}
                  </p>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
