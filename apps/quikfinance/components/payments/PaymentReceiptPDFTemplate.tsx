import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PaymentPdfData } from "@/lib/payment-pdf";
import { registerPdfFonts, PDF_FONT } from "@/lib/pdf-fonts";

registerPdfFonts();

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#172033", fontFamily: PDF_FONT },
  brand: { fontSize: 18, fontWeight: 700, color: "#4F46E5" },
  muted: { color: "#475569" },
  title: { fontSize: 18, fontWeight: 700, textAlign: "center", marginVertical: 22 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  fieldRow: { flexDirection: "row", marginBottom: 10 },
  fieldLabel: { width: 160, color: "#475569" },
  amountBox: { backgroundColor: "#16A34A", color: "#FFFFFF", borderRadius: 8, padding: 14, alignItems: "center", width: 180 },
  card: { border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, marginTop: 18 }
});

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB" };
function makeMoney(currency: string) {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  return (value: number) => new Intl.NumberFormat(LOCALE_BY_CURRENCY[code] ?? "en-IN", { style: "currency", currency: code }).format(value);
}

export function PaymentReceiptPDFTemplate({ payment }: { payment: PaymentPdfData }) {
  const money = makeMoney(payment.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.brand}>{payment.companyName}</Text>
          {payment.companyAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
          {payment.companyEmail ? <Text style={styles.muted}>{payment.companyEmail}</Text> : null}
        </View>

        <Text style={styles.title}>PAYMENT RECEIPT</Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={styles.fieldRow}><Text style={styles.fieldLabel}>Payment Date</Text><Text style={{ fontWeight: 700 }}>{payment.paymentDate}</Text></View>
            <View style={styles.fieldRow}><Text style={styles.fieldLabel}>Payment#</Text><Text>{payment.paymentNumber}</Text></View>
            <View style={styles.fieldRow}><Text style={styles.fieldLabel}>Reference Number</Text><Text>{payment.referenceNumber || "—"}</Text></View>
            <View style={styles.fieldRow}><Text style={styles.fieldLabel}>Payment Mode</Text><Text style={{ fontWeight: 700 }}>{payment.mode}</Text></View>
          </View>
          <View style={styles.amountBox}>
            <Text>Amount Received</Text>
            <Text style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{money(payment.amount)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ marginTop: 24 }}>
            <Text style={styles.muted}>Received From</Text>
            <Text style={{ fontWeight: 700, marginTop: 4 }}>{payment.customerName}</Text>
            {payment.customerAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
          </View>
          <View style={{ marginTop: 24 }}><Text style={styles.muted}>Authorized Signature</Text><Text style={{ marginTop: 18 }}>______________________</Text></View>
        </View>

        {payment.allocations.length ? (
          <View style={styles.card}>
            <Text style={{ fontWeight: 700, marginBottom: 6 }}>Payment for</Text>
            {payment.allocations.map((a, i) => (
              <View key={i} style={styles.row}><Text>{a.invoiceNumber}</Text><Text>{money(a.amount)}</Text></View>
            ))}
            {payment.unused > 0 ? <View style={[styles.row, { marginTop: 6 }]}><Text style={styles.muted}>Amount in Excess</Text><Text>{money(payment.unused)}</Text></View> : null}
          </View>
        ) : payment.unused > 0 ? (
          <View style={styles.card}><View style={styles.row}><Text style={styles.muted}>Amount in Excess (advance)</Text><Text>{money(payment.unused)}</Text></View></View>
        ) : null}
      </Page>
    </Document>
  );
}
