/**
 * Prepend deploy basePath to a site-absolute path (e.g. "/api/...").
 * - Set NEXT_PUBLIC_BASE_PATH on the server (e.g. "/core") to enable.
 * - No-op when unset — local dev stays "/api/...".
 * - Passes through external URLs (http://...) and data: URIs unchanged.
 */
export function withBasePath(path: string | null | undefined): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!bp) return path;
  if (path.startsWith(bp + "/") || path === bp) return path;
  return `${bp}${path.startsWith("/") ? "" : "/"}${path}`;
}
