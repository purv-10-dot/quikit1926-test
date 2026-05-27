/**
 * Tenant-scoped API client for E2E + API integration tests.
 *
 * Usage:
 *
 *   import { apiClient } from "./api-client";
 *
 *   const api = apiClient({ role: "project_manager" });
 *   const project = await api.post("/api/masters/projects", makeProject());
 *   await api.post(`/api/projects/${project.id}/boq/import`, makeBOQWorkbook());
 *
 * The client sends the test-role header the server respects in DEMO_MODE,
 * so every test can impersonate a specific role without wiring NextAuth.
 * Pass an idempotency key to replay-test mutating endpoints.
 */

export interface ApiClientOptions {
  baseUrl?: string;
  role?: string;                // x-test-role — e.g. "project_manager"
  tenantId?: string;            // x-test-tenant — default "default"
  userId?: string;              // x-test-user — default derived from role
  idempotencyKey?: string;
  extraHeaders?: Record<string, string>;
}

export interface ApiResponse<T = any> {
  status: number;
  ok: boolean;
  headers: Headers;
  body: T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
    public body: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiClient(opts: ApiClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? process.env.E2E_BASE_URL ?? "http://localhost:3010";

  function buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-e2e-test": "1",
    };
    if (opts.role) h["x-test-role"] = opts.role;
    if (opts.tenantId) h["x-test-tenant"] = opts.tenantId;
    if (opts.userId) h["x-test-user"] = opts.userId;
    if (opts.idempotencyKey) h["Idempotency-Key"] = opts.idempotencyKey;
    Object.assign(h, opts.extraHeaders ?? {}, extra ?? {});
    return h;
  }

  async function rawFetch<T>(
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<ApiResponse<T>> {
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: buildHeaders(init.headers),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    let body: any = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, ok: res.ok, headers: res.headers, body };
  }

  async function unwrap<T>(r: ApiResponse<T>): Promise<T> {
    if (!r.ok) {
      const msg = (r.body && (r.body as any).error) ?? `HTTP ${r.status}`;
      const code = (r.body && (r.body as any).code) ?? undefined;
      throw new ApiError(r.status, code, msg, r.body);
    }
    return r.body;
  }

  return {
    raw: rawFetch,
    async get<T = any>(path: string): Promise<T> {
      return unwrap(await rawFetch<T>("GET", path));
    },
    async post<T = any>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
      return unwrap(await rawFetch<T>("POST", path, { body, headers }));
    },
    async put<T = any>(path: string, body?: unknown): Promise<T> {
      return unwrap(await rawFetch<T>("PUT", path, { body }));
    },
    async patch<T = any>(path: string, body?: unknown): Promise<T> {
      return unwrap(await rawFetch<T>("PATCH", path, { body }));
    },
    async delete<T = any>(path: string): Promise<T> {
      return unwrap(await rawFetch<T>("DELETE", path));
    },
    /** Used for 4xx/5xx assertions — does NOT throw on non-2xx. */
    async expect<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
      return rawFetch<T>(method, path, { body });
    },
  };
}

export type ApiClient = ReturnType<typeof apiClient>;
