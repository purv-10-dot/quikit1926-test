"use client";

import { Package, Mail, Phone } from "lucide-react";
import { WhatsAppLink } from "@/components/WhatsAppLink";
import type { PoLine, PoDetail } from "@/lib/purchase/po-detail";
import type { ItemRow } from "../lib/types";
import { StatCell } from "./detail-parts";

export function LineItemsPanel({
  po, lines, subtotal, totalAmount, taxAmount, vendorName,
}: {
  po: PoDetail;
  lines: PoLine[];
  subtotal: number;
  totalAmount: number;
  taxAmount: number;
  vendorName: string;
}) {
  return (
    <>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  PO Line Items ({lines.length || po.lineCount || 0})
                </h3>
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  {po.lineCount ? `${po.lineCount} items (details available in full view)` : "No line items"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-8">#</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Material</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-16">UOM</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">Qty</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">Rate</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">Amount</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">GST</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lines.map((line: PoLine, i: number) => {
                        // Field-name tolerance — stored shape uses
                        // `poQty` / `lineValueExGST` / `lineValueIncGST`,
                        // older rows used `quantity` / `amount` /
                        // `totalAmount`. Backfill item name/uom from
                        // the items master when the stored row has
                        // empty strings (happened when the save-time
                        // resolver missed Prisma).
                        const matName =
                          line.itemName ||
                          line.itemCode ||
                          line.itemId ||
                          "—";
                        const uom = line.uomCode || "—";
                        const qty =
                          line.poQty ??
                          line.quantity ??
                          line.orderedQty ??
                          "—";
                        const rate = Number(
                          line.unitRate ?? line.rate ?? 0,
                        );
                        const amount = Number(
                          line.lineValueExGST ??
                            line.amount ??
                            line.totalAmount ??
                            rate * (parseFloat(String(qty)) || 0),
                        );
                        const net = Number(
                          line.lineValueIncGST ??
                            line.netAmount ??
                            amount,
                        );
                        // Per-line GST split — reads the server-stored
                        // igst/cgst/sgst amounts. Inter-state lines carry
                        // IGST, intra-state carry CGST + SGST.
                        const lIgst = Number(line.igstAmount ?? 0);
                        const lCgst = Number(line.cgstAmount ?? 0);
                        const lSgst = Number(line.sgstAmount ?? 0);
                        const lHasSplit = lIgst + lCgst + lSgst > 0;
                        const lGstType =
                          line.gstType ?? (lIgst > 0 ? "IGST" : "CGST+SGST");
                        const fmtLine = (n: number) =>
                          `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
                        return (
                          <tr key={line.id ?? line.lineId ?? i}>
                            <td className="px-3 py-3 text-xs text-gray-400">{i + 1}</td>
                            <td className="px-3 py-3 text-sm font-medium text-gray-900">
                              {matName}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-600 uppercase">
                              {uom}
                            </td>
                            <td className="px-3 py-3 text-sm text-right tabular-nums">
                              {qty}
                            </td>
                            <td className="px-3 py-3 text-sm text-right tabular-nums">
                              ₹ {rate.toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-medium tabular-nums">
                              ₹ {amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-3 text-xs text-right tabular-nums text-gray-600">
                              <div>{line.gstRate != null ? `${line.gstRate}%` : "—"}</div>
                              {lHasSplit && (
                                <div className="text-[10px] text-gray-400 leading-tight mt-0.5">
                                  {lGstType === "IGST" ? (
                                    <div>IGST {fmtLine(lIgst)}</div>
                                  ) : (
                                    <>
                                      <div>CGST {fmtLine(lCgst)}</div>
                                      <div>SGST {fmtLine(lSgst)}</div>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">
                              ₹ {net.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Finance breakdown — 6 stat pills for the key
                  line-level aggregates (Amount → Line Disc → Net →
                  GST → Freight → Other) plus a Grand Total row at
                  the bottom. Mirrors the printed PO so the approver
                  sees every moving part of the total at a glance. */}
              {lines.length > 0 && (() => {
                let gross = 0, lineDisc = 0, net = 0, tax = 0;
                for (const l of lines) {
                  const q = parseFloat(String(l.poQty ?? l.quantity ?? 0)) || 0;
                  const r = parseFloat(String(l.unitRate ?? l.rate ?? 0)) || 0;
                  const d = parseFloat(String(l.discount ?? 0)) || 0;
                  const g = parseFloat(String(l.gstRate ?? 0)) || 0;
                  const gr = q * r;
                  const ld = (gr * d) / 100;
                  const ad = gr - ld;
                  gross += gr; lineDisc += ld; net += ad; tax += (ad * g) / 100;
                }
                const freight = parseFloat(String(po.freightCharges ?? "0")) || 0;
                const other = parseFloat(String(po.otherCharges ?? "0")) || 0;
                const hdrDisc = parseFloat(String(po.discount ?? "0")) || 0;
                const grand = net + tax + freight + other - hdrDisc || totalAmount;
                const RUPEE = "\u20B9";
                const fmtINR = (n: number) =>
                  `${RUPEE}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
                // GST split \u2014 read the server-stored breakup (computed from
                // project/company state vs vendor state). Inter-state POs
                // carry IGST; intra-state POs carry CGST + SGST. Exactly one
                // side is non-zero, so we render whichever the server filled.
                const igst = parseFloat(String(po.totalIGST ?? "0")) || 0;
                const cgst = parseFloat(String(po.totalCGST ?? "0")) || 0;
                const sgst = parseFloat(String(po.totalSGST ?? "0")) || 0;
                const gstType =
                  po.gstType ?? (igst > 0 ? "IGST" : "CGST+SGST");
                const hasGstSplit = igst + cgst + sgst > 0;
                return (
                  <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50/60 to-white">
                    <div
                      className={`grid gap-px bg-gray-200 ${
                        hasGstSplit
                          ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-4"
                          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
                      }`}
                    >
                      <StatCell label="Amount" value={fmtINR(gross)} />
                      <StatCell label="Line Disc." value={fmtINR(lineDisc)} />
                      <StatCell label="Net" value={fmtINR(net)} />
                      {hasGstSplit &&
                        (gstType === "IGST" ? (
                          <StatCell label="IGST" value={fmtINR(igst)} />
                        ) : (
                          <>
                            <StatCell label="CGST" value={fmtINR(cgst)} />
                            <StatCell label="SGST" value={fmtINR(sgst)} />
                          </>
                        ))}
                      <StatCell label="Tax (GST)" value={fmtINR(tax)} />
                      <StatCell
                        label={`Freight (${RUPEE})`}
                        value={freight.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      />
                      <StatCell
                        label={`Other (${RUPEE})`}
                        value={other.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      />
                    </div>
                    {hasGstSplit && (
                      <div className="px-5 py-1.5 border-t border-gray-100 bg-white">
                        <span className="text-[11px] text-gray-400">
                          {gstType === "IGST"
                            ? "Inter-state supply — IGST applicable"
                            : "Intra-state supply — CGST + SGST applicable"}
                        </span>
                      </div>
                    )}
                    <div className="px-5 py-4 bg-accent-50 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-bold text-accent-700 uppercase tracking-wider">
                        Total Amount
                      </span>
                      <span className="text-xl font-extrabold tabular-nums text-accent-700">
                        {fmtINR(grand)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Vendor card — full-width, main-column treatment just
                like the RFQ detail page's Vendors section. Shows
                vendor identity + contact + GST + address, plus an
                item-chip list so the approver can see at a glance
                what this vendor is supplying. */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  Vendor
                </h3>
              </div>
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {vendorName}
                        </span>
                        {po.vendorEmail && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 break-all">
                            <Mail className="w-3 h-3 shrink-0" />
                            {po.vendorEmail}
                          </span>
                        )}
                        {po.vendorPhone && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <Phone className="w-3 h-3 shrink-0" />
                            {po.vendorPhone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <WhatsAppLink
                          phone={String(po.vendorPhone ?? "")}
                          showDisabled
                          message={
                            po.poNumber
                              ? `Hello, regarding Purchase Order ${po.poNumber}.`
                              : undefined
                          }
                          title={
                            po.poNumber
                              ? `WhatsApp vendor about ${po.poNumber}`
                              : "WhatsApp vendor"
                          }
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white hover:bg-[#20bd5a] transition-colors"
                        />
                      </div>
                    </div>
                    {po.vendorContactPerson && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        Contact: {po.vendorContactPerson}
                      </p>
                    )}
                    {po.vendorGSTIN && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        GSTIN: {po.vendorGSTIN}
                      </p>
                    )}
                    {po.vendorAddress && (
                      <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-line">
                        {po.vendorAddress}
                      </p>
                    )}
                    <div className="mt-3">
                      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                        Items ({lines.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {lines.map((line: PoLine, i: number) => {
                          const name =
                            line.itemName ||
                            line.itemCode ||
                            line.itemId ||
                            `Item ${i + 1}`;
                          return (
                            <span
                              key={i}
                              className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px]"
                            >
                              {name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
    </>
  );
}
