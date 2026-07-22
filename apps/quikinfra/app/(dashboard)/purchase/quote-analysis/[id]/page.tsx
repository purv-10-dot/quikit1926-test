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
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, FileText } from "lucide-react";
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
  // Non-L1 justification gate (MoM: mandatory reason when a vendor that
  // isn't the lowest bid is selected). `justifyVendorId` is the vendor
  // awaiting a reason; `shortlistReason` is the recorded justification
  // for the current non-L1 shortlist.
  const [justifyVendorId, setJustifyVendorId] = useState<string | null>(null);
  const [justifyText, setJustifyText] = useState("");
  const [shortlistReason, setShortlistReason] = useState<string | null>(null);

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

  const lowestVendor =
    quotedVendors.find((v) => v.id === vendorLowestId) ?? null;
  const justifyVendor = justifyVendorId
    ? quotedVendors.find((v) => v.id === justifyVendorId) ?? null
    : null;

  // Shortlist a vendor. Toggling off, or picking the lowest (L1) bid,
  // is immediate; picking any non-L1 vendor first requires a business
  // justification via the dialog below.
  const chooseVendor = (vendorId: string) => {
    if (vendorShortlistId === vendorId) {
      setVendorShortlistId(null);
      setShortlistReason(null);
      setPerLineSelection({});
      return;
    }
    if (vendorId !== vendorLowestId) {
      setJustifyText("");
      setJustifyVendorId(vendorId);
      return;
    }
    setVendorShortlistId(vendorId);
    setShortlistReason(null);
    setPerLineSelection({});
  };

  const shortlistedVendor = vendorShortlistId
    ? quotedVendors.find((v) => v.id === vendorShortlistId) ?? null
    : null;

  // Raise a PO for the shortlisted vendor — routes to the PO create
  // drawer prefilled with this vendor + the RFQ's items at their quoted
  // rates (same flow as the RFQ compare modal). Non-L1 selections carry
  // their justification through so it lands on the PO.
  const createPO = () => {
    if (!vendorShortlistId) return;
    const params = new URLSearchParams({ rfqId: id, vendorRowId: vendorShortlistId });
    if (shortlistReason) params.set("nonL1Justification", shortlistReason);
    router.push(`/purchase/orders?${params.toString()}`);
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
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">
            Comparative Statement{" "}
            <span className="text-accent-600 font-medium">
              &mdash; Comparison Qty Wise
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Select lowest quotes per item or shortlist a single vendor.
          </p>
        </div>
        {/* Create PO — enabled once a vendor is shortlisted; opens the PO
            drawer prefilled with that vendor + its quoted rates. */}
        <div className="ml-auto shrink-0 flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={createPO}
            disabled={!vendorShortlistId}
            title={
              vendorShortlistId
                ? "Create a PO for the shortlisted vendor"
                : "Shortlist a vendor first"
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-b from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 shadow-brand active:translate-y-[1px] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <FileText className="w-4 h-4" /> Create PO
          </button>
          {shortlistedVendor && (
            <span className="text-[11px] text-gray-500">
              for{" "}
              <span className="font-medium text-gray-700">
                {shortlistedVendor.vendorName || shortlistedVendor.vendorId}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* RFQ info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] text-gray-500">Quotation Registration No</div>
          <div className="text-sm font-semibold text-gray-900 mt-0.5">
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
                  onSelect={() => chooseVendor(v.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Non-L1 justification banner */}
      {vendorShortlistId && shortlistReason && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <span className="font-semibold">Non-L1 selection justified: </span>
            {shortlistReason}
          </div>
        </div>
      )}

      {/* Item-wise comparison */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-gradient-to-b from-accent-500 to-accent-600" />
          Item-wise Comparison
        </h2>
        <span className="text-[11px] text-gray-500">
          {lineRows.length} {lineRows.length === 1 ? "item" : "items"} · lowest
          rate per item highlighted
        </span>
      </div>
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
                  if (!v) return null;
                  const name = v.vendorName || v.vendorId || "Vendor";
                  // Vendor didn't quote THIS line — show a muted "Not
                  // quoted" card so every vendor stays visible and it's
                  // obvious who skipped the line (rather than hiding it).
                  if (q.rate == null || q.amount == null) {
                    return (
                      <div
                        key={q.vendorId}
                        className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 overflow-hidden"
                      >
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-100">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{name}</span>
                        </div>
                        <div className="px-3 py-4 text-xs text-gray-400 italic text-center">
                          Not quoted for this item
                        </div>
                      </div>
                    );
                  }
                  const isLowest = q.amount === row.lowestAmount;
                  const selected = isLineSelected(row.key, v.id);
                  return (
                    <VendorLineCard
                      key={q.vendorId}
                      name={name}
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

      {/* Non-L1 justification gate — selecting a vendor that isn't the
          lowest bid requires a business reason first. */}
      {justifyVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
                    {justifyVendor.vendorName || justifyVendor.vendorId || "This vendor"}
                  </span>{" "}
                  isn&apos;t the lowest bid
                  {lowestVendor
                    ? ` (L1 — ${lowestVendor.vendorName || lowestVendor.vendorId || "lowest bidder"})`
                    : ""}
                  . A business justification is required to select it.
                </p>
              </div>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Business justification <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={justifyText}
                onChange={(e) => setJustifyText(e.target.value)}
                rows={4}
                autoFocus
                placeholder="e.g. L1 vendor's delivery lead time exceeds the site schedule; L2 can deliver within the required window."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 resize-none"
              />
              <p
                className={`text-[11px] tabular-nums mt-1 text-right ${
                  justifyText.trim().length < 50
                    ? "text-rose-500"
                    : "text-emerald-600"
                }`}
              >
                {justifyText.trim().length}/50 min
              </p>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setJustifyVendorId(null)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={justifyText.trim().length < 50}
                onClick={() => {
                  const target = justifyVendorId;
                  const reason = justifyText.trim();
                  setJustifyVendorId(null);
                  if (target) {
                    setVendorShortlistId(target);
                    setShortlistReason(reason);
                    setPerLineSelection({});
                  }
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-accent-600 hover:bg-accent-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm selection
              </button>
            </div>
          </div>
        </div>
      )}
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
          ? "rounded-xl border-2 border-orange-500 bg-white shadow-lg shadow-orange-200/50 overflow-hidden"
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
                ? "inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-orange-600 text-white shadow-sm"
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
  name,
  amount,
  rate,
  uomCode,
  offeredQty,
  onOfferedQtyChange,
  isLowest,
  isSelected,
  onSelect,
}: {
  name: string;
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
          ? "rounded-xl border-2 border-orange-500 bg-white shadow-lg shadow-orange-200/50 overflow-hidden"
          : `rounded-xl border border-gray-200 bg-white ${cardShadow} overflow-hidden hover:shadow-md transition-shadow`
      }
    >
      {/* Header shows WHICH vendor this card belongs to, plus SELECT. */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold ${headerCls}`}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{name}</span>
        </span>
        <button
          type="button"
          onClick={onSelect}
          className={
            isSelected
              ? "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-orange-600 text-white shrink-0"
              : "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-white/90 text-gray-800 hover:bg-white shrink-0"
          }
        >
          {isSelected && <CheckCircle2 className="w-3 h-3" />}
          {isSelected ? "SELECTED" : "SELECT"}
        </button>
      </div>
      <div className="px-3 py-2 text-xs space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Amount</span>
          <span
            className={
              isLowest
                ? "font-bold text-rose-700 tabular-nums"
                : "font-bold text-gray-900 tabular-nums"
            }
          >
            {fmtINR(amount)}
          </span>
        </div>
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
            className="w-20 px-1.5 py-0.5 rounded border border-gray-200 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-accent-500"
          />
        </div>
      </div>
    </div>
  );
}
