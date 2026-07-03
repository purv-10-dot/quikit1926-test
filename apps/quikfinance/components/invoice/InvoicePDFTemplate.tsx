import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoicePdfData } from "@/lib/invoice-pdf";
import { registerPdfFonts, PDF_FONT } from "@/lib/pdf-fonts";

registerPdfFonts();

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#172033", fontFamily: PDF_FONT },
  row: { flexDirection: "row", justifyContent: "space-between" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brand: { fontSize: 20, fontWeight: 700, color: "#0F766E" },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", color: "#0F172A" },
  card: { border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, marginBottom: 14 },
  muted: { color: "#475569" },
  tableHeader: { flexDirection: "row", backgroundColor: "#F1F5F9", padding: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, fontWeight: 700 },
  tableRow: { flexDirection: "row", padding: 8, borderBottom: "1px solid #E2E8F0" },
  colDescription: { flex: 2.2 },
  colHsn: { flex: 1 },
  colQty: { flex: 0.8, textAlign: "right" },
  colRate: { flex: 1, textAlign: "right" },
  colTax: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  totalValue: { fontSize: 11, fontWeight: 700 },
  qrCard: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12 },
  small: { fontSize: 9 }
});

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB", AUD: "en-AU", CAD: "en-CA", JPY: "ja-JP" };

function makeMoney(currency: string) {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  const locale = LOCALE_BY_CURRENCY[code] ?? "en-IN";
  return (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
}

export function InvoicePDFTemplate({ invoice }: { invoice: InvoicePdfData }) {
  const money = makeMoney(invoice.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ maxWidth: "60%" }}>
            <Text style={styles.brand}>{invoice.companyName}</Text>
            {invoice.companySubtitle ? <Text style={styles.muted}>{invoice.companySubtitle}</Text> : null}
            {invoice.companyAddress.map((line) => (
              <Text key={line} style={styles.muted}>{line}</Text>
            ))}
            {invoice.companyGstin ? <Text style={styles.muted}>GSTIN: {invoice.companyGstin}</Text> : null}
            {invoice.companyPan ? <Text style={styles.muted}>PAN: {invoice.companyPan}</Text> : null}
            {invoice.companyEmail ? <Text style={styles.muted}>Email: {invoice.companyEmail}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "38%" }}>
            <Text style={{ fontSize: 22, fontWeight: 700 }}>Tax Invoice</Text>
            <Text>Invoice No: {invoice.invoiceNumber}</Text>
            <Text>Issue Date: {invoice.issueDate}</Text>
            <Text>Due Date: {invoice.dueDate}</Text>
            {invoice.placeOfSupply ? <Text>Place of Supply: {invoice.placeOfSupply}</Text> : null}
          </View>
        </View>

        <View style={[styles.row, { gap: 12, marginBottom: 14 }]}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.sectionTitle}>Bill To</Text>
            <Text>{invoice.customerName}</Text>
            {invoice.customerAddress.map((line) => (
              <Text key={line} style={styles.muted}>{line}</Text>
            ))}
            {invoice.customerEmail ? <Text style={styles.muted}>Email: {invoice.customerEmail}</Text> : null}
            {invoice.customerGstin ? <Text style={styles.muted}>GSTIN: {invoice.customerGstin}</Text> : null}
          </View>
          <View style={[styles.card, { flex: 0.8 }]}>
            <Text style={styles.sectionTitle}>E-Invoice</Text>
            <Text>IRN: {invoice.irn}</Text>
            <Text>Ack No: {invoice.ackNumber}</Text>
            <Text>Ack Date: {invoice.ackDate}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colHsn}>HSN/SAC</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colTax}>Tax</Text>
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {invoice.lineItems.map((line, index) => (
            <View key={`${line.description}-${index}`} style={styles.tableRow}>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colHsn}>{line.hsnSac}</Text>
              <Text style={styles.colQty}>{line.quantity.toFixed(2)}</Text>
              <Text style={styles.colRate}>{money(line.rate)}</Text>
              <Text style={styles.colTax}>{money(line.taxAmount)}</Text>
              <Text style={styles.colTotal}>{money(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.row, { gap: 12 }]}>
          <View style={[styles.qrCard, { flex: 1 }]}>
            <Text style={styles.sectionTitle}>Payment & Share</Text>
            {invoice.paymentLinkUrl ? <Text style={styles.small}>Payment Link: {invoice.paymentLinkUrl}</Text> : <Text style={styles.small}>Payment link will appear once generated.</Text>}
            {invoice.upiId ? <Text style={styles.small}>UPI ID: {invoice.upiId}</Text> : null}
            {invoice.upiUri ? <Text style={styles.small}>UPI Intent: {invoice.upiUri}</Text> : null}
            <Text style={[styles.small, { marginTop: 8 }]}>Share this invoice on WhatsApp with the payment link for faster collections.</Text>
          </View>
          <View style={[styles.card, { flex: 0.9 }]}>
            <Text style={styles.sectionTitle}>GST Breakup</Text>
            <View style={styles.totalRow}><Text>Taxable Value</Text><Text>{money(invoice.subtotal)}</Text></View>
            <View style={styles.totalRow}><Text>CGST</Text><Text>{money(invoice.taxBreakup.cgst)}</Text></View>
            <View style={styles.totalRow}><Text>SGST</Text><Text>{money(invoice.taxBreakup.sgst)}</Text></View>
            <View style={styles.totalRow}><Text>IGST</Text><Text>{money(invoice.taxBreakup.igst)}</Text></View>
            <View style={styles.totalRow}><Text>Discount</Text><Text>{money(invoice.discountTotal)}</Text></View>
            <View style={styles.totalRow}><Text>Round Off</Text><Text>{money(invoice.roundOff)}</Text></View>
            <View style={[styles.totalRow, { marginTop: 12 }]}><Text style={styles.totalValue}>Grand Total</Text><Text style={styles.totalValue}>{money(invoice.total)}</Text></View>
          </View>
        </View>

        {(invoice.notes || invoice.terms) ? (
          <View style={[styles.card, { marginTop: 14 }]}>
            {invoice.notes ? (
              <View style={{ marginBottom: invoice.terms ? 10 : 0 }}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.muted}>{invoice.notes}</Text>
              </View>
            ) : null}
            {invoice.terms ? (
              <View>
                <Text style={styles.sectionTitle}>Terms</Text>
                <Text style={styles.muted}>{invoice.terms}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
