import sanitizeHtml from "sanitize-html";

/**
 * SEC-01: allow-list sanitizer for user-authored rich text (issue comments,
 * issue descriptions, help-panel articles, publicly-shared doc bodies) that is
 * rendered via `dangerouslySetInnerHTML`. It strips `<script>`, all event-handler
 * attributes (`onerror`/`onload`/`onclick`/…), `javascript:` URLs, and any
 * tag/attribute not on the allow-list, while preserving normal formatting.
 *
 * Isomorphic by design: `sanitize-html` is pure JS, so this runs safely in both
 * the SSR pass and the browser. Keep this module free of heavy/server-only
 * imports (unlike `lib/docs/import-to-html.ts`, which pulls in mammoth/marked)
 * so client components can import it without bloating the bundle.
 *
 * The allow-list mirrors `sanitizeDocHtml` so re-sanitizing already-sanitized
 * doc HTML at render time is idempotent (no formatting loss).
 */

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

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote",
    "ul", "ol", "li", "strong", "em", "u", "s", "del", "mark", "sub", "sup",
    "a", "img", "code", "pre", "span", "div", "kbd", "figure", "figcaption",
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
  transformTags: {
    b: "strong",
    i: "em",
    // Any link that survives gets safe rel to avoid reverse-tabnabbing.
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
  },
};

/**
 * Sanitize a rich-text HTML string for safe rendering. Returns `""` for
 * null/undefined/empty input.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, RICH_TEXT_OPTIONS);
}
