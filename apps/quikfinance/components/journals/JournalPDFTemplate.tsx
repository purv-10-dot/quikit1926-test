import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { JournalPdfData } from "@/lib/journal-pdf";
import { registerPdfFonts, PDF_FONT } from "@/lib/pdf-fonts";

registerPdfFonts();

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#172033", fontFamily: PDF_FONT },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  brand: { fontSize: 20, fontWeight: 700, color: "#4F46E5" },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", color: "#0F172A" },
  card: { border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, marginBottom: 14 },
  muted: { color: "#475569" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  tableHeader: { flexDirection: "row", backgroundColor: "#1F2937", color: "#FFFFFF", padding: 8, fontWeight: 700 },
  tableRow: { flexDirection: "row", padding: 8, borderBottom: "1px solid #E2E8F0" },
  totalRow: { flexDirection: "row", padding: 8, fontWeight: 700, backgroundColor: "#F8FAFC" },
  colAccount: { flex: 2.4 },
  colContact: { flex: 1.4 },
  colDebit: { flex: 1, textAlign: "right" },
  colCredit: { flex: 1, textAlign: "right" }
});

const LOCALE_BY_CURRENCY: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB", AUD: "en-AU", CAD: "en-CA", JPY: "ja-JP" };
function makeMoney(currency: string) {
  const code = currency && currency.length === 3 ? currency.toUpperCase() : "INR";
  return (value: number) => new Intl.NumberFormat(LOCALE_BY_CURRENCY[code] ?? "en-IN", { style: "currency", currency: code }).format(value);
}

export function JournalPDFTemplate({ journal }: { journal: JournalPdfData }) {
  const money = makeMoney(journal.currency);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ maxWidth: "60%" }}>
            <Text style={styles.brand}>{journal.companyName}</Text>
            {journal.companyAddress.map((line) => <Text key={line} style={styles.muted}>{line}</Text>)}
            {journal.companyGstin ? <Text style={styles.muted}>GSTIN: {journal.companyGstin}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "40%" }}>
            <Text style={{ fontSize: 20, fontWeight: 700 }}>Journal</Text>
            <Text>Journal# {journal.journalNumber}</Text>
            <Text>Date: {journal.journalDate}</Text>
            <Text style={styles.muted}>{journal.status}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.metaRow}><Text style={styles.muted}>Reference#</Text><Text>{journal.referenceNumber || "—"}</Text></View>
          <View style={styles.metaRow}><Text style={styles.muted}>Reporting Method</Text><Text>{journal.reportingMethod}</Text></View>
          <View style={styles.metaRow}><Text style={styles.muted}>Currency</Text><Text>{journal.currency}</Text></View>
          {journal.notes ? <View style={styles.metaRow}><Text style={styles.muted}>Notes</Text><Text style={{ maxWidth: "70%", textAlign: "right" }}>{journal.notes}</Text></View> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.tableHeader}>
            <Text style={styles.colAccount}>Account</Text>
            <Text style={styles.colContact}>Contact</Text>
            <Text style={styles.colDebit}>Debit</Text>
            <Text style={styles.colCredit}>Credit</Text>
          </View>
          {journal.lines.map((line, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colAccount}>
                <Text>{line.account}</Text>
                {line.description ? <Text style={styles.muted}>{line.description}</Text> : null}
              </View>
              <Text style={styles.colContact}>{line.contact || "—"}</Text>
              <Text style={styles.colDebit}>{line.debit ? money(line.debit) : "—"}</Text>
              <Text style={styles.colCredit}>{line.credit ? money(line.credit) : "—"}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.colAccount}>Total</Text>
            <Text style={styles.colContact} />
            <Text style={styles.colDebit}>{money(journal.subtotalDebit)}</Text>
            <Text style={styles.colCredit}>{money(journal.subtotalCredit)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
