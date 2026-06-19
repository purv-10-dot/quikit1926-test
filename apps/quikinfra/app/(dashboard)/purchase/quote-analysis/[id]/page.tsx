"use client";

/**
 * Comparative Statement — item-wise comparison for a single RFQ.
 *
 * The page is PURELY DERIVED from the RFQ detail response (see
 * `useRFQ`) — no additional endpoints. All per-vendor totals,
 * per-line lowest winners, and rank labels are computed once in a
 * `useMemo` keyed on the RFQ object identity, so typing in the "offered
 * qty" overrides (a client-only UX field) doesn't refire the sums.
 *
 * Selection model:
 *   - Per-vendor "SELECT" at the top picks that vendor for every
 *     item (shortlists one supplier).
 *   - Per-item "SELECT" picks a different vendor per line (split
 *     allocation). Selecting any per-item chip clears the
 *     vendor-level selection for consistency.
 *
 * The selection is local state for now — wire to a backend endpoint
 * when the "Create PO" or "Shortlist" persistence step is needed.
 */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2 } from "lucide-react";
import { PageContainer, PageSkeleton } from "@/components/PageShell";
import { useRFQ } from "@/hooks/use-approvals";

interface RfqLine {
  id?: string;
  lineId?: string;
  quantity?: number | string | null;
  itemName?: string | null;
  itemId?: string | null;
  uomCode?: string | null;
}

interface RfqVendor {
  id: string;
  vendorId?: string;
  vendorName?: string | null;
  quotedRates?: Array<{ lineId?: string; rate?: string | number }>;
}

function qtyOf(l: RfqLine): number {
  const n = parseFloat(String(l?.quantity ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function rateFor(v: RfqVendor, key: string): number | null {
  const hit = (v?.quotedRates ?? []).find((q) => q?.lineId === key);
  if (!hit) return null;
  const n = parseFloat(String(hit.rate));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function lineKeyFor(line: RfqLine, fallbackIdx: number): string {
  return String(line?.id ?? line?.lineId ?? `row-${fallbackIdx}`);
}

function fmtINR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `\u20B9${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function ComparativeStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: rfq, isLoading } = useRFQ(id);

  // Local UI state:
  //   - `vendorShortlistId` → single-vendor shortlist (takes priority).
  //   - `perLineSelection[lineKey]` → per-line vendor selection.
  //   - `offeredQty[lineKey][vendorId]` → optional override that the
  //     buyer can type if the vendor offered partial fulfilment.
  const [vendorShortlistId, setVendorShortlistId] = useState<string | null>(null);
  const [perLineSelection, setPerLineSelection] = useState<Record<string, string>>({});
  const [offeredQty, setOfferedQty] = useState<Record<string, Record<string, string>>>({});

  const { quotedVendors, lineRows, vendorTotals, vendorLowestId } = useMemo(() => {
    const vendors: RfqVendor[] = Array.isArray(rfq?.vendors) ? (rfq.vendors as RfqVendor[]) : [];
    const lines: RfqLine[] = Array.isArray(rfq?.lines) ? rfq.lines : [];
    const quotedVendors = vendors.filter(
      (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
    );

    const lineRows = lines.map((line: RfqLine, i: number) => {
      const key = lineKeyFor(line, i);
      const qty = qtyOf(line);
      const quotes = quotedVendors.map((v) => {
        const rate = rateFor(v, key);
        const amount = rate != null ? rate * qty : null;
        return { vendorId: v.id, rate, amount };
      });
      const amounts = quotes
        .map((q) => q.amount)
        .filter((x): x is number => x != null);
      const lowest = amounts.length > 0 ? Math.min(...amounts) : null;
      return {
        key,
        itemName: line.itemName ?? line.itemId ?? "\u2014",
        qty,
        uomCode: String(line.uomCode ?? "").toUpperCase(),
        quotes,
        lowestAmount: lowest,
      };
    });

    const vendorTotals = new Map<string, number>();
    for (const v of quotedVendors) {
      let sum = 0;
      for (const row of lineRows) {
        const q = row.quotes.find((x) => x.vendorId === v.id);
        if (q?.amount != null) sum += q.amount;
      }
      vendorTotals.set(v.id, sum);
    }

    let vendorLowestId: string | null = null;
    let lowestTotal = Infinity;
    for (const v of quotedVendors) {
      const t = vendorTotals.get(v.id) ?? Infinity;
      if (t < lowestTotal) {
        lowestTotal = t;
        vendorLowestId = v.id;
      }
    }

    return { quotedVendors, lineRows, vendorTotals, vendorLowestId };
  }, [rfq]);

  if (isLoading) return <PageSkeleton />;
  if (!rfq) {
    return (
      <PageContainer>
        <p className="text-sm text-gray-500 py-12 text-center">RFQ not found</p>
      </PageContainer>
    );
  }

  const getOfferedQty = (lineKey: string, vendorId: string, defaultQty: number): string => {
    return offeredQty[lineKey]?.[vendorId] ?? String(defaultQty);
  };

  const setOfferedQtyFor = (lineKey: string, vendorId: string, value: string) => {
    setOfferedQty((prev) => ({
      ...prev,
      [lineKey]: { ...(prev[lineKey] ?? {}), [vendorId]: value },
    }));
  };

  const isLineSelected = (lineKey: string, vendorId: string): boolean => {
    if (vendorShortlistId) return vendorShortlistId === vendorId;
    return perLineSelection[lineKey] === vendorId;
  };

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <button
          type="button"
          onClick={() => router.push("/purchase/quote-analysis")}
          className="p-1.5 mt-0.5 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Comparative Statement{" "}
            <span className="text-indigo-600 font-medium">
              &mdash; Comparison Qty Wise
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Select lowest quotes per item or shortlist a single vendor.
          </p>
        </div>
      </div>

      {/* RFQ info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-gray-500">Quotation Registration No</div>
          <div className="text-sm font-semibold text-gray-900 font-mono mt-0.5">
            {rfq.rfqNumber ?? "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-gray-500">Project Name</div>
          <div className="text-sm font-semibold text-gray-900 mt-0.5">
            {rfq.projectName ?? "—"}
          </div>
        </div>
      </div>

      {/* Totals summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-900">
            Total {quotedVendors.length} quote
            {quotedVendors.length === 1 ? "" : "s"}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 shadow-sm shadow-rose-300" />
              Lowest Quote
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Normal Quote
            </span>
          </div>
        </div>
        {quotedVendors.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No vendor quotes to analyse yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {quotedVendors.map((v) => {
              const total = vendorTotals.get(v.id) ?? 0;
              const isLowest = v.id === vendorLowestId;
              const isShortlisted = vendorShortlistId === v.id;
              return (
                <VendorSummaryCard
                  key={v.id}
                  name={v.vendorName || v.vendorId || "Vendor"}
                  total={total}
                  isLowest={isLowest}
                  isShortlisted={isShortlisted}
                  onSelect={() => {
                    setVendorShortlistId((prev) => (prev === v.id ? null : v.id));
                    setPerLineSelection({});
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Per-item rows */}
      <div className="space-y-3">
        {lineRows.map((row) => (
          <div
            key={row.key}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
          >
            <div className="px-5 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {row.itemName}
              </span>
              <span className="text-[11px] text-gray-500">
                ({row.qty.toLocaleString("en-IN")} {row.uomCode})
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-0">
              <div className="px-5 py-4 border-r border-gray-100 bg-gray-50/40 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">Target Qty:</span>
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {row.qty.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">Unit:</span>
                  <span className="font-semibold text-gray-800 uppercase">
                    {row.uomCode || "—"}
                  </span>
                </div>
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {row.quotes.length === 0 && (
                  <p className="text-xs text-gray-400 italic col-span-full py-4 text-center">
                    No vendor has quoted for this line yet.
                  </p>
                )}
                {row.quotes.map((q) => {
                  const v = quotedVendors.find((x) => x.id === q.vendorId);
                  if (!v || q.rate == null || q.amount == null) return null;
                  const isLowest = q.amount === row.lowestAmount;
                  const selected = isLineSelected(row.key, v.id);
                  return (
                    <VendorLineCard
                      key={q.vendorId}
                      amount={q.amount}
                      rate={q.rate}
                      uomCode={row.uomCode}
                      offeredQty={getOfferedQty(row.key, v.id, row.qty)}
                      onOfferedQtyChange={(val) =>
                        setOfferedQtyFor(row.key, v.id, val)
                      }
                      isLowest={isLowest}
                      isSelected={selected}
                      onSelect={() => {
                        setVendorShortlistId(null);
                        setPerLineSelection((prev) => ({
                          ...prev,
                          [row.key]: prev[row.key] === v.id ? "" : v.id,
                        }));
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function VendorSummaryCard({
  name,
  total,
  isLowest,
  isShortlisted,
  onSelect,
}: {
  name: string;
  total: number;
  isLowest: boolean;
  isShortlisted: boolean;
  onSelect: () => void;
}) {
  const baseHeaderCls = isLowest
    ? "bg-gradient-to-r from-rose-500 to-orange-500 text-white"
    : "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white";
  const cardShadow = isLowest
    ? "shadow-md shadow-rose-200/50"
    : "shadow-sm";
  return (
    <div
      className={
        isShortlisted
          ? "rounded-xl border-2 border-indigo-500 bg-white shadow-lg shadow-indigo-200/50 overflow-hidden"
          : `rounded-xl border border-gray-200 bg-white ${cardShadow} overflow-hidden hover:shadow-md transition-shadow`
      }
    >
      <div
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold truncate ${baseHeaderCls}`}
      >
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{name}</span>
      </div>
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">
          Total Amount
        </div>
        <div className="flex items-center justify-between mt-1">
          <span
            className={
              isLowest
                ? "text-sm font-bold text-rose-700 tabular-nums"
                : "text-sm font-bold text-gray-900 tabular-nums"
            }
          >
            {fmtINR(total)}
          </span>
          <button
            type="button"
            onClick={onSelect}
            className={
              isShortlisted
                ? "inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-indigo-600 text-white shadow-sm"
                : isLowest
                  ? "inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-sm hover:shadow-md hover:shadow-rose-200 transition-shadow"
                  : "inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm hover:shadow-md transition-shadow"
            }
          >
            {isShortlisted && <CheckCircle2 className="w-3 h-3" />}
            {isShortlisted ? "SHORTLISTED" : "SELECT"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VendorLineCard({
  amount,
  rate,
  uomCode,
  offeredQty,
  onOfferedQtyChange,
  isLowest,
  isSelected,
  onSelect,
}: {
  amount: number;
  rate: number;
  uomCode: string;
  offeredQty: string;
  onOfferedQtyChange: (v: string) => void;
  isLowest: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const headerCls = isLowest
    ? "bg-gradient-to-r from-rose-500 to-orange-500 text-white"
    : "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white";
  const cardShadow = isLowest
    ? "shadow-md shadow-rose-200/40"
    : "shadow-sm";
  return (
    <div
      className={
        isSelected
          ? "rounded-xl border-2 border-indigo-500 bg-white shadow-lg shadow-indigo-200/50 overflow-hidden"
          : `rounded-xl border border-gray-200 bg-white ${cardShadow} overflow-hidden hover:shadow-md transition-shadow`
      }
    >
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-bold tabular-nums ${headerCls}`}
      >
        <span>{fmtINR(amount)}</span>
        <button
          type="button"
          onClick={onSelect}
          className={
            isSelected
              ? "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-600 text-white"
              : "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-white/90 text-gray-800 hover:bg-white"
          }
        >
          {isSelected && <CheckCircle2 className="w-3 h-3" />}
          {isSelected ? "SELECTED" : "SELECT"}
        </button>
      </div>
      <div className="px-3 py-2 text-xs space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Rate / {uomCode || "UNIT"}</span>
          <span className="font-semibold text-gray-800 tabular-nums">
            {"\u20B9"}
            {rate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Offered Qty.</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={offeredQty}
            onChange={(e) => onOfferedQtyChange(e.target.value)}
            className="w-20 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
