/**
 * GET /api/v1/docs — the Scalar API reference UI for the QuikTrack API.
 *
 * We render our OWN minimal HTML shell rather than @scalar/nextjs-api-reference's
 * ApiReference() helper, because that helper hardcodes `<title>Scalar API
 * Reference</title>` and ships no favicon — so the tab showed Scalar's name and
 * icon, and flashed to ours only after the client hydrated. Owning the shell
 * lets us set the correct <title> and the app favicon from the first byte.
 *
 * Served under /api/ on purpose: the app middleware matcher excludes /api/, so
 * this page is (a) public — a partner can open it without a session — and
 * (b) free of the strict nonce CSP the rest of the app enforces, so Scalar's
 * CDN bundle loads without CSP wiring. Every endpoint it lets you "Try it"
 * against still requires the Bearer token from POST /api/v1/token.
 *
 * Share this URL with API consumers: https://<host>/api/v1/docs
 */

const PAGE_TITLE = "QuikTrack API Reference";
const FAVICON = "/icon.svg";

// Stable, tested CDN build. "latest" recently added an Ask-AI / Deploy /
// Generate-MCP toolbar we don't want; this is the version
// @scalar/nextjs-api-reference targets and renders a clean, reference-only UI.
const CDN = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.89";

// Hide Scalar's own branding so the page reads as the QuikTrack reference
// rather than a Scalar demo. (MIT license permits this.)
const customCss = `
  .scalar-app .scalar-footer,
  .scalar-footer,
  [class*="powered-by"],
  a[href*="scalar.com"] { display: none !important; }
`;

const configuration = {
  _integration: "nextjs",
  spec: { url: "/api/v1/openapi.json" },
  authentication: { preferredSecurityScheme: "bearerAuth" },
  customCss,
};

// Scalar reads the config from a JSON <script>; it expects the double quotes
// HTML-escaped (mirrors what ApiReference() does internally).
const configString = JSON.stringify(configuration).split('"').join("&quot;");

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${PAGE_TITLE}</title>
    <link rel="icon" href="${FAVICON}" type="image/svg+xml">
  </head>
  <body>
    <script id="api-reference" type="application/json" data-configuration="${configString}"></script>
    <script src="${CDN}"></script>
  </body>
</html>`;

export function GET(): Response {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
