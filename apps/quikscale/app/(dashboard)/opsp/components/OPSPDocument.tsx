"use client";

/**
 * OPSPDocument — react-pdf rendering of the OPSP (Scaling Up One-Page Strategic Plan).
 *
 * **Architecture B (single source of truth for preview + PDF download):**
 *   - The OPSPPreview modal embeds this document via `<PDFViewer>`.
 *   - The "Download PDF" button calls `pdf().toBlob()` on this document.
 *   - Preview and downloaded PDF are byte-identical because they ARE the same artifact.
 *
 * Replaces the previous html2canvas+jsPDF pipeline that was prone to layout drift
 * between Chrome's renderer and html2canvas's reimplementation of CSS.
 *
 * Rich-text fields (coreValues, purpose, bhag, theme, etc.) are stripped to plain
 * text via `stripHtml()` for now — the editor stores HTML but PDF renders flat.
 * This is a deliberate trade-off; bold/italic preservation can be added later via
 * an HTML→react-pdf parser if users request it.
 */

import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import type { FormData } from "../hooks/useOPSPForm";
import type { CritCard } from "../types";
import { hyphenateWord } from "../lib/hyphenate";

/* ─── Constants ────────────────────────────────────────────────────────────── */

const PAGE = { width: "210mm", height: "297mm" } as const;
const CONTENT_W = "190mm" as const; // 210 - 10mm padding each side
const COLORS = {
  band: "#0EA5E9",
  bandText: "#FFFFFF",
  title: "#0EA5E9",
  text: "#1F2937",
  muted: "#6B7280",
  empty: "#9CA3AF",
  borderDark: "#9CA3AF",
  borderLight: "#D1D5DB",
  bgHeader: "#F3F4F6",
  bgGray: "#F9FAFB",
  // Critical # palette (4-state RAG-plus): green, yellow, orange, red
  crit: ["#16a34a", "#eab308", "#f97316", "#dc2626"],
} as const;

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

const stripHtml = (s: string): string =>
  (s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const fmtDue = (d: string): string => {
  if (!d) return "";
  try {
    const dt = new Date(d + "T00:00");
    return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}/${dt.getFullYear()}`;
  } catch {
    return d;
  }
};

const padTo = <T,>(arr: T[], len: number, blank: T): T[] => {
  const out = arr.slice(0, len);
  while (out.length < len) out.push(blank);
  return out;
};

const dash = (s: string | undefined): string => (s && s.trim() ? s : "—");

const ownerNameOf = (
  id: string,
  users: { id: string; firstName: string; lastName: string }[],
): string => {
  if (!id) return "";
  const u = users.find((u) => u.id === id);
  return u ? `${u.firstName} ${u.lastName}` : id;
};

/* ─── Font + line-break behaviour ─────────────────────────────────────────────
 * react-pdf hyphenates words mid-syllable by default (e.g. "Bhavya Lohana"
 * would render as "Bhavya Lo-" / "hana"). Register a no-op hyphenation
 * callback once at module load so words wrap as whole units to the next line.
 *
 * Normal-length words stay whole (no mid-word hyphenation); only pathologically
 * long, space-less tokens are split into chunks so they WRAP inside their cell
 * (and grow the row) instead of overflowing horizontally. See `hyphenateWord`.
 */
Font.registerHyphenationCallback(hyphenateWord);

/* ─── Styles — calibrated to match the previous HTML preview ───────────────── */

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 6.5, // body default
    color: COLORS.text,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  // §1.1 Top blue band — 8pt labels per spec
  topBand: {
    flexDirection: "row",
    height: "10mm",
    backgroundColor: COLORS.band,
    color: COLORS.bandText,
  },
  topBandSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: "3mm",
  },
  topBandDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.4)" },
  topBandLabelMajor: { fontFamily: "Helvetica-Bold", fontSize: 8, marginRight: 4 },
  topBandLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, marginRight: 4 },
  topBandValue: { fontSize: 8 },
  topBandBig: { fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1 },
  // §1.2 Page title centered — 10pt main / 8pt subtitle per spec
  pageTitleWrap: {
    height: "10mm",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  pageTitleMain: { fontFamily: "Helvetica-Bold", fontSize: 10, color: COLORS.title },
  pageTitleSub: { fontSize: 8, color: COLORS.muted, marginLeft: 4 },
  // Content frame — 3mm bottom padding per spec (S/W anchored to bottom)
  content: {
    flexDirection: "column",
    flex: 1,
    paddingHorizontal: "8mm",
    paddingBottom: "3mm",
  },
  // §1.3 3-name list (no headers, just numbered names with underline)
  namesRow: { flexDirection: "row" },
  namesCell: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  namesNum: { fontFamily: "Helvetica-Bold", marginRight: 5, color: COLORS.text, fontSize: 6.5 },
  namesText: { flex: 1, fontSize: 6.5, color: COLORS.text },
  // Section header (the "thBold" equivalent — uppercase + sub-caption) — 8pt per spec
  sectionHeader: {
    backgroundColor: COLORS.bgHeader,
    height: "7mm",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  sectionHeaderTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "center",
    textTransform: "uppercase",
    color: COLORS.text,
  },
  sectionHeaderSub: {
    fontSize: 6,
    fontStyle: "italic",
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 2,
  },
  // Generic body cell
  cellBody: {
    padding: 5,
    overflow: "hidden",
  },
  // Body text default — 6.5pt per spec
  cellBodyText: {
    fontSize: 6.5,
    lineHeight: 1.35,
    color: COLORS.text,
  },
  cellBodyTextBold: {
    fontSize: 6.5,
    lineHeight: 1.35,
    color: COLORS.text,
  },
  cellEmpty: { fontStyle: "italic", color: COLORS.empty },
  // Cat/Proj inner table — explicit borders (no shorthand) for reliable rendering
  // in react-pdf. The `border: 1` shorthand was rendering inconsistently — switching
  // to per-side `borderXxxWidth` + `borderXxxColor` is the documented stable pattern.
  catProjOuter: {
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: COLORS.borderDark,
    borderRightColor: COLORS.borderDark,
    borderBottomColor: COLORS.borderDark,
    borderLeftColor: COLORS.borderDark,
  },
  catProjRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDark,
  },
  catProjRowLast: { borderBottomWidth: 0 },
  catProjCellCat: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: COLORS.borderDark,
    // Top-align so a tall (wrapped) KPI name and its Goal line up at the row
    // top instead of the Goal floating mid-row when the row grows.
    justifyContent: "flex-start",
    minHeight: 28,
  },
  catProjCellProj: {
    width: "22mm",
    paddingVertical: 6,
    paddingHorizontal: 6,
    textAlign: "right",
    justifyContent: "flex-start",
    minHeight: 28,
  },
  catProjHeader: { backgroundColor: COLORS.bgGray },
  catProjHeaderText: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: COLORS.text },
  // Numbered Action row (like §1.5)
  actionRow: {
    flexDirection: "row",
    flex: 1,
    borderBottomWidth: 1,
    borderTopColor: COLORS.borderLight, borderRightColor: COLORS.borderLight, borderBottomColor: COLORS.borderLight, borderLeftColor: COLORS.borderLight,
  },
  actionRowLast: { borderBottomWidth: 0 },
  actionNum: {
    width: "5mm",
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderTopColor: COLORS.borderLight, borderRightColor: COLORS.borderLight, borderBottomColor: COLORS.borderLight, borderLeftColor: COLORS.borderLight,
    color: COLORS.muted,
  },
  actionNumText: {
    fontSize: 6.5,
    color: COLORS.muted,
    fontFamily: "Helvetica-Bold",
  },
  actionDesc: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: "center",
  },
  actionOwner: {
    width: "12mm",
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderLeftWidth: 1,
    borderTopColor: COLORS.borderLight, borderRightColor: COLORS.borderLight, borderBottomColor: COLORS.borderLight, borderLeftColor: COLORS.borderLight,
    textAlign: "right",
    justifyContent: "center",
  },
  actionOwnerText: { fontSize: 6.5, color: COLORS.muted },
  // CritBlock — compact spacing so cell can shrink to ~30mm
  critTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    lineHeight: 1.3,
    marginBottom: 3,
    color: COLORS.text,
  },
  critBullet: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  critSquare: {
    width: 9,
    height: 9,
    marginRight: 5,
  },
  critBulletText: {
    fontSize: 8.5,
    color: COLORS.text,
  },
  critCaption: {
    fontSize: 5,
    fontStyle: "italic",
    color: COLORS.empty,
    marginTop: 2,
  },
  // Strengths/Weaknesses — sentence-case bold titles, no gray bg
  swCol: {
    flex: 1,
    borderTopWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark,
  },
  swColLeft: { borderLeftWidth: 0, borderLeftColor: COLORS.borderDark },
  swColRight: { borderLeftWidth: 0 },
  swHeader: {
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  // Strengths/Weaknesses headers — section header tier (8pt bold uppercase per spec)
  swHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: COLORS.text,
  },
  swList: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8, flex: 1, justifyContent: "space-around" },
  swItem: { flexDirection: "row", marginBottom: 5 },
  swItemNum: {
    color: COLORS.muted,
    marginRight: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
  },
  swItemText: { flex: 1, fontSize: 6.5, color: COLORS.text },
  // Ruled writing row — every Strengths/Weaknesses row sits on an underline
  // (3 rows always rendered) so the printed form keeps its writing lines
  // whether or not the row has text.
  swItemRuled: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderDark,
    paddingBottom: 3,
  },
  // Footer — 6pt (matches sub-caption tier)
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 6,
    color: COLORS.empty,
    paddingHorizontal: "8mm",
    paddingVertical: "1mm",
  },
  // Sandbox sub-label — 6pt bold italic per spec
  sandboxLabel: {
    fontFamily: "Helvetica-BoldOblique",
    fontSize: 6,
    textAlign: "center",
    color: COLORS.text,
    marginTop: 3,
    marginBottom: 2,
  },
  // Inline cell-header title — section header tier (8pt bold uppercase per spec)
  cellTitleInline: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: COLORS.text,
    marginBottom: 4,
  },
});

/* ─── Reusable atoms ───────────────────────────────────────────────────────── */

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionHeaderTitle}>{title}</Text>
      {sub ? <Text style={s.sectionHeaderSub}>{sub}</Text> : null}
    </View>
  );
}

function CatProjTable({
  rows,
  showHeader = true,
  maxRows = 6,
  compact = false,
}: {
  rows: { category: string; projected: string }[];
  showHeader?: boolean;
  maxRows?: number;
  /** Reduces row padding + minHeight so up to 10 rows fit in the standard cell. */
  compact?: boolean;
}) {
  // Per user request: render only rows with data — drop empty placeholder rows.
  // If form has 3 filled rows out of 5, table shows 3. Avoids "—" filler clutter.
  const visible = rows.filter((r) => r.category && r.category.trim()).slice(0, maxRows);
  if (visible.length === 0) return null;
  const cellOverride = compact
    ? { paddingVertical: 2, paddingHorizontal: 5, minHeight: 14 }
    : null;
  return (
    <View style={s.catProjOuter}>
      {showHeader && (
        <View style={{ ...s.catProjRow, ...s.catProjHeader }}>
          <View style={{ ...s.catProjCellCat, ...(cellOverride ?? {}) }}>
            <Text style={s.catProjHeaderText}>Category</Text>
          </View>
          <View style={{ ...s.catProjCellProj, ...(cellOverride ?? {}) }}>
            <Text style={s.catProjHeaderText}>Projected</Text>
          </View>
        </View>
      )}
      {visible.map((r, i) => (
        <View
          key={i}
          style={{ ...s.catProjRow, ...(i === visible.length - 1 ? s.catProjRowLast : {}) }}
        >
          <View style={{ ...s.catProjCellCat, ...(cellOverride ?? {}) }}>
            <Text style={{ ...s.cellBodyText, ...(!r.category ? s.cellEmpty : {}) }}>
              {r.category || "—"}
            </Text>
          </View>
          <View style={{ ...s.catProjCellProj, ...(cellOverride ?? {}) }}>
            <Text style={{ ...s.cellBodyText, ...(!r.projected ? s.cellEmpty : {}) }}>
              {r.projected || "—"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function CritBlock({ crit, label }: { crit: CritCard; label: string }) {
  return (
    <View>
      <Text style={s.critTitle}>
        {label}
        {crit.title ? ` ${crit.title}` : ""}
      </Text>
      {crit.bullets.map((b, i) => (
        <View key={i} style={s.critBullet}>
          <View style={{ ...s.critSquare, backgroundColor: COLORS.crit[i] ?? COLORS.empty }} />
          <Text style={s.critBulletText}>{b || " "}</Text>
        </View>
      ))}
      <Text style={s.critCaption}>Between green &amp; red</Text>
    </View>
  );
}

/* ─── RichText: minimal HTML→react-pdf renderer ──────────────────────────────
 * Supports the subset emitted by our TipTap editor: <p>, <br>, <strong>/<b>,
 * <em>/<i>, <ol>/<ul>/<li>. Anything else is rendered as plain text.
 *
 * Each paragraph is rendered as a <Text> wrapper (so newlines work inside it),
 * with inline runs as nested <Text> nodes carrying fontWeight/fontStyle. Lists
 * are rendered as numbered/bulleted lines.
 */
type Inline = { text: string; bold?: boolean; italic?: boolean };

function tokenizeInline(html: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let bold = 0;
  let italic = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ text: buf, bold: bold > 0, italic: italic > 0 });
      buf = "";
    }
  };
  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) break;
      const tag = html.slice(i + 1, end).toLowerCase().trim();
      flush();
      if (tag === "strong" || tag === "b") bold++;
      else if (tag === "/strong" || tag === "/b") bold = Math.max(0, bold - 1);
      else if (tag === "em" || tag === "i") italic++;
      else if (tag === "/em" || tag === "/i") italic = Math.max(0, italic - 1);
      i = end + 1;
    } else {
      buf += html[i];
      i++;
    }
  }
  flush();
  // decode common entities
  return out.map((p) => ({
    ...p,
    text: p.text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  }));
}

function RichText({ html, style }: { html: string; style?: { color?: string } }) {
  if (!html || !html.trim())
    return <Text style={{ ...s.cellBodyText, ...s.cellEmpty, ...(style ?? {}) }}>—</Text>;

  // Split into block-level chunks (paragraphs + list-items). The TipTap output
  // typically wraps paragraphs in <p>...</p> and list items in <li>...</li>.
  // We approximate by splitting on </p>, </li>, <br>; and tracking ordered-list
  // depth via a simple counter.
  const cleaned = html
    .replace(/<br\s*\/?>/gi, "</p><p>")
    .replace(/<\/(p|li|h[1-6])>/gi, "<<<BLOCK>>>")
    .replace(/<(p|li|h[1-6])[^>]*>/gi, "");
  const blocks = cleaned.split("<<<BLOCK>>>").map((b) => b.trim()).filter(Boolean);
  // Detect ordered/unordered list context: a blunt heuristic — if the original
  // html opens with <ol> we number, with <ul> we bullet. (Mixed lists are rare
  // in OPSP fields and an acceptable trade.)
  const isOrdered = /^\s*<ol/i.test(html);
  const isUnordered = /^\s*<ul/i.test(html);

  return (
    <View>
      {blocks.map((block, bi) => {
        const inlines = tokenizeInline(block);
        if (inlines.length === 0) return null;
        const prefix = isOrdered ? `${bi + 1}. ` : isUnordered ? "• " : "";
        // Wrap each paragraph in its own View — react-pdf reliably spaces
        // sibling Views via marginBottom, while sibling <Text> nodes can
        // overlap visually (the strikethrough effect we saw in the PDF).
        return (
          <View key={bi} style={{ marginBottom: 3 }}>
            <Text style={{ ...s.cellBodyText, ...(style ?? {}) }}>
              {prefix}
              {inlines.map((inline, ii) => (
                <Text
                  key={ii}
                  style={{
                    fontFamily: inline.bold
                      ? inline.italic
                        ? "Helvetica-BoldOblique"
                        : "Helvetica-Bold"
                      : inline.italic
                        ? "Helvetica-Oblique"
                        : "Helvetica",
                  }}
                >
                  {inline.text}
                </Text>
              ))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function NumberedRow({
  i,
  text,
  owner,
  isLast,
}: {
  i: number;
  text: string;
  owner?: string;
  isLast: boolean;
}) {
  const empty = !text || !text.trim();
  return (
    <View style={{ ...s.actionRow, ...(isLast ? s.actionRowLast : {}) }}>
      <View style={s.actionNum}>
        <Text style={s.actionNumText}>{i + 1}</Text>
      </View>
      <View style={s.actionDesc}>
        <Text style={{ ...s.cellBodyTextBold, ...(empty ? s.cellEmpty : {}) }}>{dash(text)}</Text>
      </View>
      {owner !== undefined && (
        <View style={s.actionOwner}>
          <Text style={s.actionOwnerText}>{owner}</Text>
        </View>
      )}
    </View>
  );
}

/* ─── Main document ────────────────────────────────────────────────────────── */

export interface OPSPDocumentProps {
  form: FormData;
  users?: { id: string; firstName: string; lastName: string }[];
  /** Rendered in Page 1 blue band "Organization:" field. */
  tenantName?: string;
  /** Rendered in Page 2 blue band "Your Name:" field. */
  currentUserName?: string;
}

export function OPSPDocument({
  form,
  users = [],
  tenantName = "",
  currentUserName = "",
}: OPSPDocumentProps) {
  const owner = (id: string) => ownerNameOf(id, users);

  /* ── Page-1 prepared data ── */
  // Per user request: filter empty rows out — only show data, no "—" placeholders.
  // Names lists keep their fixed 3-slot scaffolding so the layout doesn't jitter.
  const employees = padTo(form.employees ?? [], 3, "");
  const customers = padTo(form.customers ?? [], 3, "");
  const shareholders = padTo(form.shareholders ?? [], 3, "");
  const actions5 = (form.actions ?? []).filter((v) => v && v.trim());
  const thrusts5 = (form.keyThrusts ?? []).filter((r) => r.desc && r.desc.trim());
  const initiatives5 = (form.keyInitiatives ?? []).filter((r) => r.desc && r.desc.trim());
  const processItems3 = (form.processItems ?? []).filter((v) => v && v.trim());
  const weaknesses3 = (form.weaknesses ?? []).filter((v) => v && v.trim());

  /* ── Page-2 prepared data ── */
  const makeBuy = padTo(form.makeBuy ?? [], 3, "");
  const sell = padTo(form.sell ?? [], 3, "");
  const recordKeeping = padTo(form.recordKeeping ?? [], 3, "");
  const rocks5 = (form.rocks ?? []).filter((r) => r.desc && r.desc.trim());
  const kpis5 = (form.kpiAccountability ?? []).filter((r) => r.kpi && r.kpi.trim());
  const priorities5 = (form.quarterlyPriorities ?? []).filter((r) => r.priority && r.priority.trim());
  // When a per-user section is empty (e.g. the user excluded it from the PDF
  // download, or simply never filled it), render fixed-count BLANK rows so the
  // section prints as a fill-in-the-blank form (header + 5 ruled rows) instead
  // of an empty box. Sections with data render their real rows unchanged.
  const ACCT_PLACEHOLDER_ROWS = 5;
  const kpiRows = kpis5.length ? kpis5 : padTo([], ACCT_PLACEHOLDER_ROWS, { kpi: "", goal: "" });
  const priorityRows = priorities5.length
    ? priorities5
    : padTo([], ACCT_PLACEHOLDER_ROWS, { priority: "", dueDate: "" });

  /* ── Goals compaction: when the user has more than the default 6 goal rows,
   * we render the Goals table in compact mode (tighter padding + minHeight) so
   * all 7-10 rows still fit inside the standard 85mm Goals cell. This keeps
   * Page 1 layout intact — no continuation page, no empty whitespace pages. */
  const filledGoalsCount = (form.goalRows ?? []).filter(
    (r) => r.category && r.category.trim(),
  ).length;
  const goalsOverflow = filledGoalsCount > 6;

  return (
    <Document>
      {/* ════════════════ PAGE 1 — PEOPLE ════════════════ */}
      <Page size="A4" style={s.page}>
        {/* §1.1 Top blue band */}
        <View style={s.topBand}>
          <View style={[s.topBandSection, { flex: 1 }]}>
            <Text style={s.topBandLabelMajor}>Strategy:</Text>
            <Text style={s.topBandValue}>One-Page Strategic Plan (OPSP)</Text>
          </View>
          <View style={[s.topBandSection, s.topBandDivider]}>
            <Text style={s.topBandLabel}>Organization:</Text>
            <Text style={s.topBandValue}>{tenantName || "—"}</Text>
          </View>
        </View>

        {/* §1.2 Page title */}
        <View style={s.pageTitleWrap}>
          <Text style={s.pageTitleMain}>People</Text>
          <Text style={s.pageTitleSub}>(Reputation Drivers)</Text>
        </View>

        {/* Content area (10mm horizontal padding) */}
        <View style={s.content}>
          {/* §1.3 Names — 3 columns × 3 rows, numbered */}
          <View style={{ marginBottom: 4 }}>
            {[0, 1, 2].map((rowIdx) => (
              <View key={rowIdx} style={s.namesRow}>
                {[employees, customers, shareholders].map((arr, colIdx) => {
                  const v = arr[rowIdx];
                  return (
                    <View key={colIdx} style={s.namesCell}>
                      <Text style={s.namesNum}>{rowIdx + 1}.</Text>
                      <Text style={{ ...s.namesText, ...(!v ? s.cellEmpty : {}) }}>{dash(v)}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* §1.4–§1.7 main grid: Core Values (left, tall) + Right stack (4 sections) */}
          <View style={{ flexDirection: "row", flex: 1 }}>
            {/* Core Values column — 40mm, full middle-band height (overflow clipped)
                Bottom border hidden per design — top/left/right only. */}
            <View
              style={{
                width: "40mm",
                borderTopWidth: 1,
                borderRightWidth: 1,
                borderBottomWidth: 0,
                borderLeftWidth: 1,
                borderTopColor: COLORS.borderDark,
                borderRightColor: COLORS.borderDark,
                borderLeftColor: COLORS.borderDark,
                flexDirection: "column",
              }}
            >
              <SectionHeader title="Core Values/Beliefs" sub="(Should/Shouldn't)" />
              <View style={{ padding: 6, flex: 1, overflow: "hidden" }}>
                <RichText html={form.coreValues} />
              </View>
            </View>

            {/* Right stack — 150mm wide, 4 sub-sections */}
            <View style={{ flex: 1, flexDirection: "column" }}>
              {/* §1.4 hdr (Purpose/Targets/Goals) */}
              <View style={{ flexDirection: "row" }}>
                <View
                  style={{
                    // §1.4 column widths: Purpose 40 / Targets 55 / Goals 55 (proportional weights, sums to 150 = right-stack width)
                    flex: 55,
                    borderTopWidth: 1,
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark,
                  }}
                >
                  <SectionHeader title="Purpose" sub="(Why)" />
                </View>
                <View
                  style={{
                    flex: 55,
                    borderTopWidth: 1,
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark,
                  }}
                >
                  <SectionHeader title="Targets (3-5 Yrs.)" sub="(Where)" />
                </View>
                <View
                  style={{
                    flex: 55,
                    borderTopWidth: 1,
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark,
                  }}
                >
                  <SectionHeader title="Goals (1 Yr.)" sub="(What)" />
                </View>
              </View>
              {/* §1.4 body row — column weights MUST match the header above (40/55/55).
                  Height stays fixed at 85mm; Goals table switches to compact mode
                  when row count > 6 so all rows still fit. */}
              <View style={{ flexDirection: "row", height: "85mm" }}>
                <View
                  style={{
                    flex: 52,
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark,
                    padding: 6,
                    overflow: "hidden",
                  }}
                >
                  <RichText html={form.purpose} />
                </View>
                <View
                  style={{
                    flex: 55,
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark,
                    padding: 2,
                    overflow: "hidden",
                  }}
                >
                  <CatProjTable rows={form.targetRows ?? []} />
                  {form.sandbox && (
                    <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: COLORS.borderLight, borderRightColor: COLORS.borderLight, borderBottomColor: COLORS.borderLight, borderLeftColor: COLORS.borderLight }}>
                      <Text style={s.sandboxLabel}>Sandbox</Text>
                      <RichText html={form.sandbox} style={{ color: COLORS.muted }} />
                    </View>
                  )}
                </View>
                <View
                  style={{
                    flex: 55,
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark,
                    padding: 2,
                    overflow: "hidden",
                  }}
                >
                  <CatProjTable
                    rows={form.goalRows ?? []}
                    maxRows={10}
                    compact={goalsOverflow}
                  />
                </View>
              </View>

              {/* §1.5 hdr — Actions / Key Thrusts / Key Initiatives */}
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
                  <SectionHeader title="Actions" sub="To Live Values, Purposes, BHAG" />
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
                  <SectionHeader title="Key Thrusts/Capabilities" sub="3-5 Year Priorities" />
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
                  <SectionHeader title="Key Initiatives" sub="1 Year Priorities" />
                </View>
              </View>
              {/* §1.5 body — 5 numbered rows × 3 cols. The TRUE slack-absorber for
                  this page: `flex:1` (not a fixed height) so it shrinks to absorb
                  growth from the unbounded §1.3 Names block above. Without this, a
                  name that wraps to a 2nd line pushes the all-fixed-height grid past
                  A4 and react-pdf emits a blank continuation page between the People
                  and Process pages. `minHeight` keeps the 5 action rows legible; for
                  extreme content the page still flows naturally (never capped). */}
              <View style={{ flexDirection: "row", flex: 1, minHeight: "40mm" }}>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, overflow: "hidden" }}>
                  {actions5.map((v, i) => (
                    <NumberedRow key={i} i={i} text={v} isLast={i === 4} />
                  ))}
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, overflow: "hidden" }}>
                  {thrusts5.map((r, i) => (
                    <NumberedRow key={i} i={i} text={r.desc} isLast={i === 4} />
                  ))}
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, overflow: "hidden" }}>
                  {initiatives5.map((r, i) => (
                    <NumberedRow key={i} i={i} text={r.desc} isLast={i === 4} />
                  ))}
                </View>
              </View>

              {/* §1.6 — shrunk to 30mm to remove empty space below short rich-text content */}
              <View style={{ flexDirection: "row", height: "30mm" }}>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6, overflow: "hidden" }}>
                  <Text style={s.cellTitleInline}>Profit per X</Text>
                  <RichText html={form.profitPerX} />
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6, overflow: "hidden" }}>
                  <Text style={s.cellTitleInline}>Brand Promise KPIs</Text>
                  <RichText html={form.brandPromiseKPIs} />
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6, overflow: "hidden" }}>
                  <CritBlock crit={form.criticalNumGoals} label="Critical #:" />
                </View>
              </View>

              {/* §1.7 — shrunk to 30mm to remove empty space below BHAG / Brand Promises */}
              <View style={{ flexDirection: "row", height: "38.2mm" }}>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 0, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6, overflow: "hidden" }}>
                  <Text style={s.cellTitleInline}>BHAG®</Text>
                  <RichText html={form.bhag} />
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 0, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6, overflow: "hidden" }}>
                  <Text style={s.cellTitleInline}>Brand Promises</Text>
                  <RichText html={form.brandPromise} />
                </View>
                <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 0, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6, overflow: "hidden" }}>
                  <CritBlock crit={form.balancingCritNumGoals} label="Balancing Critical #:" />
                </View>
              </View>
            </View>
          </View>

          {/* §1.8 Strengths / Weaknesses — sits naturally after §1.7 with 3mm bottom pad
              (sections sized to exactly fill the page; no flex spacer needed).
              28mm: 8mm borrowed from §1.5 so the 3 ruled writing rows in each
              column are spread evenly (swList uses justifyContent space-around). */}
          <View style={{ flexDirection: "row", height: "28mm" }}>
            <View style={{ ...s.swCol, ...s.swColLeft }}>
              <View style={s.swHeader}>
                <Text style={s.swHeaderText}>Strengths/Core Competencies</Text>
              </View>
              <View style={s.swList}>
                {padTo(processItems3, 3, "").map((v, i) => (
                  <View key={i} style={s.swItemRuled}>
                    <Text style={s.swItemNum}>{i + 1}.</Text>
                    <Text style={s.swItemText}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ ...s.swCol, ...s.swColRight }}>
              <View style={s.swHeader}>
                <Text style={s.swHeaderText}>Weaknesses:</Text>
              </View>
              <View style={s.swList}>
                {padTo(weaknesses3, 3, "").map((v, i) => (
                  <View key={i} style={s.swItemRuled}>
                    <Text style={s.swItemNum}>{i + 1}.</Text>
                    <Text style={s.swItemText}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Page>

      {/* ════════════════ PAGE 2 — PROCESS ════════════════ */}
      <Page size="A4" style={s.page}>
        {/* §2.1 Top blue band — Your Name / Date / SCALING UP */}
        <View style={s.topBand}>
          <View style={[s.topBandSection, { flex: 1 }]}>
            <Text style={s.topBandLabel}>Your Name:</Text>
            <Text style={s.topBandValue}>{currentUserName || "—"}</Text>
          </View>
          <View style={[s.topBandSection, s.topBandDivider]}>
            <Text style={s.topBandLabel}>Date:</Text>
            <Text style={s.topBandValue}>
              {form.year} / {form.quarter}
            </Text>
          </View>
          <View style={[s.topBandSection, s.topBandDivider]}>
            <Text style={s.topBandBig}>SCALING UP</Text>
          </View>
        </View>

        {/* §2.2 Page title */}
        <View style={s.pageTitleWrap}>
          <Text style={s.pageTitleMain}>Process</Text>
          <Text style={s.pageTitleSub}>(Productivity Drivers)</Text>
        </View>

        <View style={s.content}>
          {/* §2.3 3-name list — Make/Buy / Sell / Record Keeping */}
          <View style={{ marginBottom: 4 }}>
            {[0, 1, 2].map((rowIdx) => (
              <View key={rowIdx} style={s.namesRow}>
                {[makeBuy, sell, recordKeeping].map((arr, colIdx) => {
                  const v = arr[rowIdx];
                  return (
                    <View key={colIdx} style={s.namesCell}>
                      <Text style={s.namesNum}>{rowIdx + 1}.</Text>
                      <Text style={{ ...s.namesText, ...(!v ? s.cellEmpty : {}) }}>{dash(v)}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* §2.4 hdr — Actions QTR / Theme / Your Accountability */}
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1.01, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
              <SectionHeader title="Actions (QTR)" sub="(How)" />
            </View>
            <View style={{ flex: 1.025, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
              <SectionHeader title="Theme" sub="(QTR/ANNUAL)" />
            </View>
            <View style={{ flex: 1, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
              <SectionHeader title="Your Accountability" sub="(Who/When)" />
            </View>
          </View>
          {/* §2.4 body — `minHeight` (not fixed `height`) so a row grows to fit
              wrapped content (e.g. a long KPI name) instead of clipping/overlapping
              the next row; short data still fills the 50mm minimum. */}
          <View style={{ flexDirection: "row", minHeight: "50mm" }}>
            <View style={{ flex: 1.01, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 2, overflow: "hidden" }}>
              <CatProjTable rows={form.actionsQtr ?? []} />
            </View>
            <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 4, overflow: "hidden" }}>
              <RichText html={form.theme} />
            </View>
            <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 2, overflow: "hidden" }}>
              {/* KPIs table: KPI | Goal × 5 rows */}
              <View style={s.catProjOuter}>
                <View style={{ ...s.catProjRow, ...s.catProjHeader }}>
                  <View style={s.catProjCellCat}>
                    <Text style={s.catProjHeaderText}>Your KPI&apos;s</Text>
                  </View>
                  <View style={s.catProjCellProj}>
                    <Text style={s.catProjHeaderText}>Goal</Text>
                  </View>
                </View>
                {kpiRows.map((r, i) => (
                  <View
                    key={i}
                    style={{ ...s.catProjRow, ...(i === kpiRows.length - 1 ? s.catProjRowLast : {}) }}
                  >
                    <View style={s.catProjCellCat}>
                      <Text style={{ ...s.cellBodyText, ...(!r.kpi ? s.cellEmpty : {}) }}>{r.kpi || ""}</Text>
                    </View>
                    <View style={s.catProjCellProj}>
                      <Text style={{ ...s.cellBodyText, ...(!r.goal ? s.cellEmpty : {}) }}>{r.goal || ""}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* §2.5 hdr — Rocks / Scoreboard / Quarterly Priorities */}
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1.01, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
              <SectionHeader title="Rocks" sub="1 Quarterly Priorities" />
            </View>
            <View style={{ flex: 1.025, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
              <SectionHeader title="Scoreboard Design" sub="Describe and/or sketch your design" />
            </View>
            <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark }}>
              <SectionHeader title="Your Quarterly Priorities" sub="Due" />
            </View>
          </View>
          {/* §2.5 body — `minHeight` (was fixed 65mm) so a long Quarterly
              Priority / Rock grows its row instead of clipping; short data still
              fills the 65mm minimum. */}
          <View style={{ flexDirection: "row", minHeight: "65mm" }}>
            <View style={{ flex: 1.035, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, overflow: "hidden" }}>
              {rocks5.map((r, i) => (
                <NumberedRow key={i} i={i} text={r.desc} owner={owner(r.owner)} isLast={i === 4} />
              ))}
            </View>
            <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 4, overflow: "hidden" }}>
              <RichText html={form.scoreboardDesign} />
            </View>
            <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 2, overflow: "hidden" }}>
              <View style={s.catProjOuter}>
                <View style={{ ...s.catProjRow, ...s.catProjHeader }}>
                  <View style={s.catProjCellCat}>
                    <Text style={s.catProjHeaderText}>Priority</Text>
                  </View>
                  <View style={s.catProjCellProj}>
                    <Text style={s.catProjHeaderText}>Due</Text>
                  </View>
                </View>
                {priorityRows.map((r, i) => (
                  <View
                    key={i}
                    style={{ ...s.catProjRow, ...(i === priorityRows.length - 1 ? s.catProjRowLast : {}) }}
                  >
                    <View style={s.catProjCellCat}>
                      <Text style={{ ...s.cellBodyText, ...(!r.priority ? s.cellEmpty : {}) }}>{r.priority || ""}</Text>
                    </View>
                    <View style={s.catProjCellProj}>
                      <Text style={{ ...s.cellBodyText, ...(!r.dueDate ? s.cellEmpty : {}) }}>
                        {r.dueDate ? fmtDue(r.dueDate) : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* §2.6 — Critical # Process | Celebration | Critical # Acct (inline cell titles) */}
          <View style={{ flexDirection: "row", height: "38mm" }}>
            <View style={{ flex: 1.01, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6 }}>
              <CritBlock crit={form.criticalNumProcess} label="Critical #:" />
            </View>
            <View style={{ flex: 1.025, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6 }}>
              <Text style={s.cellTitleInline}>Celebration</Text>
              <RichText html={form.celebration} />
            </View>
            <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6 }}>
              <CritBlock crit={form.criticalNumAcct} label="Critical #:" />
            </View>
          </View>

          {/* §2.7 — Balancing # Process | Reward | Balancing # Acct (inline cell titles) */}
          <View style={{ flexDirection: "row", height: "38mm" }}>
            <View style={{ flex: 1.01, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6 }}>
              <CritBlock crit={form.balancingCritNumProcess} label="Balancing Critical #:" />
            </View>
            <View style={{ flex: 1.025, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6 }}>
              <Text style={s.cellTitleInline}>Reward</Text>
              <RichText html={form.reward} />
            </View>
            <View style={{ flex: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: COLORS.borderDark, borderRightColor: COLORS.borderDark, borderBottomColor: COLORS.borderDark, borderLeftColor: COLORS.borderDark, padding: 6 }}>
              <CritBlock crit={form.balancingCritNumAcct} label="Balancing Critical #:" />
            </View>
          </View>

          {/* §2.8 Trends — 6 items in 2 columns */}
          <View style={{ marginTop: 4, padding: 2 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: COLORS.text, marginBottom: 4 }}>Trends</Text>
            <View style={{ flexDirection: "row" }}>
              {[0, 1].map((col) => (
                <View key={col} style={{ flex: 1, paddingHorizontal: 6 }}>
                  {[0, 1, 2].map((row) => {
                    const idx = row * 2 + col;
                    const v = (form.trends ?? [])[idx] ?? "";
                    return (
                      <View
                        key={idx}
                        style={{
                          flexDirection: "row",
                          marginBottom: 3,
                          paddingBottom: 2,
                          borderBottomWidth: 1,
                          borderTopColor: COLORS.borderLight, borderRightColor: COLORS.borderLight, borderBottomColor: COLORS.borderLight, borderLeftColor: COLORS.borderLight,
                        }}
                      >
                        <Text style={s.swItemNum}>{idx + 1}.</Text>
                        <Text style={{ ...s.swItemText, ...(!v ? s.cellEmpty : {}) }}>{dash(v)}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* §2.9 Footer */}
        <View style={s.footer}>
          <Text>To get help implementing these tools, please go to www.ScalingUp.com</Text>
          <Text>v2.0/2C — © 2020 by Scaling Up Coaches S4</Text>
        </View>
      </Page>
    </Document>
  );
}
