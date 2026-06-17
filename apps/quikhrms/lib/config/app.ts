/**
 * Centralized app URL/config.
 * Use this instead of hardcoding URLs anywhere.
 */

function stripTrailingSlash(u: string): string {
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

function resolveAppUrl(): string {
  const onVercel = Boolean(process.env.VERCEL_URL);
  const isLocal = (u: string) => /localhost|127\.0\.0\.1/.test(u);

  // Prefer explicit env, but on Vercel ignore any stale localhost value that
  // may have been copied from a local .env — so prod never emits a local URL.
  const explicit = [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL]
    .filter((u): u is string => Boolean(u))
    .filter((u) => !(onVercel && isLocal(u)));

  const fromEnv =
    explicit[0] ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    `http://localhost:${process.env.PORT ?? 3000}`;
  return stripTrailingSlash(fromEnv);
}

export const APP_URL = resolveAppUrl();

/** Build an absolute URL from a relative path. */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${APP_URL}${p}`;
}
