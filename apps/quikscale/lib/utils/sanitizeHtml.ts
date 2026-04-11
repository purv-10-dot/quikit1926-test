/**
 * Allowlist-based HTML sanitizer for OPSP rich-text fields.
 *
 * The OPSP form stores narrative fields (coreValues, purpose, bhag, etc.) as
 * HTML strings produced by a `contentEditable` editor. At render time the
 * page passes those strings through `dangerouslySetInnerHTML`, which is
 * low-risk because it is self-XSS (only the editing user sees their own
 * content), but §7 item 5 in code-analysis-full.md flagged it as a debt we
 * should not leave unowned.
 *
 * Scope: pure, synchronous, dependency-free. Tag/attribute allowlist tuned
 * to the formatting surface the editor actually exposes:
 *   - block tags:  p, div, br, ul, ol, li, blockquote, h1-h6
 *   - inline tags: strong, b, em, i, u, s, strike, span, code
 *   - no links, no images, no scripts, no event handlers, no style attrs
 *   - `class` is allowed so prose-preview CSS keeps working
 *
 * Anything outside the allowlist is stripped to its inner text. Dangerous
 * constructs (`javascript:` URLs, `on*=` attributes, `<script>`, etc.) are
 * removed defensively even though they would already be dropped by the
 * allowlist.
 *
 * This is not a replacement for DOMPurify — it's a targeted filter for a
 * known-shape input surface. If the editor gains new features, extend the
 * allowlist here and add corresponding test cases.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "div",
  "br",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "code",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);

const ALLOWED_ATTRS = new Set(["class"]);

/** Tags that are always dangerous and get their whole subtree dropped. */
const DROP_ENTIRELY = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "option",
]);

/**
 * Sanitize an untrusted HTML fragment.
 *
 * Returns an empty string for null/undefined/non-string input so callers can
 * safely pass it to `dangerouslySetInnerHTML={{ __html: sanitizeHtml(v) }}`.
 */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) return "";

  // Step 1: remove whole subtrees for always-dangerous tags, including open tags
  // with arbitrary attributes and case variants.
  let html = input;
  for (const tag of DROP_ENTIRELY) {
    const openClose = new RegExp(
      `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`,
      "gi",
    );
    const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    html = html.replace(openClose, "").replace(selfClosing, "");
  }

  // Step 2: walk every element; keep allowed ones (attribute-scrubbed),
  // strip unknown ones to inner text. We use regex-based tokenization
  // because the sanitizer must run in edge/node without DOMParser.
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

  return html.replace(tagRe, (match, rawName: string, rawAttrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";

    const isClose = match.startsWith("</");
    if (isClose) return `</${name}>`;

    const attrs = scrubAttributes(rawAttrs);
    return attrs.length > 0 ? `<${name} ${attrs}>` : `<${name}>`;
  });
}

/**
 * Parse an attribute string and return only the allowed attributes with
 * safe values. Drops anything with a `javascript:` / `data:` URL, any
 * `on*` event handler, and anything not in the allowlist.
 */
function scrubAttributes(raw: string): string {
  if (!raw) return "";
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  const kept: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) continue;
    if (name.startsWith("on")) continue; // defensive — shouldn't reach here
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    if (/javascript:/i.test(value) || /data:/i.test(value)) continue;
    // Escape any embedded double quotes in the value.
    const escaped = value.replace(/"/g, "&quot;");
    kept.push(`${name}="${escaped}"`);
  }
  return kept.join(" ");
}
