"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

/**
 * Renders a scannable Code-128 barcode and a QR code for an item, from its
 * barcode value (falls back to SKU). Both are generated client-side (no network)
 * and are printable for shelf/product labels.
 */
export function ItemCodes({ code, name }: { code: string; name?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, code, { format: "CODE128", width: 2, height: 56, fontSize: 13, margin: 8, displayValue: true });
      } catch {
        /* invalid value for Code128 — skip */
      }
    }
    if (code) {
      QRCode.toDataURL(code, { width: 132, margin: 1 }).then(setQr).catch(() => setQr(""));
    }
  }, [code]);

  if (!code) return null;

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-card p-4 print:border-0">
      <div className="flex flex-col items-center">
        <svg ref={svgRef} aria-label={`Barcode ${code}`} />
      </div>
      {qr ? (
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR ${code}`} width={120} height={120} />
          {name ? <span className="mt-1 max-w-[140px] truncate text-xs text-muted-foreground">{name}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
