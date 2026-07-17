import { Eye, Send, CheckCircle2, GitCompare, FileText } from "lucide-react";
import { StatusChip } from "@/components/PageShell";
import { type ColDef } from "@/components/DataTable";
import type {
  RfqRow,
  RfqVendor,
  PeekTarget,
  AddQuoteCtx,
  CompareCtx,
} from "../lib/types";

export interface RfqColumnDeps {
  router: { push: (href: string) => void };
  setPeekTarget: (v: PeekTarget | null) => void;
  setAddQuoteCtx: (v: AddQuoteCtx | null) => void;
  setCompareCtx: (v: CompareCtx | null) => void;
  setSubmitError: (v: string | null) => void;
  setSubmitTarget: (v: RfqRow | null) => void;
}

export function buildRfqColumns({
  router,
  setPeekTarget,
  setAddQuoteCtx,
  setCompareCtx,
  setSubmitError,
  setSubmitTarget,
}: RfqColumnDeps): ColDef<RfqRow>[] {
  return [
    {
      key: "rfqNumber",
      label: "RFQ No",
      sortable: true,
      searchable: true,
      render: (row) => (
        <span
          className="text-orange-600 cursor-pointer hover:underline font-medium"
          onClick={() => router.push(`/purchase/rfqs/${row.id}`)}
        >
          {row.rfqNumber}
        </span>
      ),
    },
    {
      key: "sourceIndentNumber",
      label: "Source Indent",
      sortable: true,
      searchable: true,
      render: (row) =>
        row.sourceIndentNumber && row.sourceIndentId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPeekTarget({ type: "indent", id: row.sourceIndentId ?? "" });
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-[11px] font-medium hover:bg-orange-100 transition-colors"
            title="View Indent details"
          >
            {row.sourceIndentNumber}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400 italic">—</span>
        ),
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "dueDate", label: "Due Date", type: "date", sortable: true },
    {
      key: "lineCount",
      label: "Items",
      type: "number",
      sortable: true,
      render: (row) => `${row.lineCount ?? 0} items`,
    },
    {
      // Vendors column — per-vendor status row. Each vendor gets its
      // own line with an "Add Quote" link that flips to a green
      // "Quoted" badge the moment rates are saved for that vendor.
      // Progress pill on top gives a quick glance; overflow beyond 4
      // vendors collapses to "+N more" (hover to see the names).
      key: "_vendors",
      label: "Vendors",
      width: "190px",
      render: (row) => {
        const vendors: RfqVendor[] = Array.isArray(row.vendors) ? row.vendors : [];
        if (vendors.length === 0) {
          return <span className="text-[11px] text-gray-400 italic">—</span>;
        }
        const quotedCount = vendors.filter(
          (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
        ).length;
        const total = vendors.length;
        const allQuoted = quotedCount === total;
        const MAX_VISIBLE = 4;
        const visible = vendors.slice(0, MAX_VISIBLE);
        const overflow = total - visible.length;

        return (
          <div className="flex flex-col gap-1.5">
            <span
              className={
                allQuoted
                  ? "self-start inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold"
                  : "self-start inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px] font-semibold"
              }
            >
              {allQuoted && <CheckCircle2 className="w-3 h-3" />}
              {quotedCount}/{total} quoted
            </span>
            <ul className="space-y-0.5">
              {visible.map((v, i) => {
                const hasQuoted =
                  Array.isArray(v.quotedRates) && v.quotedRates.length > 0;
                const name =
                  v.vendorName || v.vendorId || `Vendor ${i + 1}`;
                const tip = v.email ? `${name} — ${v.email}` : name;
                return (
                  <li
                    key={v.id ?? v.vendorId ?? i}
                    title={`${tip} · ${hasQuoted ? "Quoted" : "Pending"}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={
                          hasQuoted
                            ? "w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                            : "w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0"
                        }
                      />
                      <span
                        className={
                          hasQuoted
                            ? "text-gray-800 truncate max-w-[100px]"
                            : "text-gray-500 truncate max-w-[100px]"
                        }
                      >
                        {name}
                      </span>
                    </div>
                    {hasQuoted ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddQuoteCtx({
                            rfqId: row.id,
                            rfqNumber: row.rfqNumber ?? "",
                            vendors,
                            lines: Array.isArray(row.lines) ? row.lines : [],
                            initialVendorRowId: v.id,
                          });
                        }}
                        title="Click to edit this quote"
                        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline shrink-0"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Quoted
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddQuoteCtx({
                            rfqId: row.id,
                            rfqNumber: row.rfqNumber ?? "",
                            vendors,
                            lines: Array.isArray(row.lines) ? row.lines : [],
                            initialVendorRowId: v.id,
                          });
                        }}
                        className="text-[11px] text-orange-600 hover:text-orange-700 hover:underline font-medium shrink-0"
                      >
                        Add Quote
                      </button>
                    )}
                  </li>
                );
              })}
              {overflow > 0 && (
                <li
                  title={vendors
                    .slice(MAX_VISIBLE)
                    .map((v) => v.vendorName || v.vendorId || "Vendor")
                    .join(", ")}
                  className="text-[11px] text-gray-400 italic pl-3.5"
                >
                  +{overflow} more
                </li>
              )}
            </ul>
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        "draft",
        "pending_approval",
        "approved",
        "sent",
        "responses_received",
        "evaluated",
        "closed",
        "rejected",
      ],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "210px",
      sortable: false,
      align: "right",
      render: (row) => {
        const rowVendors: RfqVendor[] = Array.isArray(row.vendors) ? row.vendors : [];
        const anyQuoted = rowVendors.some(
          (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
        );
        const isDraft = row.status === "draft";
        return (
          <div className="flex items-center justify-end gap-1.5">
            {anyQuoted && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCompareCtx({
                    rfqId: row.id,
                    rfqNumber: row.rfqNumber ?? "",
                    projectName: row.projectName ?? "",
                    vendors: rowVendors,
                    lines: Array.isArray(row.lines) ? row.lines : [],
                  });
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100"
                title="Compare vendor quotes"
              >
                <GitCompare className="w-3.5 h-3.5" />
                Compare
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/purchase/rfqs/${row.id}`);
              }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(
                  `/api/purchase/rfqs/${row.id}/preview/pdf`,
                  "_blank",
                  "noopener",
                );
              }}
              className="p-1.5 rounded hover:bg-orange-50 text-gray-500 hover:text-orange-600"
              title="View PDF"
            >
              <FileText className="w-4 h-4" />
            </button>
            {isDraft && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSubmitError(null);
                  setSubmitTarget(row);
                }}
                className="p-1.5 rounded hover:bg-gray-100 text-orange-500"
                title="Submit for Approval"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];
}
