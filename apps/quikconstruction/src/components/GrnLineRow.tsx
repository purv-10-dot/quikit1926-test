"use client";

/**
 * GrnLineRow — card-style layout for a single GRN received-item row.
 *
 * Layout philosophy:
 *   1. Identity header  — material name + UOM chip, plus a live
 *                         shortage warning when the user short-receives.
 *   2. Reference tiles  — PO Qty · Prev. Rcvd · Pending (read-only,
 *                         compact tiles on a soft gray surface so the
 *                         eye groups "context the user can't change").
 *   3. Action strip     — Received · Rejected · Accepted. The primary
 *                         user inputs live here; Accepted is emerald so
 *                         it's unmistakable as the outcome of the two
 *                         numbers to its left.
 *   4. Secondary row    — Batch · Condition · Test Cert. Ref.
 *   5. Remarks          — Full-width textarea-like input so long
 *                         inspection notes don't clip.
 *
 * Rendered by the `QuickCreateDrawer` via `lineItems.rowRender` on
 * both the main GRN drawer (`/store/grn`) and the PO-detail's
 * "Create GRN from PO" drawer, so the UX stays identical across
 * both entry points.
 */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Package } from "lucide-react";

export function renderGrnLine(
  line: Record<string, any>,
  update: (patch: Record<string, any>) => void,
): ReactNode {
  const poQty = parseFloat(String(line.poQty ?? "0")) || 0;
  const prev = parseFloat(String(line.prevRcvd ?? "0")) || 0;
  const pending = Math.max(poQty - prev, 0);
  const received = parseFloat(String(line.receivedQty ?? "0")) || 0;
  const rejected = parseFloat(String(line.rejectedQty ?? "0")) || 0;
  const accepted = Math.max(received - rejected, 0);
  const short = received > 0 ? Math.max(pending - accepted, 0) : 0;
  const fullyAccepted = received > 0 && accepted >= pending && pending > 0;
  const uom = (line.uomCode || "").toUpperCase();

  return (
    <div className="space-y-4">
      {/* 1. Identity header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-0.5">
              Material
            </div>
            <div className="text-sm font-semibold text-gray-900 leading-tight break-words">
              {line.itemName || "\u2014"}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {uom && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                  {uom}
                </span>
              )}
              {short > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-semibold">
                  <AlertTriangle className="w-3 h-3" />
                  Short by {short.toLocaleString("en-IN")} {uom}
                </span>
              )}
              {fullyAccepted && short === 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                  <CheckCircle2 className="w-3 h-3" />
                  Fully received
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Reference tiles — read-only context */}
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-gray-200">
          <Tile label="PO Qty" value={poQty.toLocaleString("en-IN")} />
          <Tile
            label="Prev. Rcvd"
            value={prev.toLocaleString("en-IN")}
            dim
          />
          <Tile
            label="Pending"
            value={pending.toLocaleString("en-IN")}
            tone={pending > 0 ? "amber" : "default"}
          />
        </div>
      </div>

      {/* 3. Action strip — the primary inputs */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
            Received <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={line.receivedQty ?? ""}
            onChange={(e) => update({ receivedQty: e.target.value })}
            placeholder="0"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
            Rejected
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={line.rejectedQty ?? ""}
            onChange={(e) => update({ rejectedQty: e.target.value })}
            placeholder="0"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
            Accepted
          </label>
          <div className="h-[38px] px-3 flex items-center justify-end rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-bold tabular-nums text-emerald-700">
            {accepted.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* 4. Secondary row — lot tracking + QC */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
            Batch / Heat No.
          </label>
          <input
            type="text"
            value={line.batchNo ?? ""}
            onChange={(e) => update({ batchNo: e.target.value })}
            placeholder="Batch / Heat No."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
            Condition
          </label>
          <select
            value={line.condition ?? "Good"}
            onChange={(e) => update({ condition: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="Good">Good</option>
            <option value="Damaged">Damaged</option>
            <option value="Partially Damaged">Partially Damaged</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">
            Test Cert. Ref.
          </label>
          <input
            type="text"
            value={line.testCertRef ?? ""}
            onChange={(e) => update({ testCertRef: e.target.value })}
            placeholder="Certificate / report reference"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* 5. Remarks — full-width free text */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-700 mb-1">
          Remarks
        </label>
        <input
          type="text"
          value={line.remarks ?? ""}
          onChange={(e) => update({ remarks: e.target.value })}
          placeholder="Inspection notes, deviations, damage details…"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  dim,
  tone,
}: {
  label: string;
  value: string;
  dim?: boolean;
  tone?: "default" | "amber";
}) {
  const valueColor =
    tone === "amber"
      ? "text-amber-700"
      : dim
        ? "text-gray-500"
        : "text-gray-900";
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-base font-bold tabular-nums ${valueColor}`}
      >
        {value}
      </div>
    </div>
  );
}
