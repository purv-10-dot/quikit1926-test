"use client";

import { useState } from "react";
import { Printer, X } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

export type ReceiptData = {
  invoiceNumber: string;
  date: string;
  orderType: string;
  paymentMethod: string;
  items: { name: string; price: number; qty: number }[];
  subtotal: number;
  tax: number;
  total: number;
};

type Format = "thermal" | "a4";

/**
 * Print-ready bill. Toggle Thermal (80mm roll) vs A4 — the print CSS swaps page
 * size and scale so the same content prints correctly on either printer.
 */
export function Receipt({ data, orgName, onClose }: { data: ReceiptData; orgName?: string; onClose: () => void }) {
  const { format } = useCurrency();
  const [fmt, setFmt] = useState<Format>("thermal");

  const print = () => {
    document.body.setAttribute("data-print", fmt);
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:static print:bg-white print:p-0" onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pos-receipt, #pos-receipt * { visibility: visible; }
          #pos-receipt { position: absolute; left: 0; top: 0; width: 100%; }
          body[data-print="thermal"] #pos-receipt { width: 80mm; font-size: 12px; }
          body[data-print="thermal"] #pos-receipt .a4-only { display: none; }
          body[data-print="a4"] #pos-receipt { width: 190mm; margin: 0 auto; padding: 12mm; font-size: 14px; }
          @page { margin: 6mm; }
        }
      `}</style>

      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-popover print:max-w-none print:rounded-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
        {/* Controls (hidden when printing) */}
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3 print:hidden">
          <div className="inline-flex rounded-lg border p-0.5 text-sm">
            <button onClick={() => setFmt("thermal")} className={cn("rounded-md px-3 py-1", fmt === "thermal" && "bg-primary text-primary-foreground")}>Thermal 80mm</button>
            <button onClick={() => setFmt("a4")} className={cn("rounded-md px-3 py-1", fmt === "a4" && "bg-primary text-primary-foreground")}>A4</button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={print} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Printer className="h-4 w-4" />Print</button>
            <button onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* The bill */}
        <div id="pos-receipt" className={cn("mx-auto bg-white px-5 py-4 text-black", fmt === "thermal" ? "max-w-[320px] font-mono text-[13px]" : "max-w-[640px] text-sm")}>
          <div className="text-center">
            <p className="text-base font-bold">{orgName ?? "QuikFinance"}</p>
            <p className="a4-only text-xs text-neutral-500">Tax Invoice / Receipt</p>
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <span>Bill: <b>{data.invoiceNumber}</b></span>
            <span>{new Date(data.date).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-xs capitalize text-neutral-600">
            <span>{data.orderType}</span><span>{data.paymentMethod}</span>
          </div>

          <table className="mt-3 w-full border-t border-dashed border-neutral-400 text-left">
            <thead><tr className="text-[11px] uppercase text-neutral-500"><th className="py-1">Item</th><th className="py-1 text-center">Qty</th><th className="py-1 text-right">Amt</th></tr></thead>
            <tbody>
              {data.items.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="py-0.5 pr-2">{l.name}<div className="text-[10px] text-neutral-500">{format(l.price)} ea</div></td>
                  <td className="py-0.5 text-center">{l.qty}</td>
                  <td className="py-0.5 text-right tabular-nums">{format(l.price * l.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-2 space-y-0.5 border-t border-dashed border-neutral-400 pt-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{format(data.subtotal)}</span></div>
            <div className="flex justify-between text-neutral-600"><span>Tax</span><span className="tabular-nums">{format(data.tax)}</span></div>
            <div className="flex justify-between border-t border-neutral-400 pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(data.total)}</span></div>
          </div>

          <p className="mt-3 text-center text-[11px] text-neutral-500">Thank you! Powered by QuikFinance POS</p>
        </div>
      </div>
    </div>
  );
}
