import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SalesOrderPdfData } from "@/lib/sales-order-pdf";
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
  tableHeader: { flexDirection: "row", backgroundColor: "#1F2937", color: "#FFFFFF", padding: 8, fontWeight: 700 },
  tableRow: { flexDirection: "row", padding: 8, borderBottom: "1px solid #E2E8F0" },
  colSno: { flex: 0.5 },
  colDescription: { flex: 2.6 },
  colQty: { flex: 0.8, textAlign: "right" },
  colRate: { flex: 1, textAlign: "right" },
  colDiscount: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  totalValue: { fontSize: 12, fontWeight: 700 }
});

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB", AUD: "en-AU", CAD: "en-CA", JPY: "ja-JP" };
function makeMoney(currency: string) {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  const locale = LOCALE_BY_CURRENCY[code] ?? "en-IN";
  return (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
}

export function SalesOrderPDFTemplate({ order }: { order: SalesOrderPdfData }) {
  const money = makeMoney(order.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ maxWidth: "60%" }}>
            <Text style={styles.brand}>{order.companyName}</Text>
            {order.companyAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
            {order.companyGstin ? <Text style={styles.muted}>GSTIN: {order.companyGstin}</Text> : null}
            {order.companyEmail ? <Text style={styles.muted}>Email: {order.companyEmail}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "38%" }}>
            <Text style={{ fontSize: 22, fontWeight: 700 }}>Sales Order</Text>
            <Text>Sales Order# {order.salesOrderNumber}</Text>
            {order.referenceNumber ? <Text>Reference: {order.referenceNumber}</Text> : null}
            <Text>Order Date: {order.issueDate}</Text>
            {order.expectedShipmentDate ? <Text>Expected Shipment: {order.expectedShipmentDate}</Text> : null}
            {order.paymentTerms ? <Text>Payment Terms: {order.paymentTerms}</Text> : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          <Text>{order.customerName}</Text>
          {order.customerAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
          {order.customerEmail ? <Text style={styles.muted}>Email: {order.customerEmail}</Text> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.tableHeader}>
            <Text style={styles.colSno}>#</Text>
            <Text style={styles.colDescription}>Item &amp; Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colDiscount}>Discount</Text>
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {order.lineItems.map((line, index) => (
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
            <View style={styles.totalRow}><Text style={styles.muted}>Sub Total</Text><Text>{money(order.subtotal)}</Text></View>
            {order.discountTotal ? <View style={styles.totalRow}><Text style={styles.muted}>Discount</Text><Text>-{money(order.discountTotal)}</Text></View> : null}
            <View style={styles.totalRow}><Text style={styles.muted}>Adjustment</Text><Text>{money(order.adjustment)}</Text></View>
            <View style={[styles.totalRow, { marginTop: 8, borderTop: "1px solid #E2E8F0", paddingTop: 6 }]}>
              <Text style={styles.totalValue}>Total</Text><Text style={styles.totalValue}>{money(order.total)}</Text>
            </View>
          </View>
        </View>

        {(order.notes || order.terms) ? (
          <View style={[styles.card, { marginTop: 18 }]}>
            {order.notes ? <View style={{ marginBottom: order.terms ? 10 : 0 }}><Text style={styles.sectionTitle}>Notes</Text><Text style={styles.muted}>{order.notes}</Text></View> : null}
            {order.terms ? <View><Text style={styles.sectionTitle}>Terms &amp; Conditions</Text><Text style={styles.muted}>{order.terms}</Text></View> : null}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
