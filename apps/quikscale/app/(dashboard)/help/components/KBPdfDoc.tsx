"use client";

/**
 * Knowledge Base → printable manual (react-pdf).
 *
 * Real PDF text rendering — no bitmap capture — so the manual stays selectable,
 * searchable and crisp at print resolution. Structure:
 *
 *   1  cover page
 *   2  how to use this manual
 *   3+ table of contents (flows over as many pages as it needs)
 *   4+ one chapter per page break, sections and blocks in authored order
 *
 * Figures: `availableScreens` and `screenSizes` come from KBDownloadButton,
 * which loads every screenshot before generating. Anything that did not load
 * renders as a described placeholder — react-pdf does not fail loudly on an
 * unreachable <Image>, it logs "fetch failed" and silently omits it, so the
 * pre-flight check is what turns a missing file into visible, useful text.
 */

import {
  Document, Page, View, Text, Image, StyleSheet,
} from "@react-pdf/renderer";
import type { KBBlock, KBChapter, KBTone } from "@/lib/knowledge-base/types";

const INK = "#1F2937";
const MUTED = "#6B7280";
const FAINT = "#9CA3AF";
const RULE = "#E5E7EB";
const BRAND = "#2563EB";

const s = StyleSheet.create({
  page: {
    paddingTop: 54, paddingBottom: 56, paddingHorizontal: 56,
    fontFamily: "Helvetica", fontSize: 10.5, color: INK, lineHeight: 1.55,
    backgroundColor: "#FFFFFF",
  },

  /* Cover */
  cover: { paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0, fontFamily: "Helvetica", backgroundColor: "#FFFFFF" },
  coverBand: { backgroundColor: BRAND, paddingHorizontal: 56, paddingTop: 96, paddingBottom: 56 },
  coverEyebrow: { color: "#BFDBFE", fontSize: 10, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  coverTitle: { color: "#FFFFFF", fontSize: 34, fontFamily: "Helvetica-Bold", marginTop: 18, lineHeight: 1.15 },
  coverSub: { color: "#DBEAFE", fontSize: 13, marginTop: 12, lineHeight: 1.5 },
  coverBody: { paddingHorizontal: 56, paddingTop: 40 },
  coverLead: { fontSize: 11, color: MUTED, lineHeight: 1.7, marginBottom: 26 },
  coverPillarRow: { flexDirection: "row", marginTop: 6 },
  coverPillar: { flex: 1, borderTopWidth: 3, paddingTop: 8, marginRight: 10 },
  coverPillarName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  coverPillarDesc: { fontSize: 8.5, color: FAINT, marginTop: 3, lineHeight: 1.45 },
  coverFootRow: {
    position: "absolute", bottom: 46, left: 56, right: 56,
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: RULE, paddingTop: 10,
  },
  coverFoot: { fontSize: 9, color: FAINT },

  /* Running furniture */
  runHead: {
    position: "absolute", top: 26, left: 56, right: 56,
    flexDirection: "row", justifyContent: "space-between",
    borderBottomWidth: 1, borderBottomColor: RULE, paddingBottom: 6,
  },
  runHeadText: { fontSize: 8, color: FAINT, letterSpacing: 0.6 },
  runFoot: { position: "absolute", bottom: 28, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between" },
  runFootText: { fontSize: 8, color: FAINT },

  /* Contents */
  tocGroup: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BRAND, letterSpacing: 1.4, marginTop: 18, marginBottom: 6 },
  tocRow: { flexDirection: "row", marginBottom: 7, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  tocNum: { width: 24, fontSize: 9.5, color: FAINT, fontFamily: "Helvetica-Bold" },
  tocTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK },
  tocSummary: { fontSize: 9, color: MUTED, marginTop: 2, lineHeight: 1.45 },

  /* Chapter + section headings */
  chapterHead: { marginBottom: 16 },
  chapterKicker: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BRAND, letterSpacing: 1.6 },
  chapterTitle: { fontSize: 21, fontFamily: "Helvetica-Bold", color: INK, marginTop: 8, lineHeight: 1.2 },
  chapterSummary: { fontSize: 10.5, color: MUTED, marginTop: 7, lineHeight: 1.55 },
  chapterRule: { borderBottomWidth: 2, borderBottomColor: BRAND, width: 46, marginTop: 12 },
  sectionTitle: {
    fontSize: 13, fontFamily: "Helvetica-Bold", color: INK,
    marginTop: 20, marginBottom: 6, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: RULE,
  },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, marginTop: 12, marginBottom: 3 },

  /* Body blocks */
  p: { marginBottom: 8, textAlign: "justify" },
  liRow: { flexDirection: "row", marginBottom: 4 },
  liBullet: { width: 14, color: FAINT },
  liText: { flex: 1 },
  stepRow: { flexDirection: "row", marginBottom: 8 },
  stepNumWrap: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center", marginRight: 9,
  },
  stepNum: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BRAND },
  stepBody: { flex: 1 },
  stepTitle: { fontFamily: "Helvetica-Bold" },

  /* Tables */
  tableCaption: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: FAINT, letterSpacing: 0.8, marginTop: 10, marginBottom: 4 },
  table: { borderWidth: 1, borderColor: RULE, borderRadius: 3, marginBottom: 10, overflow: "hidden" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  trHead: { flexDirection: "row", backgroundColor: "#EFF6FF", borderBottomWidth: 1, borderBottomColor: RULE },
  th: { paddingVertical: 5, paddingHorizontal: 7, fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#374151" },
  td: { paddingVertical: 5, paddingHorizontal: 7, fontSize: 9, color: "#374151", lineHeight: 1.45 },

  /* Callouts */
  callout: { borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10, marginVertical: 8 },
  calloutLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 3 },
  calloutTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  calloutBody: { fontSize: 9, lineHeight: 1.5 },

  /* Figures */
  figure: { marginVertical: 10 },
  figureImg: { objectFit: "contain", borderWidth: 1, borderColor: RULE, borderRadius: 3 },
  figurePlaceholder: {
    borderWidth: 1, borderStyle: "dashed", borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB", borderRadius: 4, paddingVertical: 14, paddingHorizontal: 12,
  },
  figurePlaceholderLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: FAINT, letterSpacing: 1 },
  figurePlaceholderTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#4B5563", marginTop: 4 },
  figurePlaceholderHint: { fontSize: 8.5, color: MUTED, marginTop: 3, lineHeight: 1.45 },
  figureCaption: { fontSize: 8.5, color: FAINT, marginTop: 4 },

  /* FAQ + KV */
  faq: { borderWidth: 1, borderColor: RULE, borderRadius: 3, paddingVertical: 7, paddingHorizontal: 9, marginBottom: 6 },
  faqQ: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK },
  faqA: { fontSize: 9, color: "#4B5563", marginTop: 2, lineHeight: 1.5 },
  kvRow: { flexDirection: "row", marginBottom: 6 },
  kvK: { width: 118, fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, paddingRight: 8 },
  kvV: { flex: 1, fontSize: 9.5, color: "#4B5563", lineHeight: 1.5 },
});

const CALLOUT: Record<KBTone, { border: string; bg: string; ink: string; label: string }> = {
  info: { border: "#BFDBFE", bg: "#EFF6FF", ink: "#1E40AF", label: "NOTE" },
  tip:  { border: "#BBF7D0", bg: "#F0FDF4", ink: "#166534", label: "TIP" },
  warn: { border: "#FDE68A", bg: "#FFFBEB", ink: "#92400E", label: "CAREFUL" },
  rule: { border: "#D1D5DB", bg: "#F9FAFB", ink: "#111827", label: "RULE" },
};

const PILLARS = [
  { name: "People", color: "#16A34A", desc: "Accountability, reviews, talent and engagement" },
  { name: "Strategy", color: "#D97706", desc: "OPSP, Rockefeller Habits and SWT" },
  { name: "Execution", color: "#DC2626", desc: "KPIs, priorities, commitments and rhythm" },
  { name: "Cash", color: "#2563EB", desc: "The fourth pillar — on the roadmap" },
];

/** A4 (595.28pt) minus the page's 56pt horizontal padding on each side. */
const CONTENT_WIDTH = 483;
/** Tallest a figure may be, so a portrait crop cannot swallow a whole page. */
const MAX_FIGURE_HEIGHT = 420;

/**
 * Fit a capture into the text column without ever upscaling it.
 *
 * react-pdf gives an <Image> no intrinsic sizing, so this has to be computed:
 * `width: "100%"` stretched a 219×935 sidebar crop across the full column and
 * blew it up 5×. Screen pixels are converted to points at 0.75 (96dpi → 72dpi),
 * then clamped to the column width and the height cap, whichever binds first.
 */
export function figureSize(px?: { w: number; h: number }): { width: number; height: number } | null {
  if (!px || !px.w || !px.h) return null;
  const natural = { width: px.w * 0.75, height: px.h * 0.75 };
  const scale = Math.min(1, CONTENT_WIDTH / natural.width, MAX_FIGURE_HEIGHT / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}

function widthsFor(head: string[], widths?: number[]): string[] {
  const w = widths && widths.length === head.length ? widths : head.map(() => 1);
  const total = w.reduce((a, c) => a + c, 0);
  return w.map((x) => `${(x / total) * 100}%`);
}

/* ─── Block rendering ─────────────────────────────────────────────────────── */

function PdfBlock({
  block: b, screens, screenBase, screenSizes,
}: {
  block: KBBlock;
  screens: Set<string>;
  screenBase: string;
  screenSizes: Record<string, { w: number; h: number }>;
}) {
  switch (b.type) {
    case "p":
      return <Text style={s.p}>{b.text}</Text>;

    case "h3":
      return <Text style={s.h3}>{b.text}</Text>;

    case "bullets":
      return (
        <View style={{ marginBottom: 6 }}>
          {b.items.map((it, i) => (
            <View key={i} style={s.liRow} wrap={false}>
              <Text style={s.liBullet}>{b.ordered ? `${i + 1}.` : "•"}</Text>
              <Text style={s.liText}>{it}</Text>
            </View>
          ))}
        </View>
      );

    case "steps":
      return (
        <View style={{ marginBottom: 6, marginTop: 2 }}>
          {b.items.map((st, i) => (
            <View key={i} style={s.stepRow} wrap={false}>
              <View style={s.stepNumWrap}>
                <Text style={s.stepNum}>{i + 1}</Text>
              </View>
              <View style={s.stepBody}>
                <Text>
                  <Text style={s.stepTitle}>{st.title}. </Text>
                  <Text>{st.text}</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>
      );

    case "table": {
      const cols = widthsFor(b.head, b.widths);
      return (
        <View>
          {b.caption ? <Text style={s.tableCaption}>{b.caption.toUpperCase()}</Text> : null}
          <View style={s.table}>
            <View style={s.trHead} wrap={false}>
              {b.head.map((h, i) => (
                <Text key={i} style={[s.th, { width: cols[i] }]}>{h}</Text>
              ))}
            </View>
            {b.rows.map((r, ri) => (
              <View
                key={ri}
                style={[s.tr, ri % 2 === 1 ? { backgroundColor: "#FAFAFA" } : {}]}
                wrap={false}
              >
                {r.map((c, ci) => (
                  <Text key={ci} style={[s.td, { width: cols[ci] }]}>{c}</Text>
                ))}
              </View>
            ))}
          </View>
        </View>
      );
    }

    case "callout": {
      const c = CALLOUT[b.tone];
      return (
        <View style={[s.callout, { borderColor: c.border, backgroundColor: c.bg }]} wrap={false}>
          <Text style={[s.calloutLabel, { color: c.ink }]}>{c.label}</Text>
          <Text style={[s.calloutTitle, { color: c.ink }]}>{b.title}</Text>
          <Text style={[s.calloutBody, { color: c.ink }]}>{b.text}</Text>
        </View>
      );
    }

    case "figure": {
      const size = figureSize(screenSizes[b.file]);
      return (
        <View style={s.figure} wrap={false}>
          {screens.has(b.file) ? (
            // react-pdf's <Image> is a PDF primitive, not an <img> — it has no alt prop.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image
              style={[s.figureImg, size ?? { width: "100%" }]}
              src={`${screenBase}/${b.file}`}
            />
          ) : (
            <View style={s.figurePlaceholder}>
              <Text style={s.figurePlaceholderLabel}>SCREENSHOT NOT CAPTURED YET</Text>
              <Text style={s.figurePlaceholderTitle}>{b.caption}</Text>
              <Text style={s.figurePlaceholderHint}>{b.hint}</Text>
              <Text style={[s.figurePlaceholderHint, { color: FAINT }]}>
                public/kb/screens/{b.file} — run “npm run kb:screens” to capture it
              </Text>
            </View>
          )}
          <Text style={s.figureCaption}>{b.caption}</Text>
        </View>
      );
    }

    case "faq":
      return (
        <View style={{ marginVertical: 4 }}>
          {b.items.map((f, i) => (
            <View key={i} style={s.faq} wrap={false}>
              <Text style={s.faqQ}>{f.q}</Text>
              <Text style={s.faqA}>{f.a}</Text>
            </View>
          ))}
        </View>
      );

    case "kv":
      return (
        <View style={{ marginVertical: 4 }}>
          {b.items.map((kv, i) => (
            <View key={i} style={s.kvRow} wrap={false}>
              <Text style={s.kvK}>{kv.k}</Text>
              <Text style={s.kvV}>{kv.v}</Text>
            </View>
          ))}
        </View>
      );

    default:
      return null;
  }
}

/* ─── Document ────────────────────────────────────────────────────────────── */

export interface KBPdfProps {
  chapters: KBChapter[];
  groups: { label: string; chapterIds: string[] }[];
  meta: { title: string; subtitle: string; edition: string };
  orgName: string;
  generatedOn: string;
  /** Screenshot filenames confirmed to exist — anything else renders as a placeholder. */
  availableScreens: string[];
  /**
   * Absolute base URL the screenshots are fetched from, e.g.
   * "https://app.example.com/kb/screens". Must be absolute: react-pdf resolves
   * an <Image> src itself rather than through the document, so a root-relative
   * "/kb/screens/x.png" has no origin to resolve against and the image is
   * dropped silently. Tests may pass a filesystem directory instead.
   */
  screenBase: string;
  /**
   * Pixel dimensions per screenshot filename. Without these every figure falls
   * back to full column width, which upscales small crops — see figureSize().
   */
  screenSizes: Record<string, { w: number; h: number }>;
}

function Furniture({ chapterTitle, orgName }: { chapterTitle: string; orgName: string }) {
  return (
    <>
      <View style={s.runHead} fixed>
        <Text style={s.runHeadText}>QUIKSCALE KNOWLEDGE BASE</Text>
        <Text style={s.runHeadText}>{chapterTitle.toUpperCase()}</Text>
      </View>
      <View style={s.runFoot} fixed>
        <Text style={s.runFootText}>{orgName}</Text>
        <Text style={s.runFootText} render={({ pageNumber }) => `${pageNumber}`} />
      </View>
    </>
  );
}

export default function KBPdfDoc({
  chapters, groups, meta, orgName, generatedOn, availableScreens, screenBase, screenSizes,
}: KBPdfProps) {
  const screens = new Set(availableScreens);
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const numberOf = new Map(chapters.map((c, i) => [c.id, i + 1]));

  return (
    <Document
      title={`${meta.title} — ${orgName}`}
      author="QuikScale"
      subject={meta.subtitle}
      keywords="QuikScale, Scaling Up, KPI, OPSP, Rockefeller Habits, user guide"
    >
      {/* ── Cover ── */}
      <Page size="A4" style={s.cover}>
        <View style={s.coverBand}>
          <Text style={s.coverEyebrow}>PERFORMANCE OS · USER MANUAL</Text>
          <Text style={s.coverTitle}>{meta.title}</Text>
          <Text style={s.coverSub}>{meta.subtitle}</Text>
        </View>
        <View style={s.coverBody}>
          <Text style={s.coverLead}>
            This manual documents every module of QuikScale, module by module and step by step —
            what each screen is for, how to use it, what every field and colour means, and how the
            modules connect into a single operating rhythm. It is written to be read front to back
            once, then used as a reference.
          </Text>
          <View style={s.coverPillarRow}>
            {PILLARS.map((p) => (
              <View key={p.name} style={[s.coverPillar, { borderTopColor: p.color }]}>
                <Text style={s.coverPillarName}>{p.name}</Text>
                <Text style={s.coverPillarDesc}>{p.desc}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.coverFootRow}>
          <Text style={s.coverFoot}>{orgName}</Text>
          <Text style={s.coverFoot}>{meta.edition} · Generated {generatedOn}</Text>
        </View>
      </Page>

      {/* ── How to use + contents ── */}
      <Page size="A4" style={s.page}>
        <Furniture chapterTitle="Contents" orgName={orgName} />

        <View style={s.chapterHead}>
          <Text style={s.chapterKicker}>ABOUT THIS MANUAL</Text>
          <Text style={s.chapterTitle}>How to use this guide</Text>
          <View style={s.chapterRule} />
        </View>

        <Text style={s.p}>
          The manual follows the shape of the application. It opens with the foundations —
          what QuikScale is, how to move around it, how the data grids behave and how the fiscal
          calendar works — because those four chapters make every later chapter shorter. It then
          works through the modules pillar by pillar in sidebar order, and closes with
          administration and reference material.
        </Text>
        <Text style={s.p}>
          Every module chapter follows the same pattern: what the module is for, a field-by-field
          reference, a numbered walkthrough of the common tasks, and the questions people actually
          ask. Boxes marked RULE describe behaviour that is fixed and deliberate; boxes marked
          CAREFUL flag the places where it is easy to lose work.
        </Text>
        <Text style={s.p}>
          Where a page shows a dashed SCREENSHOT PLACEHOLDER, that figure has not yet been captured
          for this installation. The placeholder describes exactly what the screenshot should show;
          adding the named PNG file to the application and regenerating this manual replaces it with
          the real image.
        </Text>

        <Text style={s.sectionTitle}>Contents</Text>
        {groups.map((g) => (
          <View key={g.label} wrap={false}>
            <Text style={s.tocGroup}>{g.label.toUpperCase()}</Text>
            {g.chapterIds.map((id) => {
              const ch = byId.get(id);
              if (!ch) return null;
              return (
                <View key={id} style={s.tocRow} wrap={false}>
                  <Text style={s.tocNum}>{String(numberOf.get(id)).padStart(2, "0")}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tocTitle}>{ch.title}</Text>
                    <Text style={s.tocSummary}>{ch.summary}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </Page>

      {/* ── Chapters ── */}
      {chapters.map((ch) => (
        <Page key={ch.id} size="A4" style={s.page}>
          <Furniture chapterTitle={ch.title} orgName={orgName} />

          <View style={s.chapterHead}>
            <Text style={s.chapterKicker}>
              {String(numberOf.get(ch.id)).padStart(2, "0")}
              {ch.pillar ? ` · ${ch.pillar.toUpperCase()}` : ""}
            </Text>
            <Text style={s.chapterTitle}>{ch.title}</Text>
            <Text style={s.chapterSummary}>{ch.summary}</Text>
            {ch.route ? (
              <Text style={[s.chapterSummary, { color: FAINT, fontSize: 9 }]}>
                In the app: {ch.route}
              </Text>
            ) : null}
            <View style={s.chapterRule} />
          </View>

          {ch.sections.map((sec) => (
            <View key={sec.id}>
              <Text style={s.sectionTitle}>{sec.title}</Text>
              {sec.blocks.map((b, i) => (
                <PdfBlock key={i} block={b} screens={screens} screenBase={screenBase} screenSizes={screenSizes} />
              ))}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}
