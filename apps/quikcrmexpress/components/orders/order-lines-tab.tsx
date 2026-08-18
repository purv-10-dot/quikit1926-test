"use client";

import {
  Table,
  TableScroll,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import type { Order360Line, Order360Row } from "@/lib/services/orders/full-record";

function fmt(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function OrderLinesTab({ order }: { order: Order360Row }) {
  return (
    <div className="rounded-lg border border-crm-border bg-white">
      <div className="border-b border-crm-border px-4 py-3">
        <h3 className="text-sm font-semibold text-crm-text">Line items ({order.lines.length})</h3>
        <p className="text-xs text-crm-muted">
          Read-only — snapshotted from quote{" "}
          {order.quote ? order.quote.quoteNumber : "at conversion"}.
        </p>
      </div>
      <TableScroll minWidth={760}>
        <Table>
          <THead>
            <TR>
              <TH className="w-10 text-right">#</TH>
              <TH>Product</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Unit price</TH>
              <TH className="text-right" hideBelow="sm">
                Disc%
              </TH>
              <TH className="text-right" hideBelow="md">
                GST%
              </TH>
              <TH className="text-right">Line total</TH>
            </TR>
          </THead>
          <TBody>
            {order.lines.length === 0 ? (
              <TR>
                <TD className="py-8 text-center text-sm text-crm-muted">
                  <span className="block w-full">No line items</span>
                </TD>
              </TR>
            ) : (
              order.lines.map((l: Order360Line) => (
                <TR key={l.id}>
                  <TD className="text-right text-crm-muted">{l.lineNumber}</TD>
                  <TD>
                    <div className="font-medium text-crm-text">{l.productName}</div>
                    {l.sku ? <div className="text-xs text-crm-muted">SKU: {l.sku}</div> : null}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {l.quantity} {l.unit}
                  </TD>
                  <TD className="text-right tabular-nums">₹{fmt(l.unitPrice)}</TD>
                  <TD className="text-right tabular-nums" hideBelow="sm">
                    {l.discountPct}%
                  </TD>
                  <TD className="text-right tabular-nums" hideBelow="md">
                    {l.gstRate}%
                  </TD>
                  <TD className="text-right tabular-nums font-medium">₹{fmt(l.lineTotal)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableScroll>
    </div>
  );
}
