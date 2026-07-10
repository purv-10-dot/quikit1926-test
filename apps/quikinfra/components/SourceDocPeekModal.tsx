"use client";

/**
 * SourceDocPeekModal — quick-look popup for an upstream document in the
 * purchase chain (PR → Indent → RFQ → PO).
 *
 * Used from the LIST/GRID pages — clicking a source link there opens
 * this lightweight peek so the user can verify they picked the right
 * upstream doc without a full navigation. DETAIL pages route directly
 * via `router.push` instead, since they already have a header and
 * back button to support deeper navigation.
 *
 * Given `{ type, id }` it fetches the doc via the canonical GET
 * endpoint and renders Date / Status / Project + an Items table.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, FileText, Loader2, AlertTriangle, Search } from "lucide-react";
import { StatusChip } from "./PageShell";

export type SourceDocType = "pr" | "indent" | "rfq" | "po";

interface PeekFrame {
  type: SourceDocType;
  id: string;
}

interface Props {
  open: boolean;
  initial: PeekFrame | null;
  onClose: () => void;
}

// Per-type metadata: label + GET endpoint + line-number aliases so one
// component can render all four doc shapes without branching everywhere.
const TYPE_META: Record<
  SourceDocType,
  {
    title: string;
    numberFields: string[];
    endpoint: (id: string) => string;
  }
> = {
  pr: {
    title: "Purchase Requisition Details",
    numberFields: ["prNumber", "mrNumber"],
    endpoint: (id) => `/api/purchase/requisitions/${id}`,
  },
  indent: {
    title: "Purchase Indent Details",
    numberFields: ["indentNumber"],
    endpoint: (id) => `/api/purchase/indents/${id}`,
  },
  rfq: {
    title: "RFQ Details",
    numberFields: ["rfqNumber"],
    endpoint: (id) => `/api/purchase/rfqs/${id}`,
  },
  po: {
    title: "Purchase Order Details",
    numberFields: ["poNumber"],
    endpoint: (id) => `/api/purchase/orders/${id}`,
  },
};

// Read the doc's identifier robustly — demo-store records occasionally
// use alternate field names (e.g. `mrNumber` vs `prNumber`).
function pickNumber(
  doc: Record<string, unknown> | null | undefined,
  fields: string[],
): string {
  for (const f of fields) {
    if (doc?.[f]) return String(doc[f]);
  }
  return doc?.id != null ? String(doc.id) : "—";
}

// Resolve qty/uom/name from a line regardless of which writer produced
// it. Lines flow through PR → Indent → RFQ → PO, each layer adds
// aliases, so a defensive read keeps the peek modal useful no matter
// where in the chain we land.
function readLine(line: Record<string, unknown>) {
  const name = String(
    line.itemName ?? line.itemDescription ?? line.itemId ?? "—",
  );
  const qtyRaw =
    line.quantity ??
    line.qtyRequired ??
    line.qtyRequested ??
    line.orderedQty ??
    line.poQty ??
    0;
  const qty = parseFloat(String(qtyRaw)) || 0;
  const uom = String(line.uomCode ?? line.uom ?? "—");
  return { name, qty, uom };
}

export function SourceDocPeekModal({ open, initial, onClose }: Props) {
  const [search, setSearch] = useState("");

  // Reset search whenever the modal is re-opened so a stale filter
  // from a previous peek doesn't hide the new doc's items.
  useEffect(() => {
    if (open) setSearch("");
  }, [open, initial?.id]);

  const meta = initial ? TYPE_META[initial.type] : null;

  const { data: doc, isLoading, isError, error } = useQuery({
    queryKey: ["source-doc-peek", initial?.type, initial?.id],
    queryFn: () => {
      if (!initial || !meta) return Promise.resolve(null);
      return fetch(meta.endpoint(initial.id)).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<Record<string, unknown>>;
      });
    },
    enabled: !!initial && open,
  });

  // Coerce a dynamic doc field (typed `unknown`) to a display string.
  const str = (v: unknown): string | undefined =>
    v == null ? undefined : String(v);

  const lines = useMemo(() => {
    const raw: Record<string, unknown>[] = Array.isArray(doc?.lines)
      ? (doc.lines as Record<string, unknown>[])
      : [];
    if (!search) return raw;
    const q = search.toLowerCase();
    return raw.filter((l) => {
      const { name } = readLine(l);
      return name.toLowerCase().includes(q);
    });
  }, [doc, search]);

  if (!open || !initial || !meta) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 rounded-t-2xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 truncate">
                {meta.title}
              </h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                {doc ? pickNumber(doc, meta.numberFields) : "Loading…"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : isError || !doc ? (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {(error as Error)?.message ?? "Could not load document."}
              </span>
            </div>
          ) : (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-6 mb-5">
                <Field
                  label="Date"
                  value={
                    str(doc.requestDate) ??
                    str(doc.indentDate) ??
                    str(doc.rfqDate) ??
                    str(doc.poDate) ??
                    str(doc.createdAt)?.slice(0, 10) ??
                    "—"
                  }
                />
                <Field
                  label="Status"
                  value={<StatusChip status={str(doc.status) ?? "—"} />}
                />
                <Field label="Project" value={str(doc.projectName) ?? "—"} />
              </div>

              {/* Items table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Items</h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search items…"
                        className="text-xs pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 w-40"
                      />
                    </div>
                    <span className="inline-flex items-center text-[10px] font-semibold px-2 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100">
                      {lines.length} {lines.length === 1 ? "Item" : "Items"}
                    </span>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-[10px] uppercase font-bold text-gray-500">
                        <th className="px-4 py-2 text-left">Material</th>
                        <th className="px-4 py-2 text-right w-24">Quantity</th>
                        <th className="px-4 py-2 text-left w-16">UOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-6 text-center text-xs text-gray-500"
                          >
                            No line items
                          </td>
                        </tr>
                      ) : (
                        lines.map((line, i: number) => {
                          const { name, qty, uom } = readLine(line);
                          return (
                            <tr key={String(line.lineId ?? line.id ?? i)}>
                              <td className="px-4 py-2.5 text-sm text-gray-900">
                                {name}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-right text-gray-700 tabular-nums">
                                {qty > 0 ? qty.toLocaleString("en-IN") : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-600 uppercase">
                                {uom}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <div className="text-sm text-gray-900 mt-1">{value ?? "—"}</div>
    </div>
  );
}
