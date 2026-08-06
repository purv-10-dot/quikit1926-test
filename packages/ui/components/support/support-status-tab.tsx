"use client";

/**
 * Settings → Support Status. Lists the tickets the signed-in user has raised
 * and the QuikIT team's latest response.
 *
 * Shows tickets from EVERY QuikIT app the user has raised from, not just the
 * one they're currently in — hence the App column. One queue in one place beats
 * remembering which product you were in when you hit the problem. Pass
 * `appSlug` to scope it to the current app instead.
 *
 * Render as a SIBLING of any admin-gated settings tab, not inside one: support
 * status is inherently per-user, and nesting it under an admin tab would hide
 * it from exactly the people who raise tickets.
 *
 * Uses plain `fetch` rather than react-query for the same reason as the request
 * form — @quikit/ui is consumed by apps on different react-query majors.
 */

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Paperclip } from "lucide-react";
import {
  SUPPORT_REQUEST_TYPE_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  formatSupportTicketNo,
  type SupportRequestType,
  type SupportTicketStatus,
} from "@quikit/shared";
import { DataTable, type DataTableColumn } from "../data-table";
import { Pagination } from "../pagination";
import { EmptyState } from "../empty-state";
import { TableSkeleton } from "../skeleton";

interface SupportTicketRow {
  id: string;
  ticketNo: number;
  appSlug: string;
  subject: string;
  description: string;
  requestType: SupportRequestType;
  status: SupportTicketStatus;
  priority: string;
  adminResponse: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    /** Viewer route — redirects to a fresh signed URL per request. */
    url: string;
  }>;
}

/** Status pill colours. Semantic (data state), so intentionally not accent-*. */
const STATUS_CLASSES: Record<SupportTicketStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700",
  reopened: "bg-purple-100 text-purple-700",
};

/** Display names for the App column. Falls back to the raw slug. */
const APP_LABELS: Record<string, string> = {
  admin: "Admin",
  quikasset: "QuikAsset",
  quikchat: "QuikChat",
  quikcrm: "QuikCRM",
  quikfinance: "QuikFinance",
  quikhrms: "QuikHRMS",
  quikinfra: "QuikInfra",
  quikit: "QuikIT",
  quiklms: "QuikLMS",
  quikscale: "QuikScale",
  quiksocial: "QuikSocial",
  quiksupport: "QuikSupport",
  quiktrack: "QuikTrack",
  quikvc: "QuikVC",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const PAGE_SIZE = 10;

export interface SupportStatusTabProps {
  /**
   * Ticket endpoint. Defaults to `/api/support/tickets` — override only for an
   * app whose API lives under a version prefix.
   */
  apiBase?: string;
  /** Scope the list to one app's tickets. Omitted → every app. */
  appSlug?: string;
  /** Hide the App column (useful when `appSlug` scopes the list already). */
  hideAppColumn?: boolean;
}

export function SupportStatusTab({
  apiBase = "/api/support/tickets",
  appSlug,
  hideAppColumn = false,
}: SupportStatusTabProps) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SupportTicketRow[]>([]);
  const [meta, setMeta] = useState<{ total: number; totalPages: number }>({
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (appSlug) qs.set("appSlug", appSlug);
      // `no-store`: a super-admin may have updated a ticket since this tab was
      // last opened, so a cached list is worse than a slightly slower one.
      const res = await fetch(`${apiBase}?${qs}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to load support tickets");
      }
      setRows(json.data as SupportTicketRow[]);
      setMeta({
        total: json.meta?.total ?? 0,
        totalPages: json.meta?.totalPages ?? 1,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load support tickets");
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, appSlug, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataTableColumn<SupportTicketRow>[] = [
    {
      key: "ticketNo",
      label: "Ticket ID",
      width: 110,
      render: (r) => (
        <span className="font-medium text-gray-900">{formatSupportTicketNo(r.ticketNo)}</span>
      ),
    },
    ...(hideAppColumn
      ? []
      : [
          {
            key: "appSlug",
            label: "App",
            width: 110,
            render: (r: SupportTicketRow) => APP_LABELS[r.appSlug] ?? r.appSlug,
          } as DataTableColumn<SupportTicketRow>,
        ]),
    {
      key: "requestType",
      label: "Request Type",
      width: 130,
      render: (r) => SUPPORT_REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType,
    },
    {
      key: "description",
      label: "Description",
      render: (r) => (
        <div className="max-w-[320px]">
          <div className="font-medium text-gray-900 truncate">{r.subject}</div>
          <div className="text-gray-500 truncate">{r.description}</div>
        </div>
      ),
    },
    {
      key: "attachments",
      label: "Files",
      width: 150,
      render: (r) =>
        (r.attachments?.length ?? 0) === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="flex flex-col gap-0.5 max-w-[140px]">
            {r.attachments!.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.fileName}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate"
              >
                <Paperclip className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{a.fileName}</span>
              </a>
            ))}
          </div>
        ),
    },
    {
      key: "status",
      label: "Status",
      width: 110,
      align: "center",
      render: (r) => (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
            STATUS_CLASSES[r.status] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {SUPPORT_TICKET_STATUS_LABELS[r.status] ?? r.status}
        </span>
      ),
    },
    { key: "createdAt", label: "Created", width: 110, render: (r) => fmtDate(r.createdAt) },
    { key: "updatedAt", label: "Last Updated", width: 120, render: (r) => fmtDate(r.updatedAt) },
    {
      key: "adminResponse",
      label: "Admin Response",
      render: (r) =>
        r.adminResponse ? (
          <span className="text-gray-700 line-clamp-2 max-w-[280px] inline-block">
            {r.adminResponse}
          </span>
        ) : (
          <span className="text-gray-400">Awaiting response</span>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary,#0F172A)]">Support Status</h2>
        <p className="text-sm text-[var(--color-text-secondary,#64748B)] mt-1">
          Every support request you have raised, and the QuikIT team&apos;s latest response.
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support requests yet"
          message="Use the support button at the bottom-right of any page to raise your first request."
        />
      ) : (
        <>
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(r) => r.id}
              rowClassName="hover:bg-gray-50"
              emptyMessage="No support requests yet"
            />
          </div>

          {meta.totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={page}
                totalPages={meta.totalPages}
                total={meta.total}
                limit={PAGE_SIZE}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
