import type { QuotePrintPayload } from "./types";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export function renderQuoteDocumentHtml(payload: QuotePrintPayload): string {
  const { quote, company, account, contact, template, lines, totals, isIntraState } =
    payload;
  const theme = template?.themeColor ?? "#1d4ed8";
  const watermark = quote.watermarkText ?? template?.watermarkText;
  const bank = (quote.bankDetailsJson ?? template?.bankDetailsJson) as
    | { bankName?: string; accountNo?: string; ifsc?: string; upi?: string }
    | null
    | undefined;
  const terms = quote.termsText ?? template?.termsDefault ?? "";
  const contactName = contact
    ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
    : null;

  const lineRows = lines
    .map(
      (l) => `
    <tr>
      <td>${l.lineNumber}</td>
      <td>
        <strong>${escapeHtml(l.productName)}</strong>
        ${l.sku ? `<div class="muted">${escapeHtml(l.sku)}</div>` : ""}
        ${l.hsnCode ? `<div class="muted">HSN: ${escapeHtml(l.hsnCode)}</div>` : ""}
      </td>
      <td class="ta-right">${l.quantity}</td>
      <td class="ta-right">${fmt(l.unitPrice)}</td>
      <td class="ta-right">${l.discountPct > 0 ? `${l.discountPct}%` : "—"}</td>
      <td class="ta-right">${fmt(l.taxableAmount)}</td>
      <td class="ta-right">${l.gstRate}%</td>
      <td class="ta-right"><strong>${fmt(l.lineTotal)}</strong></td>
    </tr>`,
    )
    .join("");

  const watermarkCss = watermark
    ? `.watermark::before{content:"${escapeHtml(watermark)}";position:fixed;top:40%;left:10%;font-size:48px;color:rgba(0,0,0,0.06);transform:rotate(-25deg);z-index:0;pointer-events:none;}`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(quote.quoteNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    body { font-family: system-ui, sans-serif; font-size: 12px; color: #111827; margin: 0; }
    .shell { max-width: 794px; margin: 0 auto; padding: 24px; position: relative; }
    h1 { font-size: 28px; color: ${theme}; margin: 0; letter-spacing: 0.05em; }
    h2 { font-size: 13px; color: ${theme}; text-transform: uppercase; margin: 0 0 6px; }
    .muted { color: #6b7280; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: color-mix(in srgb, ${theme} 12%, white); color: ${theme}; padding: 8px 6px; text-align: left; font-size: 11px; }
    td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .ta-right { text-align: right; }
    .totals { margin-top: 16px; max-width: 320px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .totals-row.strong { font-weight: 700; font-size: 14px; border-top: 2px solid #111; padding-top: 8px; margin-top: 8px; }
    .sig-block { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
    ${watermarkCss}
  </style>
</head>
<body class="watermark">
  <div class="shell">
    <div class="grid-2" style="margin-bottom:24px">
      <div>
        ${company.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="" style="height:40px;margin-bottom:8px"/>` : ""}
        <div style="font-size:16px;font-weight:700">${escapeHtml(company.companyName)}</div>
        <div class="muted">${escapeHtml([company.website, company.phone].filter(Boolean).join(" • "))}</div>
        ${template?.headerHtml ? `<div style="margin-top:8px">${template.headerHtml}</div>` : ""}
      </div>
      <div style="text-align:right">
        <h1>QUOTATION</h1>
        <div><span class="muted">Quote #</span> <strong>${escapeHtml(quote.quoteNumber)}</strong></div>
        <div><span class="muted">Date:</span> ${fmtDate(quote.effectiveFrom)}</div>
        ${quote.effectiveTo ? `<div><span class="muted">Valid until:</span> ${fmtDate(quote.effectiveTo)}</div>` : ""}
        <div style="margin-top:6px"><strong>${escapeHtml(quote.status)}</strong></div>
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:20px">
      <div>
        <h2>Bill To</h2>
        <div style="font-weight:600">${escapeHtml(account?.name ?? "—")}</div>
        ${contactName ? `<div>${escapeHtml(contactName)}</div>` : ""}
        ${contact?.email ? `<div class="muted">${escapeHtml(contact.email)}</div>` : ""}
      </div>
      <div>
        <h2>Prepared By</h2>
        <div style="font-weight:600">${escapeHtml(quote.ownerName ?? "—")}</div>
        <div class="muted">${isIntraState ? "CGST + SGST" : "IGST"}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Item</th><th class="ta-right">Qty</th><th class="ta-right">Rate</th>
          <th class="ta-right">Disc</th><th class="ta-right">Taxable</th><th class="ta-right">GST</th><th class="ta-right">Total</th>
        </tr>
      </thead>
      <tbody>${lineRows || `<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">No lines</td></tr>`}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>₹ ${fmt(totals.subtotal)}</span></div>
      ${totals.totalLineDiscount > 0 ? `<div class="totals-row"><span>Line discounts</span><span>− ₹ ${fmt(totals.totalLineDiscount)}</span></div>` : ""}
      ${totals.overallDiscountAmount > 0 ? `<div class="totals-row"><span>Overall discount</span><span>− ₹ ${fmt(totals.overallDiscountAmount)}</span></div>` : ""}
      ${totals.freightAmount > 0 ? `<div class="totals-row"><span>Freight</span><span>₹ ${fmt(totals.freightAmount)}</span></div>` : ""}
      <div class="totals-row"><span>Taxable</span><span>₹ ${fmt(totals.taxableAmount)}</span></div>
      ${isIntraState
        ? `<div class="totals-row"><span>CGST</span><span>₹ ${fmt(totals.cgstAmount)}</span></div>
           <div class="totals-row"><span>SGST</span><span>₹ ${fmt(totals.sgstAmount)}</span></div>`
        : `<div class="totals-row"><span>IGST</span><span>₹ ${fmt(totals.igstAmount)}</span></div>`}
      <div class="totals-row strong"><span>Grand Total</span><span>₹ ${fmt(totals.grandTotal)}</span></div>
      ${quote.grandTotalInWords ? `<div class="muted" style="margin-top:4px;font-size:11px">${escapeHtml(quote.grandTotalInWords)}</div>` : ""}
    </div>
    ${bank?.bankName ? `
    <div style="margin-top:20px">
      <h2>Bank Details</h2>
      <div>${escapeHtml(bank.bankName)}</div>
      ${bank.accountNo ? `<div class="muted">A/C: ${escapeHtml(bank.accountNo)}</div>` : ""}
      ${bank.ifsc ? `<div class="muted">IFSC: ${escapeHtml(bank.ifsc)}</div>` : ""}
      ${bank.upi ? `<div class="muted">UPI: ${escapeHtml(bank.upi)}</div>` : ""}
    </div>` : ""}
    ${terms ? `<div style="margin-top:20px"><h2>Terms & Conditions</h2><div style="white-space:pre-wrap">${escapeHtml(terms)}</div></div>` : ""}
    <div class="sig-block">
      <div class="grid-2">
        <div>
          <div class="muted">Authorized signature</div>
          <div style="height:48px;border-bottom:1px solid #9ca3af;margin-top:24px;max-width:200px"></div>
        </div>
        <div style="text-align:right">
          <div class="muted">Customer acceptance</div>
          <div style="height:48px;border-bottom:1px solid #9ca3af;margin-top:24px;max-width:200px;margin-left:auto"></div>
        </div>
      </div>
    </div>
    ${template?.footerHtml ? `<div style="margin-top:16px;font-size:10px" class="muted">${template.footerHtml}</div>` : ""}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
