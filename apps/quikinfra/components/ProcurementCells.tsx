"use client";

/**
 * ProcurementCells — renders the two "PO" and "GRN" line-item cells
 * shared by the PR and Indent detail tables. Answers, per requirement:
 *   • PO  — has an order been raised? (chips link to each PO)
 *   • GRN — has it arrived? (Received / Partial / Not received, with
 *           GRN-number chips linking to each receipt)
 *
 * Returns a fragment of two <td> elements so it drops straight into a
 * table row without wrapping markup.
 */

import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import type { LineProcurement } from "@/lib/purchase/procurement-types";

export function ProcurementCells({
  procurement,
}: {
  procurement?: LineProcurement | null;
}) {
  const router = useRouter();
  const p = procurement;

  return (
    <>
      {/* PO */}
      <td className="px-4 py-3 align-top">
        {p && p.poRefs.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {p.poRefs.map((po) => (
              <button
                key={po.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/purchase/orders/${po.id}`);
                }}
                title={`Open ${po.poNumber}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-50 text-accent-700 text-[11px] font-medium whitespace-nowrap hover:bg-accent-100 transition-colors"
              >
                <span>{po.poNumber}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">Not ordered</span>
        )}
      </td>

      {/* GRN */}
      <td className="px-4 py-3 align-top">
        {!p || p.grnStatus === "none" ? (
          <span className="text-[11px] text-slate-400">
            {p && p.poStatus === "ordered" ? "Awaiting delivery" : "—"}
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            <span
              className={`inline-flex items-center gap-1 w-fit text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                p.grnStatus === "received"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {p.grnStatus === "received" ? (
                <CheckCircle2 className="w-2.5 h-2.5" />
              ) : (
                <Clock className="w-2.5 h-2.5" />
              )}
              {p.grnStatus === "received" ? "Received" : "Partial"}
            </span>
            {p.grnRefs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.grnRefs.map((grn) => (
                  <button
                    key={grn.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/store/grn/${grn.id}`);
                    }}
                    title={`Open ${grn.grnNumber}`}
                    className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] whitespace-nowrap hover:bg-slate-200 transition-colors"
                  >
                    {grn.grnNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
    </>
  );
}
