import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { registerPdfFonts, PDF_FONT } from "@/lib/pdf-fonts";
import type { TemplateConfig, ColumnKey } from "@/lib/pdf-templates/config";
import { type DocumentData, makeMoney, amountInWords } from "@/lib/pdf-templates/document";

registerPdfFonts();

const PAGE_SIZE: Record<string, "A4" | "A5" | "LETTER"> = { A4: "A4", A5: "A5", Letter: "LETTER" };

function cellValue(key: ColumnKey, line: DocumentData["lines"][number], money: (n: number) => string): string {
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

export function TemplateDocument({ config, doc }: { config: TemplateConfig; doc: DocumentData }) {
  const money = makeMoney(doc.currency);
  const m = config.margins;
  const cols = config.columns.filter((c) => c.show);
  const totalWidth = cols.reduce((s, c) => s + (c.width || 1), 0) || 1;
  const grid = config.layout === "spreadsheet";
  const darkHeader = config.headerBg && config.headerBg.toLowerCase() !== "#ffffff";

  const styles = StyleSheet.create({
    page: { paddingTop: m.top * 72, paddingBottom: m.bottom * 72, paddingLeft: m.left * 72, paddingRight: m.right * 72, fontSize: 9, color: "#172033", fontFamily: PDF_FONT },
    headerBand: { backgroundColor: config.headerBg, padding: darkHeader ? 12 : 0, marginBottom: 14, flexDirection: "row", justifyContent: "space-between" },
    brand: { fontSize: 14, fontWeight: 700, color: darkHeader ? "#FFFFFF" : config.accentColor },
    muted: { color: darkHeader ? "#E2E8F0" : "#475569", fontSize: 8 },
    title: { fontSize: config.titleFontSize, fontWeight: 700, color: config.titleColor },
    metaRow: { flexDirection: "row", marginBottom: 1 },
    metaLabel: { width: 70, color: "#475569" },
    metaValue: { fontWeight: 700 },
    partyWrap: { flexDirection: "row", gap: 10, marginBottom: 12 },
    partyBox: { flex: 1, border: "1px solid #CBD5E1", padding: 8 },
    partyTitle: { fontSize: 8, fontWeight: 700, color: config.accentColor, marginBottom: 3, textTransform: "uppercase" },
    th: { flexDirection: "row", backgroundColor: grid ? "#FFFFFF" : "#F1F5F9", borderTop: "1px solid #94A3B8", borderBottom: "1px solid #94A3B8", paddingVertical: 5, paddingHorizontal: 4, fontWeight: 700 },
    tr: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottom: grid ? "1px solid #CBD5E1" : "1px solid #E2E8F0" },
    cell: { paddingHorizontal: 2 },
    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
    totalsBox: { width: "48%" },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    grand: { flexDirection: "row", justifyContent: "space-between", borderTop: "1px solid #94A3B8", marginTop: 4, paddingTop: 4 },
    grandText: { fontSize: 11, fontWeight: 700 },
    section: { marginTop: 12 },
    sectionTitle: { fontSize: 8, fontWeight: 700, color: config.accentColor, marginBottom: 2, textTransform: "uppercase" },
    words: { marginTop: 10, fontWeight: 700 },
    footer: { position: "absolute", bottom: 18, left: m.left * 72, right: m.right * 72, textAlign: "center", color: "#94A3B8", fontSize: 7 },
    sign: { marginTop: 28, alignItems: "flex-end" }
  });

  const colStyle = (w: number, alignRight: boolean) => ({ width: `${((w || 1) / totalWidth) * 100}%`, textAlign: alignRight ? ("right" as const) : ("left" as const) });
  const isRight = (k: ColumnKey) => ["qty", "rate", "discount", "tax", "amount"].includes(k);

  return (
    <Document>
      <Page size={PAGE_SIZE[config.paperSize] ?? "A4"} orientation={config.orientation} style={styles.page}>
        {/* Header */}
        <View style={styles.headerBand}>
          <View style={{ maxWidth: "58%" }}>
            {config.showOrgName ? <Text style={styles.brand}>{doc.company.name}</Text> : null}
            {config.showOrgAddress ? doc.company.address.map((l) => <Text key={l} style={styles.muted}>{l}</Text>) : null}
            {config.showOrgAddress && doc.company.gstin ? <Text style={styles.muted}>GSTIN: {doc.company.gstin}</Text> : null}
            {config.showOrgAddress && doc.company.email ? <Text style={styles.muted}>{doc.company.email}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "40%" }}>
            {config.showDocumentTitle ? <Text style={styles.title}>{config.documentTitle}</Text> : null}
          </View>
        </View>

        {/* Document meta */}
        <View style={{ marginBottom: 12 }}>
          {config.fields.number ? <View style={styles.metaRow}><Text style={styles.metaLabel}>#</Text><Text style={styles.metaValue}>: {doc.meta.number}</Text></View> : null}
          {config.fields.date ? <View style={styles.metaRow}><Text style={styles.metaLabel}>Date</Text><Text style={styles.metaValue}>: {doc.meta.date}</Text></View> : null}
          {config.fields.terms && doc.meta.terms ? <View style={styles.metaRow}><Text style={styles.metaLabel}>Terms</Text><Text style={styles.metaValue}>: {doc.meta.terms}</Text></View> : null}
          {config.fields.dueDate && doc.meta.dueDate ? <View style={styles.metaRow}><Text style={styles.metaLabel}>Due Date</Text><Text style={styles.metaValue}>: {doc.meta.dueDate}</Text></View> : null}
          {config.fields.reference && doc.meta.reference ? <View style={styles.metaRow}><Text style={styles.metaLabel}>Reference</Text><Text style={styles.metaValue}>: {doc.meta.reference}</Text></View> : null}
          {config.fields.subject && doc.meta.subject ? <View style={styles.metaRow}><Text style={styles.metaLabel}>Subject</Text><Text style={styles.metaValue}>: {doc.meta.subject}</Text></View> : null}
        </View>

        {/* Parties */}
        {(config.showBillTo || config.showShipTo) ? (
          <View style={styles.partyWrap}>
            {config.showBillTo ? (
              <View style={styles.partyBox}>
                <Text style={styles.partyTitle}>{doc.billTo.label}</Text>
                <Text style={{ fontWeight: 700 }}>{doc.billTo.name}</Text>
                {doc.billTo.address.map((l) => <Text key={l} style={styles.muted}>{l}</Text>)}
                {doc.billTo.gstin ? <Text style={styles.muted}>GSTIN: {doc.billTo.gstin}</Text> : null}
              </View>
            ) : null}
            {config.showShipTo && doc.shipTo ? (
              <View style={styles.partyBox}>
                <Text style={styles.partyTitle}>Ship To</Text>
                <Text style={{ fontWeight: 700 }}>{doc.shipTo.name}</Text>
                {doc.shipTo.address.map((l) => <Text key={l} style={styles.muted}>{l}</Text>)}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Line items */}
        <View>
          <View style={styles.th}>
            {cols.map((c) => <Text key={c.key} style={[styles.cell, colStyle(c.width, isRight(c.key))]}>{c.label}</Text>)}
          </View>
          {doc.lines.map((line, i) => (
            <View key={i} style={styles.tr}>
              {cols.map((c) => (
                <View key={c.key} style={[styles.cell, colStyle(c.width, isRight(c.key))]}>
                  <Text>{cellValue(c.key, line, money)}</Text>
                  {c.key === "item" && line.description ? <Text style={styles.muted}>{line.description}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            {config.showSubTotal ? <View style={styles.totalRow}><Text>Sub Total</Text><Text>{money(doc.totals.subTotal)}</Text></View> : null}
            {config.showDiscount && doc.totals.discount ? <View style={styles.totalRow}><Text>Discount</Text><Text>-{money(doc.totals.discount)}</Text></View> : null}
            {config.showShipping && doc.totals.shipping ? <View style={styles.totalRow}><Text>Shipping</Text><Text>{money(doc.totals.shipping)}</Text></View> : null}
            {config.showTaxDetails && doc.taxBreakup.igst ? <View style={styles.totalRow}><Text>IGST</Text><Text>{money(doc.taxBreakup.igst)}</Text></View> : null}
            {config.showTaxDetails && !doc.taxBreakup.igst && doc.taxBreakup.cgst ? <View style={styles.totalRow}><Text>CGST</Text><Text>{money(doc.taxBreakup.cgst)}</Text></View> : null}
            {config.showTaxDetails && !doc.taxBreakup.igst && doc.taxBreakup.sgst ? <View style={styles.totalRow}><Text>SGST</Text><Text>{money(doc.taxBreakup.sgst)}</Text></View> : null}
            {doc.totals.roundOff ? <View style={styles.totalRow}><Text>Round Off</Text><Text>{money(doc.totals.roundOff)}</Text></View> : null}
            <View style={styles.grand}><Text style={styles.grandText}>Total</Text><Text style={styles.grandText}>{money(doc.totals.total)}</Text></View>
          </View>
        </View>

        {config.showAmountInWords ? <Text style={styles.words}>{amountInWords(doc.totals.total, doc.currency)}</Text> : null}

        {/* Notes / Terms / Signature */}
        {config.showNotes && doc.notes ? <View style={styles.section}><Text style={styles.sectionTitle}>{config.notesLabel}</Text><Text style={styles.muted}>{doc.notes}</Text></View> : null}
        {config.showTerms && doc.terms ? <View style={styles.section}><Text style={styles.sectionTitle}>{config.termsLabel}</Text><Text style={styles.muted}>{doc.terms}</Text></View> : null}
        {config.showSignature ? <View style={styles.sign}><Text style={styles.muted}>{config.signatureLabel}</Text></View> : null}

        {config.footerText ? <Text style={styles.footer} fixed>{config.footerText}</Text> : null}
      </Page>
    </Document>
  );
}
