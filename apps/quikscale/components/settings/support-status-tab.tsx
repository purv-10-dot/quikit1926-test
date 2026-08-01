"use client";

/**
 * Settings → Support Status. Lists the tickets the signed-in user has raised
 * and the QuikIT team's latest response.
 *
 * Rendered as a SIBLING of the Configurations tab, not inside it:
 * Configurations is admin-gated, while support status is inherently per-user —
 * nesting it there would hide it from exactly the people who raise tickets.
 *
 * Uses the shared @quikit/ui DataTable, not the app's FeatureGrid — this is a
 * plain read-only list, unrelated to the four locked KPI/Priority/WWW tables.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, Pagination, EmptyState, TableSkeleton, type DataTableColumn } from "@quikit/ui";
import { LifeBuoy } from "lucide-react";
import {
  SUPPORT_REQUEST_TYPE_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  formatSupportTicketNo,
  type SupportRequestType,
  type SupportTicketStatus,
} from "@quikit/shared";

interface SupportTicketRow {
  id: string;
  ticketNo: number;
  subject: string;
  description: string;
  requestType: SupportRequestType;
  status: SupportTicketStatus;
  priority: string;
  adminResponse: string | null;
  respondedAt: string | null;
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const PAGE_SIZE = 10;

export function SupportStatusTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["support-tickets", page],
    queryFn: async () => {
      const res = await fetch(`/api/support/tickets?page=${page}&limit=${PAGE_SIZE}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load support tickets");
      return json as { data: SupportTicketRow[]; meta: { total: number; totalPages: number } };
    },
    // Always refetch on mount — a super-admin may have updated a ticket since
    // the tab was last opened.
    staleTime: 0,
  });

  const columns: DataTableColumn<SupportTicketRow>[] = [
    {
      key: "ticketNo",
      label: "Ticket ID",
      width: 110,
      render: (r) => (
        <span className="font-medium text-gray-900">{formatSupportTicketNo(r.ticketNo)}</span>
      ),
    },
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
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Support Status</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Every support request you have raised, and the QuikIT team&apos;s latest response.
        </p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load support tickets"}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          icon={LifeBuoy}
          title="No support requests yet"
          message="Use the Support button in the header to raise your first request."
        />
      ) : (
        <>
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <DataTable
              columns={columns}
              data={data.data}
              rowKey={(r) => r.id}
              rowClassName="hover:bg-gray-50 cursor-pointer"
              emptyMessage="No support requests yet"
            />
          </div>

          {data.meta.totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={page}
                totalPages={data.meta.totalPages}
                total={data.meta.total}
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
