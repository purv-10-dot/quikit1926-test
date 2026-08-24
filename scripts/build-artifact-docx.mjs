#!/usr/bin/env node
/**
 * Render a published Artifact's HTML page to Word (.docx).
 *
 *   node scripts/build-artifact-docx.mjs <input.html> [output.docx]
 *
 * Companion to build-architecture-docx.mjs (which takes markdown). Uses the same
 * `docx` library — deliberately NOT html-to-docx, whose output does not open in Word.
 *
 * Understands the structural vocabulary the artifact pages use: masthead (.mast),
 * sections, headings, paragraphs, lists, pipe tables, formula blocks (.f with
 * .f-row / .f-lab / .f-val / .f-note), callouts (.note), stat tiles (.tiles) and
 * inline status chips. Anything unrecognised falls back to a plain paragraph so no
 * content is silently dropped.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { JSDOM } from "jsdom";
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
  Footer,
  PageNumber,
} from "docx";

// ---------------------------------------------------------------------------
// Config — mirrors the artifact's own palette so the Word file reads as the same doc
// ---------------------------------------------------------------------------

const MONO = "Consolas";
const BODY = "Calibri";
const SANS = "Calibri";
const ACCENT = "1B5A67";
const INK = "161C1E";
const INK_2 = "3D4A4D";
const INK_3 = "6C7B7E";
const CARD_BG = "F4F6F8";
const WASH = "E6EEEF";
const TH_BG = "E8EEF4";
const RULE = "DBE0DF";

const [, , inArg, outArg] = process.argv;
if (!inArg) {
  console.error("usage: node scripts/build-artifact-docx.mjs <input.html> [output.docx]");
  process.exit(1);
}
const IN = resolve(inArg);
const OUT = resolve(outArg ?? basename(IN).replace(/\.html?$/i, "") + ".docx");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const cellBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
};

const clean = (s) => s.replace(/\s+/g, " ");

/** Inline runs from a DOM node, honouring <strong>/<em>/<code>/.mono/.chip. */
function runs(node, inherited = {}) {
  const out = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const text = clean(child.textContent);
      if (text) out.push(new TextRun({ text, font: BODY, size: 21, color: INK, ...inherited }));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    const cls = child.getAttribute("class") ?? "";
    const next = { ...inherited };
    if (tag === "strong" || tag === "b") next.bold = true;
    if (tag === "em" || tag === "i") next.italics = true;
    if (tag === "code" || cls.includes("mono")) next.font = MONO;
    if (cls.includes("chip")) {
      next.bold = true;
      next.font = SANS;
    }
    if (tag === "br") {
      out.push(new TextRun({ break: 1 }));
      continue;
    }
    out.push(...runs(child, next));
  }
  return out;
}

const para = (children, opts = {}) =>
  new Paragraph({ spacing: { after: 140, line: 280 }, children, ...opts });

function textPara(node, opts = {}) {
  const children = runs(node);
  if (!children.length) return null;
  return para(children, opts);
}

function heading(node, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: 260, after: 120 },
    children: runs(node, { bold: true, color: ACCENT, font: SANS }),
  });
}

function kicker(node) {
  return new Paragraph({
    spacing: { before: 200, after: 40 },
    children: [
      new TextRun({
        text: clean(node.textContent).toUpperCase(),
        font: MONO,
        size: 16,
        bold: true,
        color: ACCENT,
      }),
    ],
  });
}

function labelHeading(node) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text: clean(node.textContent).toUpperCase(),
        font: MONO,
        size: 17,
        bold: true,
        color: INK_3,
      }),
    ],
  });
}

/** A 2-column shaded block used for .f (formula) and .note (callout). */
function boxRow(cells, { shading, borders = cellBorders } = {}) {
  return new TableRow({
    children: cells.map(
      (c) =>
        new TableCell({
          borders,
          shading: shading ? { type: ShadingType.CLEAR, fill: shading } : undefined,
          margins: { top: 90, bottom: 90, left: 140, right: 140 },
          width: c.width,
          children: c.children,
        }),
    ),
  });
}

function formulaBlock(el) {
  const rows = [];
  for (const row of el.querySelectorAll(".f-row")) {
    const isResult = row.classList.contains("res");
    const lab = row.querySelector(".f-lab");
    const val = row.querySelector(".f-val");
    rows.push(
      boxRow(
        [
          {
            width: { size: 26, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: clean(lab?.textContent ?? "").toUpperCase(),
                    font: MONO,
                    size: 16,
                    bold: true,
                    color: INK_3,
                  }),
                ],
              }),
            ],
          },
          {
            width: { size: 74, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: clean(val?.textContent ?? ""),
                    font: MONO,
                    size: isResult ? 24 : 21,
                    bold: isResult,
                    color: isResult ? ACCENT : INK,
                  }),
                ],
              }),
            ],
          },
        ],
        { shading: isResult ? WASH : "FFFFFF" },
      ),
    );
  }
  const note = el.querySelector(".f-note");
  if (note) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            borders: cellBorders,
            shading: { type: ShadingType.CLEAR, fill: CARD_BG },
            margins: { top: 90, bottom: 90, left: 140, right: 140 },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: runs(note, { size: 19, color: INK_2 }),
              }),
            ],
          }),
        ],
      }),
    );
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function noteBlock(el) {
  const children = [];
  for (const child of el.children) {
    const cls = child.getAttribute("class") ?? "";
    if (cls.includes("t")) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: runs(child, { bold: true, color: ACCENT, font: SANS }),
        }),
      );
    } else {
      children.push(new Paragraph({ spacing: { after: 0 }, children: runs(child) }));
    }
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: thinBorder,
              bottom: thinBorder,
              right: thinBorder,
              left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT },
            },
            shading: { type: ShadingType.CLEAR, fill: CARD_BG },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children,
          }),
        ],
      }),
    ],
  });
}

/** .tiles → a compact grid of value / label pairs, 4 per row. */
function tilesBlock(el) {
  const tiles = [...el.querySelectorAll(".tile")].map((t) => ({
    v: clean(t.querySelector(".v")?.textContent ?? ""),
    k: clean(t.querySelector(".k")?.textContent ?? ""),
  }));
  const perRow = 4;
  const rows = [];
  for (let i = 0; i < tiles.length; i += perRow) {
    const slice = tiles.slice(i, i + perRow);
    while (slice.length < perRow) slice.push({ v: "", k: "" });
    rows.push(
      new TableRow({
        children: slice.map(
          (t) =>
            new TableCell({
              borders: cellBorders,
              width: { size: 25, type: WidthType.PERCENTAGE },
              margins: { top: 110, bottom: 110, left: 130, right: 130 },
              children: [
                new Paragraph({
                  spacing: { after: 20 },
                  children: [
                    new TextRun({ text: t.v, font: SANS, size: 26, bold: true, color: INK }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: t.k.toUpperCase(),
                      font: MONO,
                      size: 15,
                      color: INK_3,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
    );
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function tableBlock(tableEl) {
  const rows = [];
  for (const tr of tableEl.querySelectorAll("tr")) {
    const cells = [...tr.children];
    if (!cells.length) continue;
    const isHead = cells[0].tagName.toLowerCase() === "th";
    const isTotal = tr.classList.contains("total");
    rows.push(
      new TableRow({
        tableHeader: isHead,
        children: cells.map((cell) => {
          const numeric = cell.classList.contains("n");
          return new TableCell({
            borders: cellBorders,
            shading: {
              type: ShadingType.CLEAR,
              fill: isHead ? TH_BG : isTotal ? CARD_BG : "FFFFFF",
            },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                alignment: numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: runs(cell, {
                  size: 19,
                  bold: isHead || isTotal || undefined,
                  font: numeric ? MONO : BODY,
                  color: isHead ? INK_2 : INK,
                }),
              }),
            ],
          });
        }),
      }),
    );
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function listBlock(el, ordered) {
  const out = [];
  let i = 1;
  for (const li of el.querySelectorAll(":scope > li")) {
    out.push(
      new Paragraph({
        spacing: { after: 90, line: 280 },
        indent: { left: 400, hanging: 220 },
        children: [
          new TextRun({ text: ordered ? `${i++}.  ` : "•  ", font: BODY, size: 21, color: ACCENT }),
          ...runs(li),
        ],
      }),
    );
  }
  return out;
}

const spacer = () => new Paragraph({ spacing: { after: 160 }, children: [] });

const divider = () =>
  new Paragraph({
    spacing: { before: 220, after: 220 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } },
    children: [],
  });

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

function render(node, out) {
  for (const el of node.children) {
    const tag = el.tagName.toLowerCase();
    const cls = el.getAttribute("class") ?? "";

    if (cls.includes("f-row") || cls.includes("f-note")) continue; // handled by parent

    if (cls.split(/\s+/).includes("f")) {
      out.push(formulaBlock(el), spacer());
      continue;
    }
    if (cls.split(/\s+/).includes("note")) {
      out.push(noteBlock(el), spacer());
      continue;
    }
    if (cls.includes("tiles")) {
      out.push(tilesBlock(el), spacer());
      continue;
    }
    if (cls.includes("kicker")) {
      out.push(kicker(el));
      continue;
    }

    switch (tag) {
      case "h1":
        out.push(
          new Paragraph({
            spacing: { after: 160 },
            children: runs(el, { bold: true, size: 48, color: ACCENT, font: SANS }),
          }),
        );
        break;
      case "h2":
        out.push(heading(el, HeadingLevel.HEADING_1));
        break;
      case "h3":
        out.push(heading(el, HeadingLevel.HEADING_2));
        break;
      case "h4":
        out.push(labelHeading(el));
        break;
      case "p": {
        const p = textPara(el);
        if (p) out.push(p);
        break;
      }
      case "ul":
        out.push(...listBlock(el, false));
        break;
      case "ol":
        out.push(...listBlock(el, true));
        break;
      case "table":
        out.push(tableBlock(el), spacer());
        break;
      case "hr":
        out.push(divider());
        break;
      case "nav":
        break; // the sidebar TOC — Word gets page-ordered content instead
      case "header":
      case "section":
      case "main":
      case "footer":
      case "div":
        render(el, out);
        break;
      default: {
        const text = clean(el.textContent);
        if (text) out.push(para([new TextRun({ text, font: BODY, size: 21, color: INK })]));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const dom = new JSDOM(readFileSync(IN, "utf8"));
const doc = dom.window.document;
const title = clean(doc.querySelector("title")?.textContent ?? basename(OUT, ".docx"));
const root = doc.querySelector(".wrap") ?? doc.body;

const children = [];

// Masthead — rendered by hand so the standfirst and meta line keep their own styling.
const mast = root.querySelector(".mast");
if (mast) {
  const eyebrow = mast.querySelector(".eyebrow");
  const h1 = mast.querySelector("h1");
  const standfirst = mast.querySelector(".standfirst");
  const meta = mast.querySelector(".meta");
  if (eyebrow) children.push(kicker(eyebrow));
  if (h1)
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: runs(h1, { bold: true, size: 46, color: ACCENT, font: SANS }),
      }),
    );
  if (standfirst)
    children.push(
      new Paragraph({
        spacing: { after: 160, line: 300 },
        children: runs(standfirst, { size: 23, color: INK_2 }),
      }),
    );
  if (meta)
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } },
        children: [
          new TextRun({
            text: [...meta.children].map((s) => clean(s.textContent)).join("     |     "),
            font: MONO,
            size: 16,
            color: INK_3,
          }),
        ],
      }),
    );
  children.push(spacer());
}

const main = root.querySelector("main") ?? root;
render(main, children);

const document_ = new Document({
  creator: "QuikScale",
  title,
  description: clean(root.querySelector(".standfirst")?.textContent ?? ""),
  styles: {
    default: {
      document: { run: { font: BODY, size: 21, color: INK } },
    },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `${title}  ·  `, font: MONO, size: 15, color: INK_3 }),
                new TextRun({ children: [PageNumber.CURRENT], font: MONO, size: 15, color: INK_3 }),
              ],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

mkdirSync(dirname(OUT), { recursive: true });
const buf = await Packer.toBuffer(document_);
writeFileSync(OUT, buf);
console.log(`wrote ${OUT} (${(buf.length / 1024).toFixed(1)} KB, ${children.length} blocks)`);
