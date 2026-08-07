/**
 * Quote PDF — browser-print rendering.
 *
 * Strategy: instead of running a serverless headless-Chrome (which is a
 * deployment minefield on Vercel) or pulling in a 1MB+ react-pdf bundle,
 * we render a print-styled HTML page and let the browser do the work.
 * The user clicks "Save as PDF" in the print dialog — same result, zero
 * new infrastructure. Same approach used by Linear / Stripe Tax / GitHub
 * invoices.
 *
 * The page auto-triggers `window.print()` when loaded with `?auto=1`
 * (the Quote Builder's "Download PDF" button passes that flag). Without
 * the flag, the user can preview and print manually.
 */
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { db } from "@/lib/db";
import { getTenantCompanyBranding } from "@/lib/services/company-profile";
import { getQuote } from "@/lib/services/quotes/quote-service";
import { toNumber } from "@/lib/services/quotes/decimal";
import { PrintAutoTrigger } from "@/components/quotes/print-auto-trigger";
import { PrintButton } from "@/components/quotes/print-button";

export const runtime = "nodejs";

interface PrintQuoteLine {
  id: string;
  lineNumber: number;
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
  taxableAmount: number;
  gstRate: number;
  lineTotal: number;
}

export default async function PrintQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { auto } = await searchParams;

  const quote = await getQuote(user.tenantId, id);
  if (!quote) notFound();

  // Pull related records the print template needs. None of these are
  // critical-path; we render placeholders if missing.
  const [account, contact, company] = await Promise.all([
    quote.accountId
      ? db.qcfAccount.findFirst({
          where: { id: quote.accountId, tenantId: user.tenantId },
          select: {
            name: true,
            city: true,
            state: true,
            countryCode: true,
            postalCode: true,
            website: true,
          },
        })
      : null,
    quote.contactId
      ? db.qcfContact.findFirst({
          where: { id: quote.contactId, tenantId: user.tenantId },
          select: { firstName: true, lastName: true, email: true, phone: true, title: true },
        })
      : null,
    getTenantCompanyBranding(user.tenantId),
  ]);

  const lines: PrintQuoteLine[] = quote.lines.map((l) => ({
    id: l.id,
    lineNumber: l.lineNumber,
    productName: l.productName,
    sku: l.sku,
    hsnCode: l.hsnCode,
    description: l.description,
    quantity: toNumber(l.quantity),
    unit: l.unit,
    unitPrice: toNumber(l.unitPrice),
    discountPct: toNumber(l.discountPct),
    taxableAmount: toNumber(l.taxableAmount),
    gstRate: toNumber(l.gstRate),
    lineTotal: toNumber(l.lineTotal),
  }));

  const isIntraState =
    !!quote.companyState &&
    !!quote.billingState &&
    quote.companyState.trim().toLowerCase() === quote.billingState.trim().toLowerCase();

  const totals = {
    subtotal: toNumber(quote.subtotal),
    totalLineDiscount: toNumber(quote.totalLineDiscount),
    overallDiscountAmount: toNumber(quote.overallDiscountAmount),
    freightAmount: toNumber(quote.freightAmount),
    taxableAmount: toNumber(quote.taxableAmount),
    cgstAmount: toNumber(quote.cgstAmount),
    sgstAmount: toNumber(quote.sgstAmount),
    igstAmount: toNumber(quote.igstAmount),
    roundOffAmount: toNumber(quote.roundOffAmount),
    grandTotal: toNumber(quote.grandTotal),
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const contactName = contact
    ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
    : null;

  return (
    <>
      {auto === "1" && <PrintAutoTrigger />}

      {/* Print-only style — these win over the dashboard layout when @media print is active. */}
      <style
        // eslint-disable-next-line react/no-unknown-property
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: A4; margin: 12mm 14mm; }
            @media print {
              body { background: white !important; }
              /* Hide the dashboard chrome (sidebar / topbar) when printing. */
              aside, nav[aria-label="Primary navigation"], header, .crm-no-print { display: none !important; }
              .quote-print-shell { padding: 0 !important; }
            }
            .quote-print-shell { background: white; max-width: 794px; margin: 0 auto; padding: 24px; color: #111827; font-size: 12px; line-height: 1.4; }
            .quote-print-shell h1 { font-size: 28px; font-weight: 700; letter-spacing: 0.05em; color: #1d4ed8; margin: 0; }
            .quote-print-shell h2 { font-size: 14px; font-weight: 600; color: #1d4ed8; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.06em; }
            .quote-print-shell .muted { color: #6b7280; }
            .quote-print-shell .grid-cols-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
            .quote-print-shell .grid-cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .quote-print-shell table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            .quote-print-shell th { background: #eff6ff; color: #1e40af; padding: 8px 6px; text-align: left; font-weight: 600; font-size: 11px; border-bottom: 2px solid #bfdbfe; }
            .quote-print-shell td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
            .quote-print-shell .ta-right { text-align: right; }
            .quote-print-shell .ta-center { text-align: center; }
            .quote-print-shell .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
            .quote-print-shell .totals-row.strong { font-weight: 700; font-size: 14px; border-top: 2px solid #111827; padding-top: 8px; margin-top: 8px; }
            .quote-print-shell .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
            .quote-print-shell .badge-draft { background: #f3f4f6; color: #374151; }
            .quote-print-shell .badge-active { background: #dbeafe; color: #1e40af; }
            .quote-print-shell .badge-won { background: #d1fae5; color: #065f46; }
            .quote-print-shell .badge-lost { background: #fee2e2; color: #991b1b; }
            .quote-print-shell .badge-revised { background: #fef3c7; color: #92400e; }
            .crm-print-toolbar { background: #f9fafb; border-bottom: 1px solid #e5e7eb; padding: 8px 16px; display: flex; gap: 8px; align-items: center; }
            @media print { .crm-print-toolbar { display: none !important; } }
          `,
        }}
      />

      {/* Non-printed toolbar — gives the user a manual "Print" button if they
          arrived without ?auto=1. The Quote Builder always passes ?auto=1,
          but if someone shares the print URL directly this is the fallback. */}
      <div className="crm-print-toolbar crm-no-print">
        <a href={`/quotes/${quote.id}`} className="crm-btn-ghost">
          ← Back to quote
        </a>
        <PrintButton />
      </div>

      <div className="quote-print-shell">
        {/* Header band */}
        <div className="grid-cols-2" style={{ marginBottom: 24, alignItems: "start" }}>
          <div>
            {company?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoUrl} alt="" style={{ height: 40, marginBottom: 8 }} />
            ) : null}
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {company.companyName}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {company?.website ?? ""} {company?.phone ? `• ${company.phone}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>QUOTATION</h1>
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <div>
                <span className="muted">Quote #</span> <strong>{quote.quoteNumber}</strong>
                {quote.versionNumber > 1 && (
                  <span className="muted"> (v{quote.versionNumber})</span>
                )}
              </div>
              <div>
                <span className="muted">Date:</span> {fmtDate(quote.effectiveFrom)}
              </div>
              {quote.effectiveTo && (
                <div>
                  <span className="muted">Valid until:</span> {fmtDate(quote.effectiveTo)}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                <span
                  className={`badge badge-${quote.status.toLowerCase()}`}
                >
                  {quote.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bill To / Prepared By */}
        <div className="grid-cols-2" style={{ marginBottom: 20 }}>
          <div>
            <h2>Bill To</h2>
            <div style={{ fontWeight: 600 }}>{account?.name ?? "—"}</div>
            {contactName && <div>{contactName}</div>}
            {contact?.email && <div className="muted">{contact.email}</div>}
            {contact?.phone && <div className="muted">{contact.phone}</div>}
            {account?.state && (
              <div className="muted">
                {[account.city, account.state, account.postalCode]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
          </div>
          <div>
            <h2>Prepared By</h2>
            <div style={{ fontWeight: 600 }}>{quote.ownerName ?? "—"}</div>
            <div className="muted">
              GST mode: {isIntraState ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}
            </div>
          </div>
        </div>

        {/* Line items */}
        <table>
          <thead>
            <tr>
              <th style={{ width: "5%" }}>#</th>
              <th style={{ width: "35%" }}>Item</th>
              <th style={{ width: "10%" }} className="ta-right">
                Qty
              </th>
              <th style={{ width: "12%" }} className="ta-right">
                Rate (₹)
              </th>
              <th style={{ width: "8%" }} className="ta-right">
                Disc%
              </th>
              <th style={{ width: "12%" }} className="ta-right">
                Taxable
              </th>
              <th style={{ width: "6%" }} className="ta-right">
                GST%
              </th>
              <th style={{ width: "12%" }} className="ta-right">
                Total (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="ta-center muted" style={{ padding: 24 }}>
                  No line items.
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.lineNumber}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{l.productName}</div>
                    {l.sku && <div className="muted">SKU: {l.sku}</div>}
                    {l.hsnCode && <div className="muted">HSN: {l.hsnCode}</div>}
                    {l.description && (
                      <div className="muted" style={{ marginTop: 2 }}>
                        {l.description}
                      </div>
                    )}
                  </td>
                  <td className="ta-right">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="ta-right">{fmt(l.unitPrice)}</td>
                  <td className="ta-right">{l.discountPct}%</td>
                  <td className="ta-right">{fmt(l.taxableAmount)}</td>
                  <td className="ta-right">{l.gstRate}%</td>
                  <td className="ta-right" style={{ fontWeight: 600 }}>
                    {fmt(l.lineTotal)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div
          style={{
            marginTop: 16,
            marginLeft: "auto",
            width: 320,
          }}
        >
          <div className="totals-row">
            <span className="muted">Subtotal</span>
            <span>₹{fmt(totals.subtotal)}</span>
          </div>
          {totals.totalLineDiscount > 0 && (
            <div className="totals-row">
              <span className="muted">Line discount</span>
              <span>− ₹{fmt(totals.totalLineDiscount)}</span>
            </div>
          )}
          {totals.overallDiscountAmount > 0 && (
            <div className="totals-row">
              <span className="muted">Overall discount</span>
              <span>− ₹{fmt(totals.overallDiscountAmount)}</span>
            </div>
          )}
          <div className="totals-row">
            <span className="muted">Taxable amount</span>
            <span>₹{fmt(totals.taxableAmount)}</span>
          </div>
          {isIntraState ? (
            <>
              <div className="totals-row">
                <span className="muted">CGST</span>
                <span>₹{fmt(totals.cgstAmount)}</span>
              </div>
              <div className="totals-row">
                <span className="muted">SGST</span>
                <span>₹{fmt(totals.sgstAmount)}</span>
              </div>
            </>
          ) : (
            <div className="totals-row">
              <span className="muted">IGST</span>
              <span>₹{fmt(totals.igstAmount)}</span>
            </div>
          )}
          {totals.freightAmount > 0 && (
            <div className="totals-row">
              <span className="muted">Freight</span>
              <span>₹{fmt(totals.freightAmount)}</span>
            </div>
          )}
          {totals.roundOffAmount !== 0 && (
            <div className="totals-row">
              <span className="muted">Round-off</span>
              <span>₹{fmt(totals.roundOffAmount)}</span>
            </div>
          )}
          <div className="totals-row strong">
            <span>Grand total</span>
            <span>₹{fmt(totals.grandTotal)}</span>
          </div>
        </div>

        {quote.grandTotalInWords && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            <span style={{ fontWeight: 600 }}>In words:</span> {quote.grandTotalInWords}
          </div>
        )}

        {/* Terms */}
        {quote.termsText && (
          <div style={{ marginTop: 20 }}>
            <h2>Terms &amp; Conditions</h2>
            <div style={{ whiteSpace: "pre-wrap" }}>{quote.termsText}</div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 40,
            paddingTop: 16,
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "#9ca3af",
          }}
        >
          <span>
            {quote.quoteNumber} • Generated {fmtDate(new Date())}
          </span>
          <span>Authorized signatory</span>
        </div>
      </div>
    </>
  );
}
