"use client";

import { GroupedMaterialSelect } from "@/components/GroupedMaterialSelect";
import { SelectInput } from "@/components/FormDrawer";
import type { QuickCreateConfig } from "@/components/QuickCreateDrawer";
import type { PoFormConfigDeps } from "./po-form-deps";

export function buildLineItems(deps: PoFormConfigDeps): QuickCreateConfig["lineItems"] {
  const { locationOptions, itemGroups } = deps;
  return {
      label: "PO Items",
      // Client-side pre-submit guard — returns a user-facing error
      // when any PO line's qty exceeds the Max it was capped to on
      // autofill. Mirrors the server's `INDENT_QTY_EXCEEDED` rule
      // so the user sees the failure inline instead of round-
      // tripping to the API and getting a 400.
      validateBeforeSubmit: (rows) => {
        const offending: string[] = [];
        rows.forEach((r, idx) => {
          const qty = parseFloat(String(r.poQty ?? "0")) || 0;
          const max = parseFloat(String(r.maxQty ?? "0")) || 0;
          if (max > 0 && qty > max) {
            const mat =
              (r.itemName as string) ?? r.itemId ?? `Line ${idx + 1}`;
            offending.push(`"${mat}" — qty ${qty} exceeds max ${max}`);
          }
        });
        if (offending.length === 0) return null;
        return `Please reduce the following line${offending.length > 1 ? "s" : ""} to their Max: ${offending.join("; ")}.`;
      },
      // Card-style rows — the per-line layout is produced by
      // `rowRender` below. `fields` is kept so the payload
      // serialisation in the drawer still picks up the line keys,
      // but the default inline grid is bypassed.
      rowRender: (
        line,
        update: (patch: Record<string, unknown>) => void,
      ) => {
        const qty = parseFloat(String(line.poQty ?? "0")) || 0;
        const rate = parseFloat(String(line.unitRate ?? "0")) || 0;
        const discPct = parseFloat(String(line.discount ?? "0")) || 0;
        const gst = parseFloat(String(line.gstRate ?? "0")) || 0;
        const grossAmount = qty * rate;
        const discAmount = (grossAmount * discPct) / 100;
        const amount = grossAmount - discAmount; // net of discount, pre-GST
        const net = amount + (amount * gst) / 100;
        const RUPEE = "\u20B9";
        const fmt = (n: number) =>
          n > 0
            ? `${RUPEE}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
            : `${RUPEE}0`;
        const maxQtyNum = line.maxQty ? parseFloat(String(line.maxQty)) : NaN;

        return (
          <div className="space-y-3">
            {/* Row 1 — Material (wide) + Delivery Location */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Material <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <GroupedMaterialSelect
                    lazy
                    value={line.itemId ?? ""}
                    selectedLabel={(line.itemName as string) ?? ""}
                    onChange={(v) => {
                      if (v) update({ itemId: v });
                      else update({ itemId: "", itemName: "", uomCode: "", gstRate: "", unitRate: "" });
                    }}
                    onSelect={(item) => {
                      if (!item) return;
                      const it = item as {
                        name?: string | null;
                        uomCode?: string | null;
                        gstRate?: number | string | null;
                        standardRate?: number | string | null;
                      };
                      const patch: Record<string, unknown> = { itemName: it.name ?? "" };
                      if (it.uomCode) patch.uomCode = String(it.uomCode);
                      if (it.gstRate != null) patch.gstRate = String(it.gstRate);
                      if (it.standardRate != null) patch.unitRate = String(it.standardRate);
                      update(patch);
                    }}
                    items={[]}
                    groups={itemGroups.map((g) => ({ id: g.id, name: g.name, status: g.status, itemCount: g.itemCount }))}
                    placeholder="Select material…"
                    size="md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Delivery Location
                </label>
                <div className="mt-1">
                  <SelectInput
                    value={line.deliveryLocationId ?? ""}
                    onChange={(v) => update({ deliveryLocationId: v })}
                    placeholder="Location…"
                    options={locationOptions}
                  />
                </div>
              </div>
            </div>

            {/* Row 2 — editable inputs only: Qty / UOM / Rate / Disc%.
                Split from the computed cells (Row 3) so the fields aren't
                crammed into a single 7-column strip. */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={
                    !Number.isNaN(maxQtyNum) && maxQtyNum > 0
                      ? maxQtyNum
                      : undefined
                  }
                  value={line.poQty ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Hard-clamp to `maxQty` when the row was seeded
                    // from an indent/RFQ — exceeding that triggers
                    // `INDENT_QTY_EXCEEDED` on the server. Clamping
                    // on input is friendlier than the user typing a
                    // value that's then rejected at Submit.
                    if (!Number.isNaN(maxQtyNum) && maxQtyNum > 0) {
                      const n = parseFloat(raw);
                      if (Number.isFinite(n) && n > maxQtyNum) {
                        update({ poQty: String(maxQtyNum) });
                        return;
                      }
                    }
                    update({ poQty: raw });
                  }}
                  placeholder="0"
                  className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500 ${
                    !Number.isNaN(maxQtyNum) &&
                    maxQtyNum > 0 &&
                    parseFloat(String(line.poQty ?? "0")) > maxQtyNum
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
                {!Number.isNaN(maxQtyNum) && maxQtyNum > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Max: {maxQtyNum.toLocaleString("en-IN")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  UOM
                </label>
                <div className="mt-1 h-[38px] px-3 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium uppercase text-gray-700">
                  {line.uomCode || "—"}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Rate ({RUPEE})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitRate ?? ""}
                  onChange={(e) => update({ unitRate: e.target.value })}
                  placeholder="0.00"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Disc %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={line.discount ?? ""}
                  onChange={(e) => update({ discount: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
            </div>
            {/* Row 3 — Amount / GST% / Net in their own grid so the currency
                cells get room instead of overflowing a shared strip. */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Amount ({RUPEE})
                </label>
                <div className="mt-1 h-[38px] px-2 flex items-center justify-end rounded-lg border border-gray-200 bg-gray-50 text-[13px] font-semibold tabular-nums text-gray-800 whitespace-nowrap overflow-hidden">
                  {fmt(amount)}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  GST %
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.gstRate ?? ""}
                  onChange={(e) => update({ gstRate: e.target.value })}
                  placeholder="18"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Net ({RUPEE})
                </label>
                <div className="mt-1 h-[38px] px-2 flex items-center justify-end rounded-lg border border-accent-200 bg-white text-[13px] font-bold tabular-nums text-accent-700 whitespace-nowrap overflow-hidden">
                  {fmt(net)}
                </div>
              </div>
            </div>

            {/* Row 3 — Specification / Grade */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Specification / Grade
              </label>
              <input
                type="text"
                value={line.specification ?? ""}
                onChange={(e) => update({ specification: e.target.value })}
                placeholder="Grade, brand, size…"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </div>
        );
      },
      fields: [
        {
          // Material picker — when the user picks an item, snapshot
          // the master's `uomCode` and `gstRate` onto the row so the
          // read-only UOM cell and the default GST% have a sensible
          // starting value without the user typing them.
          // Key kept for payload serialisation only — the visible material
          // picker is the lazy GroupedMaterialSelect in rowRender above, which
          // bypasses this inline grid field.
          key: "itemId",
          label: "Material",
          type: "select" as const,
          options: [],
          placeholder: "Select material",
          width: "wide" as const,
        },
        {
          key: "deliveryLocationId",
          label: "Delivery Location",
          type: "select" as const,
          options: locationOptions,
          placeholder: "Location…",
        },
        {
          key: "uomCode",
          label: "UOM",
          type: "custom" as const,
          render: (line) => (
            <div className="h-[28px] flex items-center justify-center text-[11px] font-medium uppercase text-gray-600 bg-white border border-gray-200 rounded">
              {line.uomCode || "—"}
            </div>
          ),
        },
        {
          // Quantity input with the "Max: N" hint that appears when
          // the row was seeded from a source indent/RFQ carrying an
          // open qty. Exceeding the max is not blocked here — the
          // server enforces `poQty <= qtyOpen` via P0 validation.
          key: "poQty",
          label: "Qty",
          type: "custom" as const,
          render: (
            line,
            update: (patch: Record<string, unknown>) => void,
          ) => {
            const max = line.maxQty ? parseFloat(String(line.maxQty)) : NaN;
            return (
              <div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.poQty ?? ""}
                  onChange={(e) => update({ poQty: e.target.value })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 rounded border border-gray-300 text-xs text-center"
                />
                {!Number.isNaN(max) && max > 0 && (
                  <p className="text-[9px] text-gray-400 mt-0.5 text-center">
                    Max: {max.toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            );
          },
        },
        {
          key: "unitRate",
          label: "Rate (₹)",
          type: "number" as const,
          placeholder: "0.00",
        },
        {
          // Amount = Qty × Rate. Read-only computed cell.
          key: "_amount",
          label: "Amount (₹)",
          type: "custom" as const,
          render: (line) => {
            const qty = parseFloat(String(line.poQty ?? "0")) || 0;
            const rate = parseFloat(String(line.unitRate ?? "0")) || 0;
            const amount = qty * rate;
            return (
              <div className="h-[28px] flex items-center justify-end px-2 text-xs tabular-nums text-gray-700">
                {amount > 0 ? amount.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0"}
              </div>
            );
          },
        },
        {
          key: "gstRate",
          label: "GST %",
          type: "number" as const,
          placeholder: "18",
        },
        {
          // Net = Amount + GST. Read-only computed cell.
          key: "_net",
          label: "Net (₹)",
          type: "custom" as const,
          render: (line) => {
            const qty = parseFloat(String(line.poQty ?? "0")) || 0;
            const rate = parseFloat(String(line.unitRate ?? "0")) || 0;
            const gst = parseFloat(String(line.gstRate ?? "0")) || 0;
            const amount = qty * rate;
            const net = amount + (amount * gst) / 100;
            return (
              <div className="h-[28px] flex items-center justify-end px-2 text-xs tabular-nums font-semibold text-gray-800">
                {net > 0 ? net.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0"}
              </div>
            );
          },
        },
      ],
      // Totals footer — computes Subtotal / Tax / Net, and wires
      // Freight Charges + Discount inputs directly into formData so
      // the POST handler can read `body.freightCharges` / `discount`
      // without extra plumbing.
      footer: (ctx) => {
        // Line-level aggregates: gross = qty*rate (pre-discount),
        // subtotal = gross − per-line discount (the number the
        // printed PO calls "NET" in its breakdown), tax applies to
        // the discounted subtotal.
        let grossAmount = 0;
        let lineDiscountTotal = 0;
        let subtotal = 0;
        let totalTax = 0;
        let filledLines = 0;
        for (const l of ctx.lines) {
          const qty = parseFloat(String(l.poQty ?? "0")) || 0;
          const rate = parseFloat(String(l.unitRate ?? "0")) || 0;
          const discPct = parseFloat(String(l.discount ?? "0")) || 0;
          const gst = parseFloat(String(l.gstRate ?? "0")) || 0;
          const gross = qty * rate;
          const lineDisc = (gross * discPct) / 100;
          const afterDisc = gross - lineDisc;
          grossAmount += gross;
          lineDiscountTotal += lineDisc;
          subtotal += afterDisc;
          totalTax += (afterDisc * gst) / 100;
          if (l.itemId) filledLines += 1;
        }
        const freight = parseFloat(ctx.formData.freightCharges ?? "0") || 0;
        const other = parseFloat(ctx.formData.otherCharges ?? "0") || 0;
        const headerDiscount = parseFloat(ctx.formData.discount ?? "0") || 0;
        const grand =
          subtotal + totalTax + freight + other - headerDiscount;
        // Expressing the rupee symbol via a JS string concat avoids the
        // JSX text-mode gotcha where `\u20B9` inside a JSX expression
        // renders as the literal backslash-u sequence.
        const RUPEE = "\u20B9";
        const fmt = (n: number) =>
          `${RUPEE}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
        return (
          <div className="mt-4 space-y-3">
            {/* Compact summary row — Subtotal / Tax / Freight / Discount
                sit in one bordered card so they read as computed
                inputs rather than a finance ledger. */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-gray-200">
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Amount
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(grossAmount)}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Line Disc.
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(lineDiscountTotal)}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Net
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(subtotal)}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Tax (GST)
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(totalTax)}
                  </p>
                </div>
                <label className="px-3 py-2.5 block cursor-text">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Freight ({RUPEE})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ctx.formData.freightCharges ?? ""}
                    onChange={(e) =>
                      ctx.setFormData({ freightCharges: e.target.value })
                    }
                    placeholder="0"
                    className="mt-0.5 w-full text-sm font-bold tabular-nums text-gray-900 bg-transparent focus:outline-none"
                  />
                </label>
                <label className="px-3 py-2.5 block cursor-text">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Other ({RUPEE})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ctx.formData.otherCharges ?? ""}
                    onChange={(e) =>
                      ctx.setFormData({ otherCharges: e.target.value })
                    }
                    placeholder="0"
                    className="mt-0.5 w-full text-sm font-bold tabular-nums text-gray-900 bg-transparent focus:outline-none"
                  />
                </label>
              </div>
            </div>

            {/* Estimated / Grand Total strip — mirrors the amber
                "Estimated Total" banner from the indent drawer:
                item count on the left, label + big value on the
                right, soft amber background so it reads as a
                summary rather than another computed field. */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
              <span className="text-sm text-gray-700">
                {filledLines} {filledLines === 1 ? "item" : "items"}
              </span>
              <div className="text-right">
                <p className="text-[11px] text-gray-500">Grand Total</p>
                <p className="text-xl font-extrabold tabular-nums text-gray-900">
                  {fmt(grand)}
                </p>
              </div>
            </div>
          </div>
        );
      },
  };
}
