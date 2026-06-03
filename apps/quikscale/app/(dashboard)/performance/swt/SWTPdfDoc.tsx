"use client";

/**
 * Scaling Up SWT Worksheet — REAL PDF document (react-pdf).
 *
 * Pixel-perfect text rendering (no bitmap capture, no halos, no edge cropping).
 * Used by SWTPreview for both in-modal viewing (<PDFViewer>) and the one-click
 * download (`pdf()` programmatic API).
 */

import {
  Document, Page, View, Text, StyleSheet,
} from "@react-pdf/renderer";

export interface SWTEntry {
  id: string;
  type: "strength" | "weakness" | "trend";
  content: string;
  impact: string | null;
  category: string | null;
  trendDirection: string | null;
}

const SECTION = {
  trend:    { headerBg: "#DBEAFE", title: "#1E40AF", dot: "#3B82F6", bodyBg: "#EFF6FF", border: "#BFDBFE", label: "Trends" },
  strength: { headerBg: "#DCFCE7", title: "#166534", dot: "#22C55E", bodyBg: "#F0FDF4", border: "#BBF7D0", label: "Strengths" },
  weakness: { headerBg: "#FEE2E2", title: "#991B1B", dot: "#EF4444", bodyBg: "#FEF2F2", border: "#FECACA", label: "Weaknesses" },
} as const;

const CATEGORY: Record<string, { label: string; bg: string; text: string }> = {
  technology:   { label: "Technology",         bg: "#E0E7FF", text: "#4338CA" },
  distribution: { label: "Distribution",       bg: "#CCFBF1", text: "#0F766E" },
  product:      { label: "Product Innovation", bg: "#F3E8FF", text: "#7E22CE" },
  markets:      { label: "Markets",            bg: "#DBEAFE", text: "#1E40AF" },
  consumer:     { label: "Consumer",           bg: "#FEF3C7", text: "#92400E" },
  social:       { label: "Social",             bg: "#FFE4E6", text: "#9F1239" },
};

const DIRECTION: Record<string, { label: string; bg: string; text: string }> = {
  positive: { label: "Positive", bg: "#DCFCE7", text: "#166534" },
  negative: { label: "Negative", bg: "#FEE2E2", text: "#991B1B" },
  neutral:  { label: "Neutral",  bg: "#F3F4F6", text: "#4B5563" },
};

const QUESTION = {
  trend:    "What are the significant changes in technology, distribution, product innovation, markets, consumer, and social trends around the world that might impact your industry and organization?",
  strength: "What are the inherent strengths of the organization that have been the source of your success?",
  weakness: "What are the inherent weaknesses of the organization that aren't likely to change?",
} as const;

const styles = StyleSheet.create({
  page: { paddingHorizontal: 24, paddingVertical: 24, fontFamily: "Helvetica", fontSize: 10, color: "#1F2937", backgroundColor: "#ffffff" },
  banner: { backgroundColor: "#2563EB", color: "#FFFFFF", paddingHorizontal: 18, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 4 },
  bannerLeft: { flexDirection: "row", alignItems: "baseline", flex: 1 },
  bannerStrategy: { fontFamily: "Helvetica-Bold", fontSize: 14, marginRight: 6 },
  bannerTitle: { fontSize: 13 },
  bannerOrg: { fontFamily: "Helvetica-Bold", fontSize: 12, maxWidth: 200 },

  sectionWrap: { borderWidth: 1, borderRadius: 6, marginTop: 10, overflow: "hidden" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 10, paddingVertical: 6 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  sectionCount: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  sectionQuestion: { fontStyle: "italic", fontSize: 8, color: "#475569", paddingHorizontal: 10, paddingBottom: 6, lineHeight: 1.35 },

  body: { paddingHorizontal: 8, paddingVertical: 8 },

  entryCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 5, flexDirection: "row", alignItems: "flex-start" },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 4, marginRight: 6 },
  entryBody: { flex: 1 },
  entryTitle: { fontFamily: "Helvetica-Bold", fontSize: 10, color: "#1F2937", lineHeight: 1.35 },
  entryImpact: { fontStyle: "italic", fontSize: 9, color: "#475569", marginTop: 2, lineHeight: 1.35 },
  badgeRow: { flexDirection: "row", marginTop: 4, flexWrap: "wrap" },
  badge: { fontFamily: "Helvetica-Bold", fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginRight: 5, marginBottom: 2 },

  twoCol: { flexDirection: "row", marginTop: 10, gap: 10 },
  col: { flex: 1 },

  emptyEntry: { fontStyle: "italic", fontSize: 9, color: "#94A3B8", paddingVertical: 6, paddingHorizontal: 4 },

  footer: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#E5E7EB", fontSize: 8, color: "#94A3B8" },
});

function Section({
  type, items, orgName: _o,
}: {
  type: "trend" | "strength" | "weakness";
  items: SWTEntry[];
  orgName?: string;
}) {
  const s = SECTION[type];
  return (
    <View style={[styles.sectionWrap, { borderColor: s.border, backgroundColor: s.bodyBg }]}>
      <View style={[styles.sectionHeader, { backgroundColor: s.headerBg }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: s.title }]}>{s.label}</Text>
        </View>
        <Text style={[styles.sectionCount, { color: s.title }]}>{items.length}</Text>
      </View>
      <Text style={[styles.sectionQuestion, { backgroundColor: s.headerBg }]}>{QUESTION[type]}</Text>
      <View style={styles.body}>
        {items.length === 0 && <Text style={styles.emptyEntry}>No entries.</Text>}
        {items.map((it) => (
          <Entry key={it.id} entry={it} dotColor={s.dot} />
        ))}
      </View>
    </View>
  );
}

function Entry({ entry, dotColor }: { entry: SWTEntry; dotColor: string }) {
  const cat = entry.category ? CATEGORY[entry.category] : null;
  const dir = entry.trendDirection ? DIRECTION[entry.trendDirection] : null;
  return (
    <View style={styles.entryCard}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.entryBody}>
        <Text style={styles.entryTitle}>{entry.content}</Text>
        {entry.impact ? <Text style={styles.entryImpact}>{entry.impact}</Text> : null}
        {(cat || dir) && (
          <View style={styles.badgeRow}>
            {cat && (
              <Text style={[styles.badge, { backgroundColor: cat.bg, color: cat.text }]}>{cat.label}</Text>
            )}
            {dir && (
              <Text style={[styles.badge, { backgroundColor: dir.bg, color: dir.text }]}>{dir.label}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function SWTPdfDoc({
  entries, quarter, year, orgName,
}: {
  entries: SWTEntry[];
  quarter: string;
  year: number;
  orgName: string;
}) {
  const trends     = entries.filter((e) => e.type === "trend");
  const strengths  = entries.filter((e) => e.type === "strength");
  const weaknesses = entries.filter((e) => e.type === "weakness");
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Blue Strategy banner */}
        <View style={styles.banner}>
          <View style={styles.bannerLeft}>
            <Text style={styles.bannerStrategy}>Strategy:</Text>
            <Text style={styles.bannerTitle}>Strengths, Weaknesses, Trends (SWT) Worksheet</Text>
          </View>
          <Text style={styles.bannerOrg}>{orgName || "Your Organisation"}</Text>
        </View>

        {/* Trends full width */}
        <Section type="trend" items={trends} />

        {/* Strengths + Weaknesses two columns */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Section type="strength" items={strengths} />
          </View>
          <View style={styles.col}>
            <Section type="weakness" items={weaknesses} />
          </View>
        </View>

        <View style={styles.footer}>
          <Text>{quarter} {year}</Text>
          <Text>{orgName || ""}</Text>
        </View>
      </Page>
    </Document>
  );
}
