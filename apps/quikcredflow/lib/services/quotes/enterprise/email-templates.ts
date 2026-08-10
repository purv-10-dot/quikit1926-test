export interface QuoteEmailTemplateVars {
  quoteNumber: string;
  companyName: string;
  grandTotal: string;
  validUntil: string;
  portalUrl: string;
  ownerName: string;
}

export function renderQuoteEmailHtml(vars: QuoteEmailTemplateVars): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px">
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:20px">
    <h1 style="margin:0;font-size:20px;color:#1d4ed8">${escape(vars.companyName)}</h1>
  </div>
  <p>Hello,</p>
  <p>Please find your quotation <strong>${escape(vars.quoteNumber)}</strong> for <strong>₹ ${escape(vars.grandTotal)}</strong>.</p>
  <p>Valid until: <strong>${escape(vars.validUntil)}</strong></p>
  <p style="margin:28px 0">
    <a href="${escape(vars.portalUrl)}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
      View &amp; Accept Quote
    </a>
  </p>
  <p class="muted" style="color:#6b7280;font-size:12px">
  Prepared by ${escape(vars.ownerName)} · QuikCRM
  </p>
</body>
</html>`;
}

export function renderQuoteEmailText(vars: QuoteEmailTemplateVars): string {
  return [
    `${vars.companyName}`,
    ``,
    `Quotation ${vars.quoteNumber}`,
    `Amount: ₹ ${vars.grandTotal}`,
    `Valid until: ${vars.validUntil}`,
    ``,
    `View quote: ${vars.portalUrl}`,
    ``,
    `— ${vars.ownerName}`,
  ].join("\n");
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
