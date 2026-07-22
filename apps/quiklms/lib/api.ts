'use client';
const PUBLIC_PATHS = ['/login', '/verify-certificate', '/design'];

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  validationErrors?: { field: string; message: string }[];
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
      localStorage.removeItem('qs_role');
      window.location.href = '/login';
      return null as T;
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw data as ApiError;
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
