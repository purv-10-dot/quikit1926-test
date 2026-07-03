import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { VendorCreditPdfData } from "@/lib/vendor-credit-pdf";
import { registerPdfFonts, PDF_FONT } from "@/lib/pdf-fonts";

registerPdfFonts();

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#172033", fontFamily: PDF_FONT },
  row: { flexDirection: "row", justifyContent: "space-between" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brand: { fontSize: 18, fontWeight: 700, color: "#4F46E5" },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", color: "#0F172A" },
  card: { border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, marginBottom: 14 },
  muted: { color: "#475569" },
  tableHeader: { flexDirection: "row", backgroundColor: "#1F2937", color: "#FFFFFF", padding: 8, fontWeight: 700 },
  tableRow: { flexDirection: "row", padding: 8, borderBottom: "1px solid #E2E8F0" },
  colSno: { flex: 0.5 }, colDescription: { flex: 2.8 }, colQty: { flex: 0.9, textAlign: "right" }, colRate: { flex: 1, textAlign: "right" }, colTotal: { flex: 1, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  totalValue: { fontSize: 12, fontWeight: 700 }
});

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB" };
function makeMoney(currency: string) {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  return (value: number) => new Intl.NumberFormat(LOCALE_BY_CURRENCY[code] ?? "en-IN", { style: "currency", currency: code }).format(value);
}

export function VendorCreditPDFTemplate({ note }: { note: VendorCreditPdfData }) {
  const money = makeMoney(note.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ maxWidth: "60%" }}>
            <Text style={styles.brand}>{note.companyName}</Text>
            {note.companyAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
            {note.companyGstin ? <Text style={styles.muted}>GSTIN: {note.companyGstin}</Text> : null}
            {note.companyEmail ? <Text style={styles.muted}>Email: {note.companyEmail}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "40%" }}>
            <Text style={{ fontSize: 20, fontWeight: 700 }}>Vendor Credit</Text>
            <Text>Vendor Credit# {note.vendorCreditNumber}</Text>
            {note.referenceNumber ? <Text>Reference: {note.referenceNumber}</Text> : null}
            <Text>Date: {note.issueDate}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Vendor</Text>
          <Text>{note.vendorName}</Text>
          {note.vendorAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
        </View>
        {note.subject ? <Text style={[styles.muted, { marginBottom: 10 }]}>Subject: {note.subject}</Text> : null}

        <View style={styles.card}>
          <View style={styles.tableHeader}>
            <Text style={styles.colSno}>#</Text><Text style={styles.colDescription}>Item & Description</Text><Text style={styles.colQty}>Qty</Text><Text style={styles.colRate}>Rate</Text><Text style={styles.colTotal}>Amount</Text>
          </View>
          {note.lineItems.map((line, index) => (
            <View key={`${line.description}-${index}`} style={styles.tableRow}>
              <Text style={styles.colSno}>{index + 1}</Text>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity.toFixed(2)}</Text>
              <Text style={styles.colRate}>{money(line.rate)}</Text>
              <Text style={styles.colTotal}>{money(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.row, { justifyContent: "flex-end" }]}>
          <View style={{ width: "45%" }}>
            <View style={styles.totalRow}><Text style={styles.muted}>Sub Total</Text><Text>{money(note.subtotal)}</Text></View>
            {note.discountTotal ? <View style={styles.totalRow}><Text style={styles.muted}>Discount</Text><Text>-{money(note.discountTotal)}</Text></View> : null}
            {note.taxTotal ? <View style={styles.totalRow}><Text style={styles.muted}>Tax</Text><Text>{money(note.taxTotal)}</Text></View> : null}
            <View style={[styles.totalRow, { marginTop: 8, borderTop: "1px solid #E2E8F0", paddingTop: 6 }]}><Text style={styles.totalValue}>Total</Text><Text style={styles.totalValue}>{money(note.total)}</Text></View>
            <View style={styles.totalRow}><Text style={styles.muted}>Credits Remaining</Text><Text>{money(note.balance)}</Text></View>
          </View>
        </View>

        {note.notes ? <View style={[styles.card, { marginTop: 18 }]}><Text style={styles.sectionTitle}>Notes</Text><Text style={styles.muted}>{note.notes}</Text></View> : null}
        <View style={{ marginTop: 40 }}><Text style={styles.muted}>Authorized Signature ______________________</Text></View>
      </Page>
    </Document>
  );
}
