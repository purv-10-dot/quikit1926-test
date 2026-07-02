/**
 * SEC-06: Content-Security-Policy builder.
 *
 * The previous static CSP allowed `'unsafe-inline'` in `script-src`, which
 * removed CSP as a backstop for the stored-XSS class (SEC-01). This builds a
 * per-request nonce-based policy instead: middleware puts the nonce on the CSP
 * *request* header so Next.js stamps it onto its own bootstrap scripts, and our
 * only manual inline scripts (JSON-LD) carry it too.
 *
 * `'strict-dynamic'` lets the nonce'd bootstrap load the rest of the app's
 * scripts; supporting browsers then ignore `'unsafe-inline'` in script-src.
 *
 * `'unsafe-eval'` is retained deliberately and documented (SEC-06 permits a
 * documented `unsafe-eval`): removing it risks breaking the lazy-loaded
 * rich-text editor. `style-src` keeps `'unsafe-inline'` because Tailwind /
 * styled-jsx emit inline styles; SEC-06 concerns script execution, not styles.
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Generate a base64 nonce using the Web Crypto API (Edge-runtime safe). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
