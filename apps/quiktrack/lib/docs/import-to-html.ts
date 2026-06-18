import mammoth from "mammoth";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Convert an uploaded document file into editor-ready HTML, then sanitize it.
 * Supported: .docx (Word), .md/.markdown, .html/.htm, .txt, .pdf (text-only).
 * Sanitization is mandatory because docs can be shared publicly — we strip
 * scripts, event handlers, iframes, etc.
 */

export class UnsupportedFileError extends Error {}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/**
 * Plain text / PDF-extracted text → HTML. There is no real formatting to
 * recover from raw text, so we apply light, conservative heuristics: detect
 * numbered section headings ("1 Executive Summary", "2.1 Vision") and bullet
 * lines, and treat everything else as paragraphs. Tables and inline styling
 * from a PDF cannot be reconstructed — that's a limitation of text extraction.
 */
function textToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listBuf: string[] = [];

  const flushList = () => {
    if (listBuf.length) {
      out.push(`<ul>${listBuf.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`);
      listBuf = [];
    }
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      flushList();
      continue;
    }
    // Bullet line: •, –, —, -, * followed by text.
    const bullet = /^[•▪◦–—*-]\s+(.+)$/.exec(t);
    if (bullet) {
      listBuf.push(bullet[1]);
      continue;
    }
    flushList();
    // Numbered section heading: "1 Title", "2.1 Title" — capitalized, short,
    // not a full sentence (no trailing period). Depth → heading level.
    const heading = /^(\d+(?:\.\d+){0,3})\.?\s+([A-Z][^.]{0,60})$/.exec(t);
    if (heading) {
      const level = Math.min(heading[1].split(".").length + 1, 6); // 1→h2, 1.1→h3
      out.push(`<h${level}>${escapeHtml(t)}</h${level}>`);
      continue;
    }
    // All-caps short line → minor heading.
    if (t.length <= 60 && t === t.toUpperCase() && /[A-Z]/.test(t)) {
      out.push(`<h3>${escapeHtml(t)}</h3>`);
      continue;
    }
    out.push(`<p>${escapeHtml(t)}</p>`);
  }
  flushList();
  return out.length ? out.join("") : "<p></p>";
}

function ext(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

/** The display title for the new doc, derived from the filename. */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return (base || "Imported doc").slice(0, 255);
}

export async function convertFileToHtml(buf: Buffer, filename: string): Promise<string> {
  switch (ext(filename)) {
    case "docx": {
      // mammoth embeds images as base64 data URIs by default — sanitize allows those.
      const result = await mammoth.convertToHtml({ buffer: buf });
      return result.value || "<p></p>";
    }
    case "md":
    case "markdown":
      return (await marked.parse(buf.toString("utf8"))) || "<p></p>";
    case "html":
    case "htm":
      return buf.toString("utf8") || "<p></p>";
    case "txt":
      return textToHtml(buf.toString("utf8"));
    case "pdf": {
      // Text-only extraction (formatting is lost). Import the lib's internal
      // path to avoid pdf-parse's debug block that reads a sample file on the
      // package entrypoint.
      // @ts-expect-error no type declarations for the subpath import
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
        b: Buffer,
      ) => Promise<{ text: string }>;
      const data = await pdfParse(buf);
      return textToHtml(data.text || "");
    }
    default:
      throw new UnsupportedFileError("Unsupported file type");
  }
}

// Presentational CSS properties we preserve so imported docs keep their look
// (fonts, sizes, spacing, indentation, table borders, list styles). Anything
// not listed — and any executable construct — is dropped by sanitize-html.
const ANY = [/.*/];
const STYLE_PROPS = [
  "color", "background", "background-color",
  "text-align", "text-decoration", "text-indent", "text-transform",
  "font", "font-size", "font-weight", "font-style", "font-family",
  "line-height", "letter-spacing",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
  "border", "border-top", "border-bottom", "border-left", "border-right",
  "border-color", "border-width", "border-style", "border-collapse", "border-radius",
  "width", "height", "max-width", "min-width",
  "vertical-align", "list-style", "list-style-type", "white-space",
];
const ALLOWED_STYLES = Object.fromEntries(STYLE_PROPS.map((p) => [p, ANY]));
const TABLE_ATTRS = [
  "width", "height", "border", "cellpadding", "cellspacing", "bgcolor",
  "style", "align", "valign", "colspan", "rowspan",
];

/**
 * Sanitize converted HTML. We keep presentational tags/attributes/styles so the
 * imported doc preserves its formatting (headings, bold/italic/underline,
 * lists, tables with borders, alignment, colors, spacing), while stripping
 * scripts, event handlers, and other executable/unsafe content — important
 * because docs can be shared publicly.
 *
 * Note: opening an imported doc in the editor still normalises it to the
 * editor's schema; the full formatting is preserved in the stored HTML and the
 * read-only / shared view.
 */
export function sanitizeDocHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote",
      "ul", "ol", "li", "strong", "em", "u", "s", "del", "mark", "sub", "sup",
      "a", "img", "code", "pre", "span", "div", "figure", "figcaption",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
    ],
    allowedAttributes: {
      "*": ["style", "class", "align", "valign"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style"],
      table: TABLE_ATTRS,
      tr: TABLE_ATTRS,
      td: TABLE_ATTRS,
      th: TABLE_ATTRS,
      col: ["span", "width", "style"],
      colgroup: ["span", "width", "style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedStyles: { "*": ALLOWED_STYLES },
    transformTags: { b: "strong", i: "em" },
  });
}
