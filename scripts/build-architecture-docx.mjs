#!/usr/bin/env node
/**
 * Render a repo markdown document to Word (.docx).
 *
 * Built for `docs/17-ai-meeting-rhythm-architecture.md` so the architecture can be
 * circulated to the client and to non-engineering reviewers, but it takes any path:
 *
 *   node scripts/build-architecture-docx.mjs
 *   node scripts/build-architecture-docx.mjs docs/15-daily-huddle-weekly-report.md
 *   node scripts/build-architecture-docx.mjs docs/17-....md out/Arch.docx
 *
 * Uses the `docx` npm library (already a quikscale dependency, hoisted to the root
 * node_modules). We deliberately do NOT use `html-to-docx`: its output does not open
 * in Microsoft Word.
 *
 * Supported markdown: ATX headings, fenced code blocks, GFM pipe tables, blockquotes,
 * bullet/numbered lists, thematic breaks, and inline `code` / **bold** / *italic*.
 * Fenced blocks and the ASCII pipeline diagrams inside them are rendered in a
 * monospace style with shading so they survive the conversion intact — that matters
 * here because several of the diagrams ARE the architecture.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename, resolve } from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  TabStopType,
  Footer,
  PageNumber,
} from "docx";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MONO = "Consolas";
const BODY = "Calibri";
const ACCENT = "1F4E79"; // dark blue — headings
const CODE_BG = "F4F6F8";
const TH_BG = "E8EEF4";
const RULE = "C8CDD2";

const DEFAULT_IN = "docs/17-ai-meeting-rhythm-architecture.md";
const DEFAULT_OUT = "AI_Meeting_Rhythm_Architecture.docx";

const HEADING_FOR_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

// ---------------------------------------------------------------------------
// Inline markdown → TextRun[]
// ---------------------------------------------------------------------------

/**
 * Split inline markdown into runs. Handles `code`, **bold**, *italic* and __bold__.
 * Order matters: code first, so `**not bold**` inside backticks stays literal.
 */
function inlineRuns(text, base = {}) {
  const runs = [];
  // Tokenise on the four inline forms. Non-greedy, and code wins.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)/g;
  let last = 0;
  let m;

  const push = (value, extra) => {
    if (!value) return;
    runs.push(new TextRun({ text: value, font: BODY, size: 20, ...base, ...extra }));
  };

  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      runs.push(
        new TextRun({
          text: tok.slice(1, -1),
          font: MONO,
          size: 18,
          shading: { type: ShadingType.CLEAR, fill: CODE_BG },
          ...base,
        }),
      );
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      push(tok.slice(2, -2), { bold: true });
    } else {
      push(tok.slice(1, -1), { italics: true });
    }
    last = m.index + tok.length;
  }
  push(text.slice(last));

  return runs.length ? runs : [new TextRun({ text: "", font: BODY, size: 20, ...base })];
}

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

function codeBlock(lines) {
  // One paragraph per line keeps ASCII diagrams aligned; Word collapses a single
  // paragraph with soft breaks less predictably across versions.
  return lines.map(
    (line, i) =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", font: MONO, size: 16 })],
        spacing: { before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 120 : 0, line: 240 },
        shading: { type: ShadingType.CLEAR, fill: CODE_BG },
        indent: { left: 220 },
        keepLines: true,
        keepNext: i < lines.length - 1,
      }),
  );
}

function splitTableRow(line) {
  // Strip the outer pipes, then split on unescaped pipes.
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const isTableDivider = (line) => /^\|?[\s:-]*-{2,}[\s:|-]*\|?$/.test(line.trim()) && line.includes("-");

function buildTable(rows) {
  const [header, ...body] = rows;
  const colCount = Math.max(...rows.map((r) => r.length));

  const cell = (text, { head = false } = {}) =>
    new TableCell({
      children: [
        new Paragraph({
          children: inlineRuns(text, head ? { bold: true } : {}),
          spacing: { before: 40, after: 40 },
        }),
      ],
      shading: head ? { type: ShadingType.CLEAR, fill: TH_BG } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    });

  const pad = (r) => [...r, ...Array(colCount - r.length).fill("")];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: "autofit",
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: RULE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: pad(header).map((c) => cell(c, { head: true })),
      }),
      ...body.map((r) => new TableRow({ children: pad(r).map((c) => cell(c)) })),
    ],
  });
}

// ---------------------------------------------------------------------------
// Markdown → docx children
// ---------------------------------------------------------------------------

function convert(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // --- fenced code block ---------------------------------------------------
    if (/^```/.test(trimmed)) {
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      out.push(...codeBlock(buf));
      continue;
    }

    // --- pipe table ----------------------------------------------------------
    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const rows = [splitTableRow(lines[i])];
      i += 2; // header + divider
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        if (!isTableDivider(lines[i])) rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      out.push(buildTable(rows));
      out.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      continue;
    }

    // --- thematic break ------------------------------------------------------
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push(
        new Paragraph({
          text: "",
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } },
          spacing: { before: 160, after: 160 },
        }),
      );
      i += 1;
      continue;
    }

    // --- heading -------------------------------------------------------------
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      out.push(
        new Paragraph({
          heading: HEADING_FOR_LEVEL[level],
          children: inlineRuns(h[2].replace(/\s*#+\s*$/, ""), {
            bold: true,
            color: ACCENT,
            size: level === 1 ? 32 : level === 2 ? 26 : 22,
          }),
          spacing: { before: level <= 2 ? 320 : 200, after: 120 },
          pageBreakBefore: level === 1 && out.length > 0,
          keepNext: true,
        }),
      );
      i += 1;
      continue;
    }

    // --- blockquote ----------------------------------------------------------
    if (trimmed.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      // Blank quote lines separate paragraphs inside the quote.
      for (const chunk of buf.join("\n").split(/\n{2,}/)) {
        out.push(
          new Paragraph({
            children: inlineRuns(chunk.replace(/\n/g, " "), { italics: true }),
            indent: { left: 300 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
            spacing: { before: 60, after: 60 },
          }),
        );
      }
      continue;
    }

    // --- list ----------------------------------------------------------------
    const bullet = /^(\s*)([-*+])\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const m = bullet ?? numbered;
      const depth = Math.min(Math.floor(m[1].length / 2), 3);
      const marker = bullet ? "•" : `${m[2]}.`;
      out.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${marker}\t`, font: BODY, size: 20 }),
            ...inlineRuns(m[3]),
          ],
          indent: { left: 300 + depth * 300, hanging: 220 },
          tabStops: [{ type: TabStopType.LEFT, position: 300 + depth * 300 }],
          spacing: { before: 30, after: 30 },
        }),
      );
      i += 1;
      continue;
    }

    // --- blank ---------------------------------------------------------------
    if (trimmed === "") {
      i += 1;
      continue;
    }

    // --- paragraph (join soft-wrapped lines) ---------------------------------
    const buf = [line.trim()];
    i += 1;
    while (i < lines.length) {
      const nxt = lines[i];
      const t = nxt.trim();
      if (
        t === "" ||
        /^#{1,6}\s/.test(t) ||
        /^```/.test(t) ||
        t.startsWith("|") ||
        t.startsWith(">") ||
        /^(\s*)([-*+])\s+/.test(nxt) ||
        /^(\s*)\d+[.)]\s+/.test(nxt) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(t)
      ) {
        break;
      }
      buf.push(t);
      i += 1;
    }
    out.push(
      new Paragraph({
        children: inlineRuns(buf.join(" ")),
        spacing: { before: 60, after: 60, line: 276 },
        alignment: AlignmentType.LEFT,
      }),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const inPath = resolve(process.argv[2] ?? DEFAULT_IN);
const outPath = resolve(process.argv[3] ?? DEFAULT_OUT);

const markdown = readFileSync(inPath, "utf8");
const children = convert(markdown);

const doc = new Document({
  creator: "QuikIT — QuikScale",
  title: basename(inPath, ".md"),
  description: "AI Meeting Rhythm system architecture",
  styles: {
    default: {
      document: { run: { font: BODY, size: 20 } },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: ["Confidential — internal   ·   Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                  font: BODY,
                  size: 16,
                  color: "808080",
                }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);

const kb = (buffer.length / 1024).toFixed(0);
console.log(`✓ ${basename(inPath)} → ${outPath}`);
console.log(`  ${children.length} blocks · ${kb} KB`);
