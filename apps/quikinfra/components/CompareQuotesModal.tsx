"use client";

/**
 * CompareQuotesModal — side-by-side vendor quotation comparison for an
 * RFQ. Each vendor gets its own column with Rate + Amount sub-columns;
 * the overall cheapest vendor is labelled L1 (trophy icon + green
 * highlight), next L2, etc. Per-line winners also get a subtle green
 * accent so the buyer can spot which vendor won which line.
 *
 * Optimisation: this component is purely derived from the already-
 * fetched RFQ row (`lines` + `vendors`). It makes zero extra network
 * calls when opening. All totals, ranks, and winners are computed
 * once via `useMemo`. For very wide RFQs (many vendors) the table
 * scrolls horizontally so the modal stays usable at any breakpoint.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Crown, GitCompare, Trophy, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";

interface RfqLine {
  id?: string;
  lineId?: string;
  itemName?: string;
  itemId?: string;
  quantity?: string | number;
  uomCode?: string;
}

interface VendorRow {
  id: string;
  vendorId?: string;
  vendorName: string;
  email?: string;
  quotedRates?: Array<{ lineId: string; rate: string }>;
  quoteRemarks?: string;
}

interface Props {
  open: boolean;
  rfqId?: string;
  rfqNumber?: string;
  projectName?: string;
  vendors: VendorRow[];
  lines: RfqLine[];
  onClose: () => void;
  onEditQuote?: (vendorRowId: string) => void;
  /** For a non-L1 vendor, `justification` carries the mandatory business
   *  reason the buyer entered for not picking the lowest bid. */
  onCreatePO?: (vendorRowId: string, justification?: string) => void;
}

function lineKeyFor(line: RfqLine, fallbackIdx: number): string {
  return String(line.id ?? line.lineId ?? `row-${fallbackIdx}`);
}

function rateFor(v: VendorRow, key: string): number | null {
  const hit = (v.quotedRates ?? []).find((q) => q.lineId === key);
  if (!hit) return null;
  const n = parseFloat(String(hit.rate));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function qtyOf(l: RfqLine): number {
  const n = parseFloat(String(l.quantity ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function fmtINR(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `\u20B9 ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function rankLabel(rank: number): string {
  // L1 is the lowest total; anything beyond the ordinal shown below
  // stays as `L${n}` so the UI doesn't choke on 4-vendor-plus RFQs.
  return `L${rank}`;
}

export function CompareQuotesModal({
  open,
  rfqNumber,
  projectName,
  vendors,
  lines,
  onClose,
  onEditQuote,
  onCreatePO,
}: Props) {
  // Precompute per-vendor totals + per-line winners + rank in a single
  // memo so resizing the modal doesn't retrigger the work. For N
  // vendors and M lines this is O(N*M), which is trivial at the
  // construction-ERP scale (tens of vendors, hundreds of lines).
  const derived = useMemo(() => {
    // Skip vendors without any quoted rate — a quote-less column
    // would distort the ranking and clutter the UI.
    const quotedVendors = vendors.filter(
      (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
    );

    // Per-line minimum rate, to highlight cell winners.
    const lineMinRate: Record<string, number | null> = {};

    // Per-vendor totals (sum of rate*qty across lines they quoted).
    const vendorTotal = new Map<string, number | null>();
    for (const v of quotedVendors) vendorTotal.set(v.id, null);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const key = lineKeyFor(line, i);
      const qty = qtyOf(line);
      let minForLine: number | null = null;
      for (const v of quotedVendors) {
        const r = rateFor(v, key);
        if (r != null) {
          if (minForLine == null || r < minForLine) minForLine = r;
          const existing = vendorTotal.get(v.id);
          vendorTotal.set(v.id, (existing ?? 0) + r * qty);
        }
      }
      lineMinRate[key] = minForLine;
    }

    // Rank vendors by grand total ascending. Tiebreak by vendorName
    // so re-renders don't shuffle adjacent columns.
    const ranked = [...quotedVendors].sort((a, b) => {
      const ta = vendorTotal.get(a.id) ?? Infinity;
      const tb = vendorTotal.get(b.id) ?? Infinity;
      if (ta !== tb) return ta - tb;
      return (a.vendorName || "").localeCompare(b.vendorName || "");
    });
    const rankById = new Map<string, number>();
    ranked.forEach((v, idx) => rankById.set(v.id, idx + 1));

    const l1Id = ranked[0]?.id ?? null;

    return {
      quotedVendors: ranked,
      vendorTotal,
      lineMinRate,
      rankById,
      l1Id,
    };
  }, [vendors, lines]);

  // Non-L1 selection needs a mandatory business justification before a
  // PO can be raised (MoM: "require justification whenever a non-L1
  // vendor is selected"). `justifyFor` holds the vendor row awaiting a
  // reason; the dialog blocks until one is entered.
  const [justifyFor, setJustifyFor] = useState<string | null>(null);
  const [justifyText, setJustifyText] = useState("");

  if (!open) return null;

  const {
    quotedVendors,
    vendorTotal,
    lineMinRate,
    rankById,
    l1Id,
  } = derived;

  const hasAnyQuotes = quotedVendors.length > 0;
  const l1Vendor = quotedVendors.find((v) => v.id === l1Id) ?? null;
  const justifyVendor = justifyFor
    ? quotedVendors.find((v) => v.id === justifyFor) ?? null
    : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-100 shrink-0 bg-gradient-to-b from-orange-50/40 to-white">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Vendor Quotation Comparison
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {rfqNumber && (
                  <>
                    <span className="font-medium">RFQ Ref:</span>{" "}
                    <span className="font-mono">{rfqNumber}</span>
                  </>
                )}
                {rfqNumber && projectName && (
                  <span className="text-gray-300 mx-2">|</span>
                )}
                {projectName && (
                  <>
                    <span className="font-medium">Project:</span> {projectName}
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {!hasAnyQuotes || lines.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500">
                No vendor quotes to compare yet.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Record at least one vendor quote to see a comparison.
              </p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    {/* Row 1: vendor labels + L-rank + Edit Quote */}
                    <tr className="bg-gray-50">
                      <th
                        rowSpan={2}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200 sticky left-0 bg-gray-50 z-10 min-w-[200px]"
                      >
                        Item Description
                      </th>
                      <th
                        rowSpan={2}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200 min-w-[110px]"
                      >
                        Qty
                      </th>
                      {quotedVendors.map((v) => {
                        const rank = rankById.get(v.id) ?? 0;
                        const isL1 = v.id === l1Id;
                        return (
                          <th
                            key={v.id}
                            colSpan={2}
                            className={
                              isL1
                                ? "px-4 py-3 text-center border-r border-gray-200 bg-emerald-50"
                                : "px-4 py-3 text-center border-r border-gray-200"
                            }
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-sm font-semibold text-gray-900">
                                {v.vendorName || "\u2014"}
                              </span>
                              <span
                                className={
                                  isL1
                                    ? "inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold"
                                    : "inline-flex items-center gap-1 rounded-md bg-gray-100 text-gray-600 px-2 py-0.5 text-[10px] font-bold"
                                }
                              >
                                {isL1 && <Crown className="w-3 h-3" />}
                                {rankLabel(rank)} Bidder
                              </span>
                              {onEditQuote && (
                                <button
                                  type="button"
                                  onClick={() => onEditQuote(v.id)}
                                  className="text-[10px] text-orange-600 hover:text-orange-700 hover:underline font-medium"
                                >
                                  Edit Quote
                                </button>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                    {/* Row 2: Rate / Amount sub-headers */}
                    <tr className="bg-gray-50/60">
                      {quotedVendors.map((v) => {
                        const isL1 = v.id === l1Id;
                        return (
                          <Fragment2 key={v.id}>
                            <th
                              className={
                                isL1
                                  ? "px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-emerald-50/60"
                                  : "px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider"
                              }
                            >
                              Rate ({"\u20B9"})
                            </th>
                            <th
                              className={
                                isL1
                                  ? "px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 bg-emerald-50/60"
                                  : "px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200"
                              }
                            >
                              Amount ({"\u20B9"})
                            </th>
                          </Fragment2>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((line, i) => {
                      const key = lineKeyFor(line, i);
                      const qty = qtyOf(line);
                      const minRate = lineMinRate[key];
                      return (
                        <tr key={key}>
                          <td className="px-4 py-2.5 text-sm text-gray-900 border-r border-gray-100 sticky left-0 bg-white z-10">
                            {line.itemName ?? line.itemId ?? "\u2014"}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-700 tabular-nums border-r border-gray-100">
                            {qty.toLocaleString("en-IN")}{" "}
                            <span className="text-[10px] text-gray-500 uppercase ml-1">
                              {line.uomCode ?? ""}
                            </span>
                          </td>
                          {quotedVendors.map((v) => {
                            const r = rateFor(v, key);
                            const amt = r != null ? r * qty : null;
                            const isWinner = r != null && r === minRate;
                            const isL1 = v.id === l1Id;
                            const cellBg = isL1 ? "bg-emerald-50/30" : "";
                            return (
                              <Fragment2 key={v.id}>
                                <td
                                  className={
                                    isWinner
                                      ? `px-3 py-2.5 text-right tabular-nums text-sm font-bold text-emerald-600 ${cellBg}`
                                      : `px-3 py-2.5 text-right tabular-nums text-sm text-gray-700 ${cellBg}`
                                  }
                                >
                                  {r != null
                                    ? r.toLocaleString("en-IN", {
                                        maximumFractionDigits: 2,
                                      })
                                    : "\u2014"}
                                </td>
                                <td
                                  className={
                                    isWinner
                                      ? `px-3 py-2.5 text-right tabular-nums text-sm font-bold text-emerald-600 border-r border-gray-100 ${cellBg}`
                                      : `px-3 py-2.5 text-right tabular-nums text-sm text-gray-800 border-r border-gray-100 ${cellBg}`
                                  }
                                >
                                  {amt != null
                                    ? amt.toLocaleString("en-IN", {
                                        maximumFractionDigits: 2,
                                      })
                                    : "\u2014"}
                                </td>
                              </Fragment2>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* Grand Total */}
                    <tr className="bg-gray-50 font-semibold">
                      <td
                        className="px-4 py-3 text-xs uppercase tracking-wider text-gray-600 border-r border-gray-200 sticky left-0 bg-gray-50"
                        colSpan={2}
                      >
                        Grand Total
                      </td>
                      {quotedVendors.map((v) => {
                        const t = vendorTotal.get(v.id);
                        const isL1 = v.id === l1Id;
                        return (
                          <td
                            key={v.id}
                            colSpan={2}
                            className={
                              isL1
                                ? "px-4 py-3 text-right tabular-nums text-sm text-emerald-700 bg-emerald-100 border-r border-gray-200"
                                : "px-4 py-3 text-right tabular-nums text-sm text-gray-900 border-r border-gray-200"
                            }
                          >
                            {fmtINR(t ?? null)}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Remarks / Terms */}
                    <tr>
                      <td
                        className="px-4 py-3 text-[10px] uppercase tracking-wider font-semibold text-gray-500 border-r border-gray-200 sticky left-0 bg-white align-top"
                        colSpan={2}
                      >
                        Remarks / Terms
                      </td>
                      {quotedVendors.map((v) => (
                        <td
                          key={v.id}
                          colSpan={2}
                          className="px-4 py-3 text-xs text-gray-600 border-r border-gray-200 align-top whitespace-pre-wrap"
                        >
                          {v.quoteRemarks?.trim() || "\u2014"}
                        </td>
                      ))}
                    </tr>

                    {/* Create PO actions */}
                    <tr>
                      <td
                        className="px-4 py-3 border-r border-gray-200 sticky left-0 bg-white"
                        colSpan={2}
                      ></td>
                      {quotedVendors.map((v) => {
                        const isL1 = v.id === l1Id;
                        return (
                          <td
                            key={v.id}
                            colSpan={2}
                            className="px-4 py-3 text-center border-r border-gray-200"
                          >
                            {onCreatePO ? (
                              isL1 ? (
                                <button
                                  type="button"
                                  onClick={() => onCreatePO(v.id)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                                >
                                  <Trophy className="w-3.5 h-3.5" />
                                  Create PO
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setJustifyText("");
                                    setJustifyFor(v.id);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
                                >
                                  Create PO
                                </button>
                              )
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {quotedVendors.length > 0 && quotedVendors.length < vendors.length && (
            <p className="mt-3 text-xs text-amber-600">
              {vendors.length - quotedVendors.length} vendor
              {vendors.length - quotedVendors.length === 1 ? "" : "s"} haven&apos;t
              submitted a quote yet and aren&apos;t shown.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-3.5 flex justify-end gap-3 bg-gray-50 shrink-0">
          <PrimaryButton onClick={onClose}>Close</PrimaryButton>
        </div>

        {/* Non-L1 justification gate \u2014 a PO cannot be raised for a vendor
            that isn't the lowest bid until the buyer records why. */}
        {justifyVendor && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
                <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Justify non-L1 selection
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-700">
                      {justifyVendor.vendorName || "This vendor"}
                    </span>{" "}
                    is {rankLabel(rankById.get(justifyVendor.id) ?? 0)}, not the
                    lowest bid
                    {l1Vendor
                      ? ` (L1 \u2014 ${l1Vendor.vendorName || "lowest bidder"})`
                      : ""}
                    . A business justification is required before raising this PO.
                  </p>
                </div>
              </div>
              <div className="px-5 py-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Business justification{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={justifyText}
                  onChange={(e) => setJustifyText(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="e.g. L1 vendor's delivery lead time exceeds the site schedule; L2 can deliver within the required window."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[11px] text-gray-400">
                    Recorded on the PO for the approver&apos;s review.
                  </p>
                  <p
                    className={`text-[11px] tabular-nums ${
                      justifyText.trim().length < 50
                        ? "text-rose-500"
                        : "text-emerald-600"
                    }`}
                  >
                    {justifyText.trim().length}/50 min
                  </p>
                </div>
              </div>
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setJustifyFor(null)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={justifyText.trim().length < 50}
                  onClick={() => {
                    const target = justifyFor;
                    const reason = justifyText.trim();
                    setJustifyFor(null);
                    if (target) onCreatePO?.(target, reason);
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue to PO
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Table header/row cells render adjacent <th>/<td> pairs for each
// vendor's Rate + Amount columns. Fragment keeps the JSX tidy without
// adding wrapper elements that would break the table layout.
function Fragment2(props: { children: React.ReactNode }) {
  return <>{props.children}</>;
}
