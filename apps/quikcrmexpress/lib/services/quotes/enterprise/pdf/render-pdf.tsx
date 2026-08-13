import { Document, Image, Page, StyleSheet, Text, View, Font } from "@react-pdf/renderer";
import type { QuotePrintPayload } from "./types";

Font.registerHyphenationCallback((word: string) => [word]);

const COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F9FAFB",
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    color: COLORS.text,
    fontSize: 10,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 34,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  companyBlock: { width: "58%" },
  titleBlock: { width: "42%", alignItems: "flex-end" },
  companyName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  muted: { color: COLORS.muted },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold" },
  pill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
    color: "#3730A3",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  sectionRow: { marginTop: 16, flexDirection: "row" },
  sectionCol: { flexGrow: 1, marginRight: 14 },
  sectionColLast: { flexGrow: 1 },
  section: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
  },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: 0.7,
    color: COLORS.muted,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  table: { marginTop: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10 },
  trHead: { flexDirection: "row", backgroundColor: "#EFF6FF", borderBottomWidth: 1, borderBottomColor: "#BFDBFE" },
  th: { paddingVertical: 8, paddingHorizontal: 8, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1E40AF" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  td: { paddingVertical: 8, paddingHorizontal: 8, fontSize: 9 },
  right: { textAlign: "right" },
  totalsWrap: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end" },
  totals: { width: 260, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, backgroundColor: COLORS.bg },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsStrong: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  totalsValueStrong: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  terms: { marginTop: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10 },
  footer: { position: "absolute", left: 34, right: 34, bottom: 18, flexDirection: "row", justifyContent: "space-between" },
  watermark: { position: "absolute", top: 300, left: 80, opacity: 0.06, transform: "rotate(-25deg)" },
});

function fmtINR(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(d);
  }
}

export function QuotePdfDocument({ payload }: { payload: QuotePrintPayload }) {
  const { quote, company, account, contact, template, lines, totals, isIntraState } = payload;
  const theme = template?.themeColor ?? "#1D4ED8";
  const watermark = quote.watermarkText ?? template?.watermarkText ?? null;
  const contactName = contact ? `${contact.firstName} ${contact.lastName ?? ""}`.trim() : null;

  return (
    <Document title={quote.quoteNumber}>
      <Page size="A4" style={s.page}>
        {watermark ? (
          <View style={s.watermark}>
            <Text style={{ fontSize: 48, color: theme, fontFamily: "Helvetica-Bold" }}>{watermark}</Text>
          </View>
        ) : null}

        <View style={s.headerRow}>
          <View style={s.companyBlock}>
            {company.logoUrl ? (
              <Image src={company.logoUrl} style={{ height: 34, width: 140, objectFit: "contain", marginBottom: 8 }} />
            ) : null}
            <Text style={s.companyName}>{company.companyName}</Text>
            <Text style={[s.muted, { fontSize: 9, marginTop: 2 }]}>
              {[company.website, company.phone].filter(Boolean).join(" • ")}
            </Text>
          </View>

          <View style={s.titleBlock}>
            <Text style={[s.title, { color: theme }]}>QUOTATION</Text>
            <Text style={{ marginTop: 6, fontSize: 10 }}>
              <Text style={s.muted}>Quote # </Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{quote.quoteNumber}</Text>
              <Text style={s.muted}> (v{quote.versionNumber})</Text>
            </Text>
            <Text style={{ marginTop: 2, fontSize: 9 }}>
              <Text style={s.muted}>Date: </Text>
              {fmtDate(quote.effectiveFrom)}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 9 }}>
              <Text style={s.muted}>Valid until: </Text>
              {fmtDate(quote.effectiveTo)}
            </Text>
            <Text style={[s.pill, { backgroundColor: "#EFF6FF", color: theme }]}>{quote.status}</Text>
          </View>
        </View>

        <View style={s.sectionRow}>
          <View style={[s.section, s.sectionCol]}>
            <Text style={s.sectionTitle}>Bill To</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{account?.name ?? "—"}</Text>
            {contactName ? <Text>{contactName}</Text> : null}
            {contact?.email ? <Text style={s.muted}>{contact.email}</Text> : null}
          </View>
          <View style={[s.section, s.sectionColLast]}>
            <Text style={s.sectionTitle}>Prepared By</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{quote.ownerName ?? "—"}</Text>
            <Text style={s.muted}>
              GST mode: {isIntraState ? "CGST + SGST" : "IGST"}
            </Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, { width: "6%" }]}>#</Text>
            <Text style={[s.th, { width: "34%" }]}>Item</Text>
            <Text style={[s.th, s.right, { width: "10%" }]}>Qty</Text>
            <Text style={[s.th, s.right, { width: "12%" }]}>Rate</Text>
            <Text style={[s.th, s.right, { width: "8%" }]}>Disc%</Text>
            <Text style={[s.th, s.right, { width: "12%" }]}>Taxable</Text>
            <Text style={[s.th, s.right, { width: "6%" }]}>GST</Text>
            <Text style={[s.th, s.right, { width: "12%" }]}>Total</Text>
          </View>

          {lines.length === 0 ? (
            <View style={s.tr}>
              <Text style={[s.td, s.muted, { width: "100%", textAlign: "center", paddingVertical: 16 }]}>
                No line items
              </Text>
            </View>
          ) : (
            lines.map((l, idx) => (
              <View key={`${l.lineNumber}-${idx}`} style={s.tr}>
                <Text style={[s.td, { width: "6%" }]}>{l.lineNumber}</Text>
                <View style={{ width: "34%", paddingVertical: 8, paddingHorizontal: 8 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>{l.productName}</Text>
                  {l.sku ? <Text style={[s.muted, { fontSize: 8 }]}>SKU: {l.sku}</Text> : null}
                  {l.hsnCode ? <Text style={[s.muted, { fontSize: 8 }]}>HSN: {l.hsnCode}</Text> : null}
                </View>
                <Text style={[s.td, s.right, { width: "10%" }]}>{l.quantity}</Text>
                <Text style={[s.td, s.right, { width: "12%" }]}>{fmtINR(l.unitPrice)}</Text>
                <Text style={[s.td, s.right, { width: "8%" }]}>{l.discountPct > 0 ? `${l.discountPct}%` : "—"}</Text>
                <Text style={[s.td, s.right, { width: "12%" }]}>{fmtINR(l.taxableAmount)}</Text>
                <Text style={[s.td, s.right, { width: "6%" }]}>{l.gstRate}%</Text>
                <Text style={[s.td, s.right, { width: "12%", fontFamily: "Helvetica-Bold" }]}>{fmtINR(l.lineTotal)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={s.totalsWrap}>
          <View style={s.totals}>
            <View style={s.totalsRow}>
              <Text style={s.muted}>Subtotal</Text>
              <Text>₹ {fmtINR(totals.subtotal)}</Text>
            </View>
            {totals.totalLineDiscount > 0 ? (
              <View style={s.totalsRow}>
                <Text style={s.muted}>Line discount</Text>
                <Text>− ₹ {fmtINR(totals.totalLineDiscount)}</Text>
              </View>
            ) : null}
            {totals.overallDiscountAmount > 0 ? (
              <View style={s.totalsRow}>
                <Text style={s.muted}>Overall discount</Text>
                <Text>− ₹ {fmtINR(totals.overallDiscountAmount)}</Text>
              </View>
            ) : null}
            <View style={s.totalsRow}>
              <Text style={s.muted}>Taxable</Text>
              <Text>₹ {fmtINR(totals.taxableAmount)}</Text>
            </View>
            {isIntraState ? (
              <>
                <View style={s.totalsRow}>
                  <Text style={s.muted}>CGST</Text>
                  <Text>₹ {fmtINR(totals.cgstAmount)}</Text>
                </View>
                <View style={s.totalsRow}>
                  <Text style={s.muted}>SGST</Text>
                  <Text>₹ {fmtINR(totals.sgstAmount)}</Text>
                </View>
              </>
            ) : (
              <View style={s.totalsRow}>
                <Text style={s.muted}>IGST</Text>
                <Text>₹ {fmtINR(totals.igstAmount)}</Text>
              </View>
            )}
            {totals.freightAmount > 0 ? (
              <View style={s.totalsRow}>
                <Text style={s.muted}>Freight</Text>
                <Text>₹ {fmtINR(totals.freightAmount)}</Text>
              </View>
            ) : null}
            <View style={[s.totalsRow, s.totalsStrong]}>
              <Text style={s.totalsValueStrong}>Grand total</Text>
              <Text style={s.totalsValueStrong}>₹ {fmtINR(totals.grandTotal)}</Text>
            </View>
            {quote.grandTotalInWords ? (
              <Text style={[s.muted, { fontSize: 8, marginTop: 6 }]}>
                {quote.grandTotalInWords}
              </Text>
            ) : null}
          </View>
        </View>

        {(quote.termsText || template?.termsDefault) ? (
          <View style={s.terms}>
            <Text style={s.sectionTitle}>Terms & Conditions</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.4 }}>
              {quote.termsText ?? template?.termsDefault ?? ""}
            </Text>
          </View>
        ) : null}

        <View style={s.footer}>
          <Text style={[s.muted, { fontSize: 8 }]}>{quote.quoteNumber} • v{quote.versionNumber}</Text>
          <Text style={[s.muted, { fontSize: 8 }]}>Authorized signature</Text>
        </View>
      </Page>
    </Document>
  );
}

