/**
 * JSON fetch helpers for React Query.
 * Always bypass the browser HTTP cache so list refetches after a mutation
 * see fresh data (masters GET routes use Cache-Control max-age).
 */

/**
 * Error thrown by the fetch helpers, carrying the HTTP status so the
 * React Query retry policy can branch on it (see app/providers.tsx —
 * 4xx is not retried, since retrying a 401/403/404 just hammers the
 * server with the same doomed request).
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new HttpError(await res.text(), res.status);
  return res.json();
}

export async function mutateJson<T>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new HttpError(err.error ?? "Request failed", res.status);
  }
  return res.json();
}
