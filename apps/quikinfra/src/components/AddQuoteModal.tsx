"use client";

/**
 * AddQuoteModal — captures a vendor's quoted rates against an RFQ.
 *
 * UX goals:
 *   - Zero extra clicks on open. The first pending vendor is auto
 *     selected so rate inputs appear immediately, and the first rate
 *     input auto-focuses for keyboard entry.
 *   - Scales to any vendor count. A left-hand sidebar lists every
 *     pending vendor with a status dot; clicking swaps the active
 *     quote in one click. Quoted vendors stay visible (grayed) so the
 *     user sees overall progress without leaving the modal.
 *   - "Save & next" advances to the next pending vendor without
 *     closing — ideal when multiple quote emails come in together.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Mail,
  Paperclip,
  X,
} from "lucide-react";
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
  assignedItemIds?: string[];
  quotedRates?: Array<{ lineId: string; rate: string; remarks?: string }>;
  quoteRemarks?: string;
}

interface Props {
  open: boolean;
  rfqId: string;
  rfqNumber?: string;
  vendors: VendorRow[];
  initialVendorRowId?: string;
  lines: RfqLine[];
  onClose: () => void;
  onSaved: () => void;
}

function lineKeyFor(line: RfqLine, fallbackIdx: number): string {
  return String(line.id ?? line.lineId ?? `row-${fallbackIdx}`);
}

function hasQuoted(v: VendorRow): boolean {
  return Array.isArray(v.quotedRates) && v.quotedRates.length > 0;
}

function initialOf(name: string): string {
  const t = String(name ?? "").trim();
  return t ? t.charAt(0).toUpperCase() : "V";
}

export function AddQuoteModal({
  open,
  rfqId,
  rfqNumber,
  vendors,
  initialVendorRowId,
  lines,
  onClose,
  onSaved,
}: Props) {
  const unquotedVendors = useMemo(
    () => vendors.filter((v) => !hasQuoted(v)),
    [vendors],
  );
  const quotedCount = vendors.length - unquotedVendors.length;

  const [vendorRowId, setVendorRowId] = useState<string>("");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRateRef = useRef<HTMLInputElement | null>(null);

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === vendorRowId) ?? null,
    [vendors, vendorRowId],
  );

  const visibleLines = useMemo(() => {
    if (!selectedVendor) return [];
    const assigned = selectedVendor.assignedItemIds ?? [];
    if (assigned.length === 0) return lines;
    const idx = new Set<number>();
    for (const id of assigned) {
      const m = /^row-(\d+)$/.exec(String(id));
      if (m) idx.add(parseInt(m[1], 10));
    }
    if (idx.size === 0) return lines;
    return lines.filter((_, i) => idx.has(i));
  }, [selectedVendor, lines]);

  useEffect(() => {
    if (!open) return;
    // Allow the caller's initialVendorRowId to point at ANY vendor on
    // the RFQ (not just un-quoted). This enables edit mode when the
    // user clicks a "Quoted" badge on the list — we open the modal on
    // that vendor so they can revise their rates.
    const fromCaller =
      initialVendorRowId && vendors.some((v) => v.id === initialVendorRowId)
        ? initialVendorRowId
        : "";
    const fallback = unquotedVendors[0]?.id ?? vendors[0]?.id ?? "";
    setVendorRowId(fromCaller || fallback);
    setFile(null);
    setError(null);
  }, [open, initialVendorRowId, vendors, unquotedVendors]);

  useEffect(() => {
    if (!selectedVendor) {
      setRates({});
      setRemarks("");
      return;
    }
    const seed: Record<string, string> = {};
    for (const q of selectedVendor.quotedRates ?? []) {
      if (q?.lineId) seed[q.lineId] = String(q.rate ?? "");
    }
    setRates(seed);
    setRemarks(selectedVendor.quoteRemarks ?? "");
    setFile(null);
  }, [selectedVendor]);

  useEffect(() => {
    if (!open || !selectedVendor) return;
    const t = setTimeout(() => firstRateRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, selectedVendor]);

  const handleSave = useCallback(
    async (advanceToNext = false) => {
      setError(null);
      if (!selectedVendor) {
        setError("Select a vendor before saving.");
        return;
      }
      const cleanRates = visibleLines
        .map((line, i) => ({
          lineId: lineKeyFor(line, i),
          rate: rates[lineKeyFor(line, i)] ?? "",
        }))
        .filter((r) => r.rate.trim() && parseFloat(r.rate) > 0);
      if (cleanRates.length === 0) {
        setError("Enter at least one rate before saving.");
        return;
      }
      const remarksWithFile = file
        ? `${remarks.trim()}${remarks.trim() ? "\n\n" : ""}[Attached quotation: ${file.name}]`
        : remarks.trim();

      setSaving(true);
      try {
        const res = await fetch(
          `/api/purchase/rfqs/${rfqId}/vendors/${selectedVendor.id}/quote`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rates: cleanRates,
              remarks: remarksWithFile || null,
            }),
          },
        );
        if (!res.ok) {
          const txt = await res.text();
          let msg = `HTTP ${res.status}`;
          try { msg = JSON.parse(txt).error ?? msg; } catch {}
          throw new Error(msg);
        }
        onSaved();
        // The parent will refetch vendors; for a snappier UX while
        // that's in flight, find the next pending vendor from our
        // current snapshot and switch the sidebar to it.
        const idx = unquotedVendors.findIndex(
          (v) => v.id === selectedVendor.id,
        );
        const next = unquotedVendors[idx + 1];
        if (advanceToNext && next) {
          setVendorRowId(next.id);
        } else {
          onClose();
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to save quote");
      } finally {
        setSaving(false);
      }
    },
    [
      file,
      rates,
      remarks,
      rfqId,
      selectedVendor,
      visibleLines,
      onSaved,
      onClose,
      unquotedVendors,
    ],
  );

  if (!open) return null;

  // "Edit mode" — the modal is open on an already-quoted vendor so the
  // user can revise their existing rates. When this is true the title
  // flips, the Save button reads "Update", and we don't short-circuit
  // to the "all done" empty state (there'd be no vendor to edit then).
  const isEditingSelected =
    !!selectedVendor && hasQuoted(selectedVendor);
  const noVendorsToQuote = unquotedVendors.length === 0 && !isEditingSelected;
  const currentIdx = selectedVendor
    ? unquotedVendors.findIndex((v) => v.id === selectedVendor.id)
    : -1;
  const hasNext =
    !isEditingSelected &&
    currentIdx >= 0 &&
    currentIdx < unquotedVendors.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-100 shrink-0 bg-gradient-to-b from-orange-50/40 to-white">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isEditingSelected ? "Edit Vendor Quote" : "Record Vendor Quote"}
              </h2>
              {rfqNumber && (
                <p className="text-xs text-gray-500 mt-0.5 font-mono">
                  {rfqNumber}
                </p>
              )}
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

        {noVendorsToQuote ? (
          <div className="flex-1 flex items-center justify-center px-6 py-12">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-gray-900">
                All vendors have quoted
              </p>
              <p className="text-xs text-gray-500 mt-1">
                This RFQ has full coverage &mdash; nothing left to record.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Sidebar — every vendor on this RFQ, scrollable. Status
                dot + name; quoted ones stay visible but dimmed so the
                user can see overall progress at a glance. */}
            <aside className="w-56 shrink-0 border-r border-gray-200 overflow-y-auto bg-gray-50/60">
              <div className="px-4 py-3 border-b border-gray-200 sticky top-0 bg-gray-50/95 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
                  Vendors
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  <span className="font-semibold text-gray-900">
                    {quotedCount}
                  </span>{" "}
                  / {vendors.length} quoted
                </div>
              </div>
              <ul>
                {vendors.map((v) => {
                  const q = hasQuoted(v);
                  const active = v.id === vendorRowId;
                  const name = v.vendorName || v.vendorId || "Vendor";
                  // All vendors are clickable now — quoted ones open
                  // in edit mode so the user can revise their rates.
                  // Visual differentiation is kept (check icon + subtle
                  // bg) so "already quoted" vs "pending" stays obvious.
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setVendorRowId(v.id)}
                        title={
                          q
                            ? `${name} \u2014 already quoted, click to edit`
                            : v.email
                              ? `${name} \u2014 ${v.email}`
                              : name
                        }
                        className={
                          active
                            ? "w-full text-left px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 text-xs bg-white border-l-2 border-l-orange-500"
                            : "w-full text-left px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 text-xs hover:bg-white/80 border-l-2 border-l-transparent"
                        }
                      >
                        <span
                          className={
                            active
                              ? "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-orange-500 text-white text-[10px] font-bold"
                              : q
                                ? "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-600"
                                : "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-gray-200 text-gray-600 text-[10px] font-bold"
                          }
                        >
                          {active ? (
                            initialOf(name)
                          ) : q ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            initialOf(name)
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div
                            className={
                              active
                                ? "truncate font-semibold text-gray-900"
                                : q
                                  ? "truncate text-gray-600"
                                  : "truncate font-medium text-gray-700"
                            }
                          >
                            {name}
                          </div>
                          {v.email && (
                            <div className="truncate text-[10px] text-gray-400">
                              {v.email}
                            </div>
                          )}
                        </div>
                        {q && !active && (
                          <span className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider shrink-0">
                            Quoted
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Main pane */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {selectedVendor && (
                  <>
                    {/* Context chip */}
                    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-orange-50 to-transparent px-4 py-3 border border-orange-100">
                      <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-orange-500 text-white text-sm font-semibold">
                        {initialOf(selectedVendor.vendorName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {selectedVendor.vendorName}
                        </div>
                        {selectedVendor.email && (
                          <div className="text-[11px] text-gray-500 flex items-center gap-1 truncate">
                            <Mail className="w-2.5 h-2.5 shrink-0" />
                            {selectedVendor.email}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 shrink-0">
                        Quote {currentIdx + 1} / {unquotedVendors.length}
                      </span>
                    </div>

                    {/* Rates */}
                    {visibleLines.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6 bg-gray-50 rounded-xl">
                        No items assigned to this vendor.
                      </p>
                    ) : (
                      <section>
                        <header className="flex items-center justify-between mb-2">
                          <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Quoted Rates
                          </h3>
                          <span className="text-[11px] text-gray-400">
                            {visibleLines.length} item
                            {visibleLines.length === 1 ? "" : "s"}
                          </span>
                        </header>
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-500">
                              <tr>
                                <th className="px-4 py-2 text-left">
                                  Material
                                </th>
                                <th className="px-4 py-2 text-right w-20">Qty</th>
                                <th className="px-4 py-2 text-left w-14">UOM</th>
                                <th className="px-4 py-2 text-right w-36">
                                  Rate (&#8377;)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {visibleLines.map((line, i) => {
                                const key = lineKeyFor(line, i);
                                return (
                                  <tr key={key}>
                                    <td className="px-4 py-2.5 text-sm text-gray-900">
                                      {line.itemName ?? line.itemId ?? "\u2014"}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm text-right text-gray-700 tabular-nums">
                                      {line.quantity ?? "\u2014"}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-600 uppercase">
                                      {line.uomCode ?? "\u2014"}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                      <input
                                        ref={i === 0 ? firstRateRef : null}
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        value={rates[key] ?? ""}
                                        onChange={(e) =>
                                          setRates((prev) => ({
                                            ...prev,
                                            [key]: e.target.value,
                                          }))
                                        }
                                        placeholder="0.00"
                                        className="w-28 px-2 py-1.5 rounded border border-gray-300 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-500"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}

                    <section>
                      <header className="mb-2">
                        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          Remarks / Terms
                        </h3>
                      </header>
                      <textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        rows={2}
                        placeholder="Any specific terms or remarks from the vendor&#8230;"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                      />
                    </section>

                    <section>
                      <header className="mb-2 flex items-center justify-between">
                        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          Quotation Document
                        </h3>
                        <span className="text-[10px] text-gray-400">
                          Optional
                        </span>
                      </header>
                      <label
                        htmlFor="quote-file"
                        onDragEnter={(e) => {
                          e.preventDefault();
                          setFileDragActive(true);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!fileDragActive) setFileDragActive(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          setFileDragActive(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setFileDragActive(false);
                          const dropped = e.dataTransfer.files?.[0];
                          if (dropped) setFile(dropped);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-dashed text-sm cursor-pointer transition-colors ${
                          fileDragActive
                            ? "border-orange-400 bg-orange-50/60"
                            : "border-gray-300 hover:border-orange-400 hover:bg-orange-50/30"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium shrink-0">
                          <Paperclip className="w-3.5 h-3.5" />
                          Choose file
                        </span>
                        <span className="text-xs text-gray-500 truncate">
                          {file
                            ? file.name
                            : "PDF, image, or Excel from the vendor\u2019s email"}
                        </span>
                      </label>
                      <input
                        id="quote-file"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                    </section>
                  </>
                )}
              </div>

              {/* Footer pinned to the main pane */}
              <div className="border-t border-gray-200 px-6 py-3.5 flex items-center justify-between gap-3 bg-gray-50 shrink-0">
                <span className="text-[11px] text-gray-400">
                  {hasNext
                    ? `${unquotedVendors.length - 1 - currentIdx} more vendor${
                        unquotedVendors.length - 1 - currentIdx === 1 ? "" : "s"
                      } pending`
                    : "\u00A0"}
                </span>
                <div className="flex items-center gap-2">
                  <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                  {hasNext && (
                    <button
                      type="button"
                      onClick={() => handleSave(true)}
                      disabled={saving || !selectedVendor}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save &amp; next
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <PrimaryButton
                    onClick={() => handleSave(false)}
                    disabled={saving || !selectedVendor}
                  >
                    {saving
                      ? "Saving\u2026"
                      : isEditingSelected
                        ? "Update Quote"
                        : "Save Quote"}
                  </PrimaryButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
