"use client";

import { Eye, Send, FileText } from "lucide-react";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import { resolveVendorPhone } from "@/lib/whatsapp";
import { formatDate } from "@/lib/format/datetime";
import { StatusChip } from "@/components/PageShell";
import { type ColDef } from "@/components/DataTable";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
import type { PoRow } from "../lib/types";

type Vendor = {
  id: string;
  companyName?: string;
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
};

export function buildOrderColumns(deps: {
  handleSubmit: (row: { id: string; poNumber?: string | null }) => void;
  setPeekTarget: (t: { type: SourceDocType; id: string } | null) => void;
  router: { push: (href: string) => void };
  vendorById: Map<string, Vendor>;
}): ColDef<PoRow>[] {
  const { handleSubmit, setPeekTarget, router, vendorById } = deps;
  return [
    {
      // Single-line PO cell. Date moved to its own column; chained
      // source ref lives in the Source column. URGENT pill stays
      // inline with the number for at-a-glance triage.
      key: "poNumber", label: "PO Number", sortable: true, searchable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="font-semibold text-orange-600 hover:text-orange-700 hover:underline"
            onClick={() => router.push(`/purchase/orders/${row.id}`)}
          >
            {row.poNumber}
          </button>
          {row.isUrgentLocal && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              Urgent
            </span>
          )}
        </div>
      ),
    },
    {
      // Combined source chip — RFQ-backed POs show the RFQ ref, fully
      // indent-only POs fall back to the indent. Renders as a small
      // tinted pill instead of an underlined link so the row reads
      // less like a wall of hyperlinks.
      key: "sourceRfqNumber",
      label: "Source",
      sortable: true,
      searchable: true,
      render: (row) => {
        if (row.sourceRfqNumber && row.sourceRfqId) {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeekTarget({ type: "rfq", id: row.sourceRfqId ?? "" });
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-[11px] font-medium hover:bg-orange-100 transition-colors"
              title="View RFQ details"
            >
              <span className="">{row.sourceRfqNumber}</span>
            </button>
          );
        }
        if (row.sourceIndentNumber && row.sourceIndentId) {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeekTarget({ type: "indent", id: row.sourceIndentId ?? "" });
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium hover:bg-slate-200 transition-colors"
              title="View Indent details"
            >
              <span className="text-slate-400">via</span>
              <span className="">{row.sourceIndentNumber}</span>
            </button>
          );
        }
        return <span className="text-[11px] text-slate-300">—</span>;
      },
    },
    {
      key: "vendorName",
      label: "Vendor",
      sortable: true,
      searchable: true,
      render: (row) => {
        const name = row.vendorName?.trim() || "—";
        const phone = resolveVendorPhone(row, vendorById);
        const poRef = row.poNumber ? String(row.poNumber) : "";
        const message = poRef
          ? `Hello, regarding Purchase Order ${poRef}.`
          : undefined;
        return (
          <div className="flex items-center gap-2 min-w-0 max-w-[240px]">
            <span className="truncate text-slate-800" title={name}>
              {name}
            </span>
            {phone ? (
              <WhatsAppLink
                phone={phone}
                message={message}
                title={
                  poRef
                    ? `WhatsApp vendor about ${poRef}`
                    : "WhatsApp vendor"
                }
              />
            ) : (
              <span
                className="shrink-0 text-[10px] text-slate-400"
                title="Add vendor mobile in Masters → Vendors"
              >
                No mobile
              </span>
            )}
          </div>
        );
      },
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "poDate", label: "Date", type: "date", sortable: true },
    {
      key: "deliveryDate",
      label: "Delivery Date",
      type: "date",
      sortable: true,
      render: (row) => {
        const raw = row.deliveryDate ? String(row.deliveryDate).slice(0, 10) : "";
        if (!raw) return <span className="text-slate-300">—</span>;
        const label = formatDate(raw);
        if (row.isOverdue) {
          const ms = Date.now() - new Date(raw).getTime();
          const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
          return (
            <div className="flex items-center gap-2">
              <span className="text-amber-700 tabular-nums">{label}</span>
              <span
                className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
                title={`Delivery overdue by ${days} day${days === 1 ? "" : "s"}`}
              >
                {days}d late
              </span>
            </div>
          );
        }
        return <span className="text-slate-700 tabular-nums">{label}</span>;
      },
    },
    {
      key: "totalAmount", label: "Amount", type: "number", sortable: true,
      render: (row) => row.totalAmount ? `₹ ${Number(row.totalAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "pending_approval", "approved", "partially_received", "fully_received", "closed"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions", label: "Actions", width: "120px", align: "right", sortable: false,
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => router.push(`/purchase/orders/${row.id}`)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              window.open(
                `/api/purchase/orders/${row.id}/preview/pdf`,
                "_blank",
                "noopener",
              )
            }
            className="p-1.5 rounded hover:bg-orange-50 text-gray-500 hover:text-orange-600 transition-colors"
            title="View PDF"
          >
            <FileText className="w-4 h-4" />
          </button>
          {row.status === "draft" && (
            <button
              onClick={() => handleSubmit(row)}
              className="p-1.5 rounded hover:bg-orange-50 text-orange-600 hover:text-orange-700 transition-colors"
              title="Submit for Approval"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];
}
