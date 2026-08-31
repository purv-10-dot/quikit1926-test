/**
 * Shared react-pdf styles and primitives for the Meeting Rhythm report PDFs.
 *
 * WHY THIS EXISTS
 * ---------------
 * Five documents (daily, DH weekly, weekly meeting, week rollup, monthly) are
 * downloaded side by side and, since the bulk export, arrive in the SAME zip.
 * Five private stylesheets would drift into five different-looking reports from
 * one product. The stylesheet here is the one `WeeklyReportPdfDoc` already used,
 * moved rather than rewritten, so nothing about that document changed when the
 * others adopted it.
 *
 * DELIBERATELY NOT A CLIENT MODULE. These components render in two places: the
 * browser (a panel's `.pdf` button, via `pdf(...).toBlob()`) and the server (the
 * bulk export, via `renderToBuffer`). A `"use client"` directive here would bar
 * the second. Nothing in this file touches a hook, `window`, or `document`.
 *
 * FONT CONSTRAINT - READ BEFORE ADDING A GLYPH
 * --------------------------------------------
 * react-pdf's built-in Helvetica is a standard PDF font limited to the WinAnsi
 * character set. Anything outside it is dropped SILENTLY: that is how the
 * on-screen tick / half / cross marks once turned an attendance table into a
 * grid of blank cells while "NA" and the dash (both WinAnsi) still printed. Use
 * letters plus a legend. Do not introduce Unicode symbols here without
 * registering an embedded font that actually carries them.
 */
import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export const pdfStyles = StyleSheet.create({
  page: { paddingHorizontal: 28, paddingVertical: 26, fontFamily: "Helvetica", fontSize: 9, color: "#1F2937" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#0F766E",
    paddingBottom: 8,
    marginBottom: 10,
  },
  orgName: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#0F766E" },
  orgTagline: { fontSize: 7, fontStyle: "italic", color: "#64748B", marginTop: 1 },
  titleBlock: { alignItems: "flex-end" },
  reportTitle: { fontFamily: "Helvetica-Bold", fontSize: 14, color: "#111827" },
  reportSub: { fontSize: 8, color: "#64748B", marginTop: 1 },

  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#0F172A", marginTop: 12, marginBottom: 5 },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#334155", marginTop: 8, marginBottom: 4 },
  note: { fontSize: 7, fontStyle: "italic", color: "#64748B", marginTop: 3 },
  warn: { fontSize: 7, fontStyle: "italic", color: "#B45309", marginTop: 3 },
  body: { fontSize: 8, lineHeight: 1.4 },

  /** Draft stamp. A report nobody signed off must say so on its face. */
  draft: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    padding: 5,
    marginBottom: 8,
  },
  alert: {
    backgroundColor: "#FEE2E2",
    color: "#991B1B",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    padding: 5,
    marginTop: 8,
    marginBottom: 4,
  },

  detailsTable: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3 },
  detailsRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  detailsLabel: { width: 160, backgroundColor: "#F8FAFC", padding: 5, fontFamily: "Helvetica-Bold", fontSize: 8, color: "#334155" },
  detailsValue: { flex: 1, padding: 5, fontSize: 8 },

  tilesRow: { flexDirection: "row", gap: 6 },
  tile: { flex: 1, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, paddingVertical: 6, alignItems: "center" },
  tileValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#111827" },
  tileLabel: { fontSize: 6.5, color: "#64748B", marginTop: 1, textAlign: "center" },

  table: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, marginTop: 4 },
  tHead: { flexDirection: "row", backgroundColor: "#EFF6FF" },
  th: { padding: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#1E3A8A" },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  tTotal: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  td: { padding: 5, fontSize: 8 },
  tdCenter: { padding: 5, fontSize: 8, textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },

  bullet: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 10, fontSize: 8 },
  bulletText: { flex: 1, fontSize: 8, lineHeight: 1.35 },

  obsRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  obsLabel: { width: 120, backgroundColor: "#F8FAFC", padding: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#334155" },
  obsText: { flex: 1, padding: 5, fontSize: 8, lineHeight: 1.35 },

  footer: { position: "absolute", bottom: 16, left: 28, right: 28, textAlign: "center", fontSize: 7, fontStyle: "italic", color: "#94A3B8" },
});

/** RAG colours, matching the on-screen badges. */
export const RAG_COLOR: Record<string, string> = {
  RED: "#B91C1C",
  AMBER: "#B45309",
  YELLOW: "#B45309",
  GREEN: "#166534",
  BLUE: "#1D4ED8",
  GREY: "#64748B",
  GRAY: "#64748B",
  NA: "#94A3B8",
};

/** A dash for a missing number, never `0` - an absent figure is not a zero one. */
export const pct = (n: number | null | undefined): string =>
  n === null || n === undefined ? "-" : `${Math.round(n * 10) / 10}%`;

export const num = (n: number | null | undefined): string =>
  n === null || n === undefined ? "-" : String(n);

export const dash = (s: string | null | undefined): string => (s && s.trim() ? s : "-");

/** Turns SCREAMING_SNAKE stored enums into prose without a lookup table. */
export const humanize = (value: string | null | undefined): string =>
  !value ? "-" : value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/**
 * `averageAttendancePct` becomes `Average attendance %`.
 *
 * Trend rows carry the machine key, not a display name, and the docx builder
 * derives its label from the first four words of the AI summary - fine in prose,
 * wrong in a table column. Deriving from the key keeps the label stable no
 * matter what the model wrote.
 */
export const metricLabel = (metric: string): string => {
  const words = metric
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ")
    // Whole words only: `pct` is a unit, but a metric named `pctile` is not one.
    .map((w) => (w === "pct" ? "%" : w === "www" ? "WWW" : w));
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
};

/** Loose rows carry `unknown`; render a string or nothing. */
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function ReportHeader({
  orgName,
  title,
  subtitle,
}: {
  orgName: string;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <View style={pdfStyles.header}>
      <View>
        <Text style={pdfStyles.orgName}>{orgName || "QuikScale"}</Text>
        <Text style={pdfStyles.orgTagline}>Performance OS - Meeting Rhythm</Text>
      </View>
      <View style={pdfStyles.titleBlock}>
        <Text style={pdfStyles.reportTitle}>{title}</Text>
        {subtitle ? <Text style={pdfStyles.reportSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** The page footer every report shares. `fixed` so it repeats on every page. */
export function ReportFooter({ label }: { label: string }) {
  return (
    <Text
      fixed
      style={pdfStyles.footer}
      render={({ pageNumber, totalPages }) => `${label} - Page ${pageNumber} of ${totalPages}`}
    />
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={pdfStyles.h2}>{children}</Text>;
}

export function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={pdfStyles.bullet}>
          <Text style={pdfStyles.bulletDot}>-</Text>
          <Text style={pdfStyles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function DetailsTable({ rows }: { rows: [string, string][] }) {
  return (
    <View style={pdfStyles.detailsTable}>
      {rows.map(([label, value], i) => (
        <View key={i} style={pdfStyles.detailsRow}>
          <Text style={pdfStyles.detailsLabel}>{label}</Text>
          <Text style={pdfStyles.detailsValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function Tiles({ tiles }: { tiles: { value: string; label: string }[] }) {
  return (
    <View style={pdfStyles.tilesRow}>
      {tiles.map((t, i) => (
        <View key={i} style={pdfStyles.tile}>
          <Text style={pdfStyles.tileValue}>{t.value}</Text>
          <Text style={pdfStyles.tileLabel}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

export interface Column<Row> {
  header: string;
  /** Fixed width in points, or a flex weight when omitted. */
  width?: number;
  flex?: number;
  align?: "left" | "center";
  cell: (row: Row) => string;
  color?: (row: Row) => string | undefined;
}

/**
 * A table, or an honest note in its place.
 *
 * `emptyNote` is required rather than optional: a section with no rows must say
 * why it is empty. A silently missing table reads as "nothing happened", which
 * is a different claim from "nothing was recorded".
 */
export function DataTable<Row>({
  columns,
  rows,
  emptyNote,
}: {
  columns: Column<Row>[];
  rows: Row[];
  emptyNote: string;
}) {
  if (rows.length === 0) return <Text style={pdfStyles.note}>{emptyNote}</Text>;

  const sizing = (c: Column<Row>) => (c.width ? { width: c.width } : { flex: c.flex ?? 1 });

  return (
    <View style={pdfStyles.table}>
      <View style={pdfStyles.tHead}>
        {columns.map((c, i) => (
          <Text
            key={i}
            style={[pdfStyles.th, sizing(c), c.align === "center" ? { textAlign: "center" } : {}]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={pdfStyles.tRow} wrap={false}>
          {columns.map((c, i) => (
            <Text
              key={i}
              style={[
                c.align === "center" ? pdfStyles.tdCenter : pdfStyles.td,
                sizing(c),
                c.color?.(row) ? { color: c.color(row) as string } : {},
              ]}
            >
              {c.cell(row)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The standard A4 page, with the draft stamp and footer already wired. */
export function ReportPage({
  orgName,
  title,
  subtitle,
  validated,
  footerLabel,
  children,
}: {
  orgName: string;
  title: string;
  subtitle?: string | null;
  validated: boolean;
  footerLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={pdfStyles.page}>
      <ReportHeader orgName={orgName} title={title} subtitle={subtitle} />
      {!validated ? (
        <Text style={pdfStyles.draft}>DRAFT - not yet reviewed by the facilitator.</Text>
      ) : null}
      {children}
      <ReportFooter label={footerLabel} />
    </Page>
  );
}
