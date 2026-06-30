import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { QuotationPdfData } from "@/lib/quotation-pdf";
import { registerPdfFonts, PDF_FONT } from "@/lib/pdf-fonts";

registerPdfFonts();

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#172033", fontFamily: PDF_FONT },
  row: { flexDirection: "row", justifyContent: "space-between" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brand: { fontSize: 20, fontWeight: 700, color: "#4F46E5" },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", color: "#0F172A" },
  card: { border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, marginBottom: 14 },
  muted: { color: "#475569" },
  tableHeader: { flexDirection: "row", backgroundColor: "#F1F5F9", padding: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, fontWeight: 700 },
  tableRow: { flexDirection: "row", padding: 8, borderBottom: "1px solid #E2E8F0" },
  colSno: { flex: 0.5 },
  colDescription: { flex: 2.6 },
  colQty: { flex: 0.8, textAlign: "right" },
  colRate: { flex: 1, textAlign: "right" },
  colDiscount: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  totalValue: { fontSize: 12, fontWeight: 700 },
  small: { fontSize: 9 }
});

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB", AUD: "en-AU", CAD: "en-CA", JPY: "ja-JP" };
function makeMoney(currency: string) {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  const locale = LOCALE_BY_CURRENCY[code] ?? "en-IN";
  return (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
}

export function QuotationPDFTemplate({ quote }: { quote: QuotationPdfData }) {
  const money = makeMoney(quote.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ maxWidth: "60%" }}>
            <Text style={styles.brand}>{quote.companyName}</Text>
            {quote.companyAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
            {quote.companyGstin ? <Text style={styles.muted}>GSTIN: {quote.companyGstin}</Text> : null}
            {quote.companyEmail ? <Text style={styles.muted}>Email: {quote.companyEmail}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "38%" }}>
            <Text style={{ fontSize: 22, fontWeight: 700 }}>Quote</Text>
            <Text>Quote No: {quote.quotationNumber}</Text>
            {quote.referenceNumber ? <Text>Reference: {quote.referenceNumber}</Text> : null}
            <Text>Date: {quote.issueDate}</Text>
            {quote.expiryDate ? <Text>Expiry: {quote.expiryDate}</Text> : null}
            {quote.salesperson ? <Text>Salesperson: {quote.salesperson}</Text> : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quote To</Text>
          <Text>{quote.customerName}</Text>
          {quote.customerAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
          {quote.customerEmail ? <Text style={styles.muted}>Email: {quote.customerEmail}</Text> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.tableHeader}>
            <Text style={styles.colSno}>#</Text>
            <Text style={styles.colDescription}>Item</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Price</Text>
            <Text style={styles.colDiscount}>Discount</Text>
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {quote.lineItems.map((line, index) => (
            <View key={`${line.description}-${index}`} style={styles.tableRow}>
              <Text style={styles.colSno}>{index + 1}</Text>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity.toFixed(2)}</Text>
              <Text style={styles.colRate}>{money(line.rate)}</Text>
              <Text style={styles.colDiscount}>{line.discount ? money(line.discount) : "-"}</Text>
              <Text style={styles.colTotal}>{money(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.row, { justifyContent: "flex-end" }]}>
          <View style={{ width: "45%" }}>
            <View style={styles.totalRow}><Text style={styles.muted}>Sub Total</Text><Text>{money(quote.subtotal)}</Text></View>
            {quote.discountTotal ? <View style={styles.totalRow}><Text style={styles.muted}>Discount</Text><Text>-{money(quote.discountTotal)}</Text></View> : null}
            <View style={styles.totalRow}><Text style={styles.muted}>Adjustment</Text><Text>{money(quote.adjustment)}</Text></View>
            <View style={[styles.totalRow, { marginTop: 8, borderTop: "1px solid #E2E8F0", paddingTop: 6 }]}>
              <Text style={styles.totalValue}>Total</Text><Text style={styles.totalValue}>{money(quote.total)}</Text>
            </View>
          </View>
        </View>

        {(quote.notes || quote.terms) ? (
          <View style={[styles.card, { marginTop: 18 }]}>
            {quote.notes ? (
              <View style={{ marginBottom: quote.terms ? 10 : 0 }}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.muted}>{quote.notes}</Text>
              </View>
            ) : null}
            {quote.terms ? (
              <View>
                <Text style={styles.sectionTitle}>Terms &amp; Conditions</Text>
                <Text style={styles.muted}>{quote.terms}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
