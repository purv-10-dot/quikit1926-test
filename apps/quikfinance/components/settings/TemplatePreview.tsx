"use client";

import type { TemplateConfig, ColumnKey } from "@/lib/pdf-templates/config";
import { type DocumentData, makeMoney, amountInWords, sampleDocument } from "@/lib/pdf-templates/document";

const RIGHT: ColumnKey[] = ["qty", "rate", "discount", "tax", "amount"];

function cell(key: ColumnKey, line: DocumentData["lines"][number], money: (n: number) => string): string {
  switch (key) {
    case "sno": return String(line.sno);
    case "item": return line.item;
    case "description": return line.description;
    case "hsn": return line.hsn || "-";
    case "qty": return `${line.qty.toFixed(2)}${line.unit ? ` ${line.unit}` : ""}`;
    case "unit": return line.unit || "-";
    case "rate": return money(line.rate);
    case "discount": return line.discount ? money(line.discount) : "-";
    case "tax": return line.taxPct ? `${line.taxPct}%` : (line.tax ? money(line.tax) : "-");
    case "amount": return money(line.amount);
    default: return "";
  }
}

/** Lightweight HTML mirror of TemplateDocument for instant editor/gallery previews. */
export function TemplatePreview({ config, doc, scale = 1 }: { config: TemplateConfig; doc?: DocumentData; scale?: number }) {
  const d = doc ?? sampleDocument(config.documentTitle);
  const money = makeMoney(d.currency);
  const cols = config.columns.filter((c) => c.show);
  const grid = config.layout === "spreadsheet";
  const darkHeader = config.headerBg && config.headerBg.toLowerCase() !== "#ffffff";

  return (
    <div
      className="mx-auto bg-white text-[#172033] shadow-card"
      style={{ width: 595 * scale, minHeight: 842 * scale, fontSize: 8.5 * scale, padding: `${0.55 * 72 * scale}px ${0.45 * 72 * scale}px`, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between" style={{ background: darkHeader ? config.headerBg : "transparent", padding: darkHeader ? 10 * scale : 0, marginBottom: 12 * scale }}>
        <div style={{ maxWidth: "58%" }}>
          {config.showOrgName ? <div style={{ fontSize: 13 * scale, fontWeight: 700, color: darkHeader ? "#fff" : config.accentColor }}>{d.company.name}</div> : null}
          {config.showOrgAddress ? d.company.address.map((l) => <div key={l} style={{ color: darkHeader ? "#e2e8f0" : "#475569" }}>{l}</div>) : null}
          {config.showOrgAddress && d.company.gstin ? <div style={{ color: darkHeader ? "#e2e8f0" : "#475569" }}>GSTIN: {d.company.gstin}</div> : null}
        </div>
        {config.showDocumentTitle ? <div style={{ fontSize: config.titleFontSize * scale, fontWeight: 700, color: config.titleColor }}>{config.documentTitle}</div> : null}
      </div>

      {/* Meta */}
      <div style={{ marginBottom: 10 * scale }}>
        {config.fields.number ? <Meta label="#" value={d.meta.number} scale={scale} /> : null}
        {config.fields.date ? <Meta label="Date" value={d.meta.date} scale={scale} /> : null}
        {config.fields.terms && d.meta.terms ? <Meta label="Terms" value={d.meta.terms} scale={scale} /> : null}
        {config.fields.dueDate && d.meta.dueDate ? <Meta label="Due Date" value={d.meta.dueDate} scale={scale} /> : null}
        {config.fields.reference && d.meta.reference ? <Meta label="Reference" value={d.meta.reference} scale={scale} /> : null}
        {config.fields.subject && d.meta.subject ? <Meta label="Subject" value={d.meta.subject} scale={scale} /> : null}
      </div>

      {/* Parties */}
      {(config.showBillTo || config.showShipTo) ? (
        <div className="flex gap-2" style={{ marginBottom: 10 * scale }}>
          {config.showBillTo ? (
            <div className="flex-1 border" style={{ borderColor: "#cbd5e1", padding: 7 * scale }}>
              <div style={{ fontWeight: 700, color: config.accentColor, textTransform: "uppercase", marginBottom: 2 * scale }}>{d.billTo.label}</div>
              <div style={{ fontWeight: 700 }}>{d.billTo.name}</div>
              {d.billTo.address.map((l) => <div key={l} style={{ color: "#475569" }}>{l}</div>)}
            </div>
          ) : null}
          {config.showShipTo && d.shipTo ? (
            <div className="flex-1 border" style={{ borderColor: "#cbd5e1", padding: 7 * scale }}>
              <div style={{ fontWeight: 700, color: config.accentColor, textTransform: "uppercase", marginBottom: 2 * scale }}>Ship To</div>
              <div style={{ fontWeight: 700 }}>{d.shipTo.name}</div>
              {d.shipTo.address.map((l) => <div key={l} style={{ color: "#475569" }}>{l}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Table */}
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: grid ? "#fff" : "#f1f5f9", borderTop: "1px solid #94a3b8", borderBottom: "1px solid #94a3b8" }}>
            {cols.map((c) => (
              <th key={c.key} style={{ width: `${c.width}%`, textAlign: RIGHT.includes(c.key) ? "right" : "left", padding: `${4 * scale}px ${3 * scale}px`, fontWeight: 700 }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.lines.map((line, i) => (
            <tr key={i} style={{ borderBottom: grid ? "1px solid #cbd5e1" : "1px solid #e2e8f0" }}>
              {cols.map((c) => (
                <td key={c.key} style={{ textAlign: RIGHT.includes(c.key) ? "right" : "left", padding: `${4 * scale}px ${3 * scale}px`, verticalAlign: "top" }}>
                  <div>{cell(c.key, line, money)}</div>
                  {c.key === "item" && line.description ? <div style={{ color: "#475569" }}>{line.description}</div> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end" style={{ marginTop: 10 * scale }}>
        <div style={{ width: "48%" }}>
          {config.showSubTotal ? <Total label="Sub Total" value={money(d.totals.subTotal)} scale={scale} /> : null}
          {config.showDiscount && d.totals.discount ? <Total label="Discount" value={`-${money(d.totals.discount)}`} scale={scale} /> : null}
          {config.showShipping && d.totals.shipping ? <Total label="Shipping" value={money(d.totals.shipping)} scale={scale} /> : null}
          {config.showTaxDetails && d.taxBreakup.igst ? <Total label="IGST" value={money(d.taxBreakup.igst)} scale={scale} /> : null}
          {config.showTaxDetails && !d.taxBreakup.igst && d.taxBreakup.cgst ? <Total label="CGST" value={money(d.taxBreakup.cgst)} scale={scale} /> : null}
          {config.showTaxDetails && !d.taxBreakup.igst && d.taxBreakup.sgst ? <Total label="SGST" value={money(d.taxBreakup.sgst)} scale={scale} /> : null}
          <div className="flex justify-between" style={{ borderTop: "1px solid #94a3b8", marginTop: 3 * scale, paddingTop: 3 * scale, fontWeight: 700, fontSize: 10 * scale }}>
            <span>Total</span><span>{money(d.totals.total)}</span>
          </div>
        </div>
      </div>

      {config.showAmountInWords ? <div style={{ marginTop: 8 * scale, fontStyle: "italic", fontWeight: 700 }}>{amountInWords(d.totals.total, d.currency)}</div> : null}

      {config.showNotes && d.notes ? <Block title={config.notesLabel} body={d.notes} color={config.accentColor} scale={scale} /> : null}
      {config.showTerms && d.terms ? <Block title={config.termsLabel} body={d.terms} color={config.accentColor} scale={scale} /> : null}
      {config.showSignature ? <div style={{ marginTop: 24 * scale, textAlign: "right", color: "#475569" }}>{config.signatureLabel}</div> : null}
      {config.footerText ? <div style={{ marginTop: 16 * scale, textAlign: "center", color: "#94a3b8", fontSize: 7 * scale }}>{config.footerText}</div> : null}
    </div>
  );
}

function Meta({ label, value, scale }: { label: string; value: string; scale: number }) {
  return <div className="flex"><span style={{ width: 64 * scale, color: "#475569" }}>{label}</span><span style={{ fontWeight: 700 }}>: {value}</span></div>;
}
function Total({ label, value, scale }: { label: string; value: string; scale: number }) {
  return <div className="flex justify-between" style={{ padding: `${1.5 * scale}px 0` }}><span>{label}</span><span>{value}</span></div>;
}
function Block({ title, body, color, scale }: { title: string; body: string; color: string; scale: number }) {
  return <div style={{ marginTop: 10 * scale }}><div style={{ fontWeight: 700, color, textTransform: "uppercase", marginBottom: 1 * scale }}>{title}</div><div style={{ color: "#475569" }}>{body}</div></div>;
}
