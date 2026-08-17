'use client';
// Routes that render for signed-OUT visitors. A 401 on one of these is the
// expected answer, not a dead session, so the hard nav to /login below must not
// fire — `/login` re-initiates SSO on mount and would drag the visitor into
// quikit-auth.
//
// `/` is the public marketing landing, and it is where global sign-out returns
// the user (see lib/global-signout.ts). Omitting it is what made logout look
// broken: the landing rendered correctly with `?reason=logged_out`, then the
// root providers' `/api/me` + `/api/tenants/current(/features)` calls 401'd a
// beat later and bounced the just-signed-out user to /login → quikit-auth.
// Matching below is `p === x || p.startsWith(`${x}/`)`, so `/` only ever
// matches the root exactly — it does not make every route public.
const PUBLIC_PATHS = ['/', '/login', '/verify-certificate', '/design'];

/**
 * Thrown for any non-2xx response. `status` comes from the transport layer's
 * own `res.status` — never re-derived from the body — which is the one place
 * this number cannot drift from what the server actually sent.
 *
 * `statusCode` is a temporary, IN-MEMORY-ONLY alias (never serialized to the
 * wire — it's a property on the thrown JS object, not a response body field)
 * kept so existing `.statusCode` readers migrate on their own schedule.
 * @deprecated read `.status`, not `.statusCode`. Remove once a repo-wide grep
 * for `.statusCode` outside `lib/http.ts`'s own internal (caught-error) uses
 * comes back empty.
 */
export class ApiClientError extends Error {
  status: number;
  /** Alias of `.message` — kept for call sites that read `.error`. */
  error: string;
  /** @deprecated alias of `.status` — see class doc comment. */
  statusCode: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.error = message;
    this.statusCode = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    credentials: 'include',
    headers: isForm ? undefined : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    const p = window.location.pathname;
    const isPublic = PUBLIC_PATHS.some((x) => p === x || p.startsWith(`${x}/`));
    if (!isPublic) {
      // Session expired / revoked → re-authenticate through centralized SSO.
      window.location.href = '/login';
      return null as T;
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
      ? data.error
      : 'Request failed';
    throw new ApiClientError(res.status, message);
  }
  return data as T;
}

type Params = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, params?: Params): string {
  if (!params) return path;
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string | number | boolean][];
  if (!entries.length) return path;
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
  return path + (path.includes('?') ? '&' : '?') + qs;
}

export const api = {
  get: <T>(path: string, opts?: { params?: Params }) => request<T>('GET', buildUrl(path, opts?.params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
