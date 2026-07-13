import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { BillPdfData } from "@/lib/bill-pdf";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  row: { flexDirection: "row" },
  spaceBetween: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
  company: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  section: { marginTop: 16 },
  label: { color: "#6b7280", width: 90 },
  thead: { flexDirection: "row", backgroundColor: "#111827", color: "#ffffff", paddingVertical: 5, paddingHorizontal: 6, marginTop: 14 },
  trow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  cDesc: { flex: 1 },
  cNum: { width: 70, textAlign: "right" },
  totalsBox: { marginTop: 12, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1, borderTopColor: "#111827", marginTop: 3, fontFamily: "Helvetica-Bold" }
});

function money(currency: string, n: number) {
  return `${currency} ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BillPDFTemplate({ bill }: { bill: BillPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.spaceBetween}>
          <View>
            <Text style={styles.company}>{bill.companyName}</Text>
            {bill.companyAddress.map((l, i) => <Text key={i} style={styles.muted}>{l}</Text>)}
            {bill.companyGstin ? <Text style={styles.muted}>GSTIN: {bill.companyGstin}</Text> : null}
            {bill.companyEmail ? <Text style={styles.muted}>{bill.companyEmail}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>BILL</Text>
            <Text style={{ textAlign: "right", marginTop: 4 }}>Bill# {bill.billNumber}</Text>
            <Text style={{ textAlign: "right", marginTop: 8, ...styles.muted }}>Balance Due</Text>
            <Text style={{ textAlign: "right", fontFamily: "Helvetica-Bold" }}>{money(bill.currency, bill.balanceDue)}</Text>
          </View>
        </View>

        <View style={[styles.section, styles.spaceBetween]}>
          <View>
            <Text style={styles.muted}>Bill From</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{bill.vendorName}</Text>
            {bill.vendorAddress.map((l, i) => <Text key={i} style={styles.muted}>{l}</Text>)}
          </View>
          <View style={{ width: 220 }}>
            {bill.orderNumber ? <View style={styles.row}><Text style={styles.label}>Order Number :</Text><Text>{bill.orderNumber}</Text></View> : null}
            <View style={styles.row}><Text style={styles.label}>Bill Date :</Text><Text>{bill.issueDate}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Due Date :</Text><Text>{bill.dueDate}</Text></View>
            {bill.paymentTerms ? <View style={styles.row}><Text style={styles.label}>Terms :</Text><Text>{bill.paymentTerms}</Text></View> : null}
            {bill.reference ? <View style={styles.row}><Text style={styles.label}>Reference :</Text><Text>{bill.reference}</Text></View> : null}
          </View>
        </View>

        <View style={styles.thead}>
          <Text style={{ width: 18 }}>#</Text>
          <Text style={styles.cDesc}>Item &amp; Description</Text>
          <Text style={styles.cNum}>Qty</Text>
          <Text style={styles.cNum}>Rate</Text>
          <Text style={styles.cNum}>Amount</Text>
        </View>
        {bill.lineItems.map((l, i) => (
          <View key={i} style={styles.trow}>
            <Text style={{ width: 18 }}>{i + 1}</Text>
            <Text style={styles.cDesc}>{l.description}</Text>
            <Text style={styles.cNum}>{l.quantity}</Text>
            <Text style={styles.cNum}>{l.rate.toFixed(2)}</Text>
            <Text style={styles.cNum}>{l.lineTotal.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}><Text style={styles.muted}>Sub Total</Text><Text>{money(bill.currency, bill.subtotal)}</Text></View>
          {bill.discountTotal ? <View style={styles.totalRow}><Text style={styles.muted}>Discount</Text><Text>-{money(bill.currency, bill.discountTotal)}</Text></View> : null}
          {bill.taxTotal ? <View style={styles.totalRow}><Text style={styles.muted}>Tax</Text><Text>{money(bill.currency, bill.taxTotal)}</Text></View> : null}
          <View style={styles.grandRow}><Text>Total</Text><Text>{money(bill.currency, bill.total)}</Text></View>
          {bill.paymentsMade ? <View style={styles.totalRow}><Text style={styles.muted}>Payments Made</Text><Text>-{money(bill.currency, bill.paymentsMade)}</Text></View> : null}
          <View style={styles.grandRow}><Text>Balance Due</Text><Text>{money(bill.currency, bill.balanceDue)}</Text></View>
        </View>

        {bill.notes ? <View style={styles.section}><Text style={styles.muted}>Notes</Text><Text>{bill.notes}</Text></View> : null}
        <View style={{ marginTop: 40 }}><Text style={styles.muted}>Authorized Signature ______________________</Text></View>
      </Page>
    </Document>
  );
}
