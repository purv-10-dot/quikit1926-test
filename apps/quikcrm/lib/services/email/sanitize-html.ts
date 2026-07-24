/**
 * Minimal, dependency-free HTML sanitizer for rendering INBOUND email bodies.
 *
 * Provider email HTML is untrusted user content — rendering it verbatim would
 * be a stored-XSS vector. The app CLAUDE.md forbids adding a sanitizer dep
 * (DOMPurify etc.), so this applies a conservative denylist that removes the
 * dangerous surface:
 *   - <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>, <base>
 *   - on* event-handler attributes (onclick, onerror, …)
 *   - javascript:/vbscript:/data: URIs in href/src
 *   - <form> and form controls
 *
 * This is intentionally strict rather than clever: when in doubt it strips.
 * It runs on the server before the body is returned to the Emails tab.
 *
 * NOTE (see TODO in the production checklist): for defense-in-depth, inbound
 * bodies should ideally also be rendered inside a sandboxed iframe. This
 * sanitizer is the baseline guard, not the only one intended long-term.
 */

const BLOCK_TAGS = [
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
  "button",
  "textarea",
  "select",
  "option",
];

export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  let out = html;

  // Remove dangerous elements INCLUDING their content (script/style/etc.).
  for (const tag of BLOCK_TAGS) {
    const withContent = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    out = out.replace(withContent, "").replace(selfClosing, "");
  }

  // Strip inline event handlers: on*="..." / on*='...' / on*=unquoted.
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize dangerous URI schemes in href/src.
  out = out.replace(
    /\s(href|src)\s*=\s*("|')?\s*(javascript|vbscript|data):[^"'\s>]*("|')?/gi,
    ' $1="#"',
  );

  // Drop style attributes containing expression()/url(javascript:).
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, (m) =>
    /expression\s*\(|javascript:/i.test(m) ? "" : m,
  );

  return out;
}
