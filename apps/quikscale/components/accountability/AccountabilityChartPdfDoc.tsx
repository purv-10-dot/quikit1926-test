"use client";

/**
 * Scaling Up FACe / PACe Accountability Chart — REAL PDF document (react-pdf).
 *
 * Pixel-perfect text rendering. Used by AccountabilityChartPreview for both
 * in-modal viewing (<PDFViewer>) and one-click download (`pdf()` API).
 */

import {
  Document, Page, View, Text, StyleSheet,
} from "@react-pdf/renderer";

export interface FunctionRow {
  id: string;
  name: string;
  description: string | null;
  leadingIndicators: string | null;
  expectedOutcomes: string | null;
  assignedToUserId: string | null;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  childFunctions: FunctionRow[];
}

const HEADERS = {
  face: { title: "People: Function Accountability Chart (FACe)", listLabel: "Functions" },
  pace: { title: "People: Process Accountability Chart (PACe)", listLabel: "Processes" },
} as const;

const COL_W = { fn: "30%", person: "22%", leading: "24%", outcomes: "24%" } as const;

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingVertical: 20, fontFamily: "Helvetica", fontSize: 10, color: "#1F2937", backgroundColor: "#ffffff" },

  outer: { borderWidth: 2, borderColor: "#F59E0B", borderRadius: 4, overflow: "hidden" },

  banner: { backgroundColor: "#F59E0B", color: "#FFFFFF", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bannerTitle: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  bannerOrg: { fontFamily: "Helvetica-Bold", fontSize: 11, maxWidth: 200 },

  tableWrap: { padding: 10 },

  headRow: { flexDirection: "row", backgroundColor: "#475569" },
  headCell: { color: "#FFFFFF", fontFamily: "Helvetica-Bold", fontSize: 9, paddingHorizontal: 6, paddingVertical: 6, borderRightWidth: 1, borderRightColor: "#94A3B8" },
  headSub: { color: "#FFFFFF", opacity: 0.85, fontSize: 7, marginTop: 1 },

  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E5E7EB", borderLeftWidth: 1, borderLeftColor: "#E5E7EB", borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  rowLast: { borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },

  cell: { paddingHorizontal: 6, paddingVertical: 6, borderRightWidth: 1, borderRightColor: "#E5E7EB" },
  cellLast: { borderRightWidth: 0 },

  fnName: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1F2937" },
  fnSub: { fontSize: 9, color: "#374151" },

  personRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#EEF2FF", color: "#4F46E5", textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 7, paddingTop: 4, marginRight: 5 },
  personName: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1F2937", flex: 1 },
  emptySeat: { fontSize: 9, color: "#CBD5E1" },

  bullet: { color: "#94A3B8", marginRight: 4 },
});

function initials(first?: string, last?: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function splitLines(s: string | null): string {
  return (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean).join(", ");
}

function PersonCell({ fn }: { fn: FunctionRow }) {
  if (!fn.assignedTo) {
    return <Text style={styles.emptySeat}>—</Text>;
  }
  const fullName = `${fn.assignedTo.firstName} ${fn.assignedTo.lastName}`.trim();
  const init = initials(fn.assignedTo.firstName, fn.assignedTo.lastName);
  return (
    <View style={styles.personRow}>
      <Text style={styles.avatar}>{init}</Text>
      <Text style={styles.personName}>{fullName}</Text>
    </View>
  );
}

function FunctionRowView({ fn, indent, isLast }: { fn: FunctionRow; indent: boolean; isLast: boolean }) {
  return (
    <View style={[styles.row, isLast ? styles.rowLast : {}]} wrap={false}>
      <View style={[styles.cell, { width: COL_W.fn, paddingLeft: indent ? 18 : 6 }]}>
        <Text style={indent ? styles.fnSub : styles.fnName}>
          {indent ? <Text style={styles.bullet}>•  </Text> : null}{fn.name}
        </Text>
      </View>
      <View style={[styles.cell, { width: COL_W.person }]}>
        <PersonCell fn={fn} />
      </View>
      <View style={[styles.cell, { width: COL_W.leading }]}>
        <Text>{splitLines(fn.leadingIndicators) || " "}</Text>
      </View>
      <View style={[styles.cell, styles.cellLast, { width: COL_W.outcomes }]}>
        <Text>{splitLines(fn.expectedOutcomes) || " "}</Text>
      </View>
    </View>
  );
}

export default function AccountabilityChartPdfDoc({
  chartType,
  functions,
  orgName,
}: {
  chartType: "face" | "pace";
  functions: FunctionRow[];
  orgName: string;
}) {
  const H = HEADERS[chartType];
  // Flatten parent + children into a row sequence so we know the last row.
  const flatRows: { fn: FunctionRow; indent: boolean }[] = [];
  for (const fn of functions) {
    flatRows.push({ fn, indent: false });
    for (const sub of fn.childFunctions ?? []) {
      flatRows.push({ fn: sub, indent: true });
    }
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.outer}>
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>{H.title}</Text>
            <Text style={styles.bannerOrg}>{orgName || "Your Organisation"}</Text>
          </View>

          <View style={styles.tableWrap}>
            {/* Header row */}
            <View style={styles.headRow}>
              <Text style={[styles.headCell, { width: COL_W.fn }]}>{H.listLabel}</Text>
              <Text style={[styles.headCell, { width: COL_W.person }]}>Person Accountable</Text>
              <View style={[styles.headCell, { width: COL_W.leading }]}>
                <Text>Leading Indicators</Text>
                <Text style={styles.headSub}>(Key Performance Indicators)</Text>
              </View>
              <View style={[styles.headCell, { width: COL_W.outcomes, borderRightWidth: 0 }]}>
                <Text>Results / Outcomes</Text>
                <Text style={styles.headSub}>(P/L or B/S items)</Text>
              </View>
            </View>

            {flatRows.length === 0 ? (
              <View style={[styles.row, styles.rowLast]}>
                <Text style={[styles.cell, { width: "100%", textAlign: "center", color: "#94A3B8" }]}>
                  No {chartType === "face" ? "functions" : "processes"} to preview yet.
                </Text>
              </View>
            ) : (
              flatRows.map((r, i) => (
                <FunctionRowView key={r.fn.id} fn={r.fn} indent={r.indent} isLast={i === flatRows.length - 1} />
              ))
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}
