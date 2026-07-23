import type { ApiSuccess } from "@/lib/types/api";
import { managedFetch, type RequestOptions } from "@/lib/api-client";
import { clearClientSessionState } from "@/lib/auth/client-cleanup";

/**
 * Auth headers for an API call. Central QuikIT SSO uses an HttpOnly NextAuth
 * session cookie, which the browser sends automatically on same-origin
 * fetches — so production needs no auth header. Only the dev no-login flow
 * (never production) sends spoofable role headers for local API testing.
 */
function getAuthHeaders(): Record<string, string> {
  if (process.env.NODE_ENV === "production") return {};

  let roles = "admin";
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("hrms.roles");
    if (stored && stored.trim()) roles = stored.trim();
  }
  const primary = roles.split(",")[0]?.trim() || "employee";
  return {
    "x-tenant-id": "tenant_dev_001",
    "x-user-id": "user_dev_001",
    "x-user-roles": roles,
    "x-dev-role": primary,
  };
}

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status: number;
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function withBasePath(url: string): string {
  if (!BASE_PATH) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith(BASE_PATH)) return url;
  return `${BASE_PATH}${url.startsWith("/") ? url : `/${url}`}`;
}

/**
 * A 401 means the NextAuth session is missing/expired (e.g. the central
 * `auth:session` TTL elapsed and verifyJWT rejected the token). Clear all
 * client-held session state, then bounce to /login with `error=session_expired`
 * so the login page shows the "session has expired" message before re-auth.
 */
function handleSessionExpiry(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname.includes("/login")) return;
  clearClientSessionState();
  const next = encodeURIComponent(window.location.pathname.replace(BASE_PATH, "") || "/dashboard");
  window.location.href = withBasePath(`/login?error=session_expired&callbackUrl=${next}`);
}

async function apiFetch<T>(
  url: string,
  options?: RequestOptions,
  opts?: { skipContentType?: boolean },
): Promise<ApiSuccess<T>> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (!opts?.skipContentType) headers["Content-Type"] = "application/json";

  return managedFetch<ApiSuccess<T>>(withBasePath(url), { ...options, headers }, async (res) => {
    const data = await res.json();
    if (!data.success) {
      if (res.status === 401) handleSessionExpiry();
      throw new ApiError(
        data.error?.message ?? "Request failed",
        data.error?.code ?? "UNKNOWN",
        res.status,
        data.error?.details,
      );
    }
    return data as ApiSuccess<T>;
  });
}

async function apiDownload(url: string, fallbackName?: string): Promise<void> {
  // Downloads bypass dedup + return binary, but still go through fetch normally.
  const res = await fetch(withBasePath(url), { headers: getAuthHeaders() });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.error?.message ?? msg;
    } catch { /* not JSON */ }
    throw new ApiError(msg, "DOWNLOAD_FAILED", res.status);
  }

  const disp = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)/i.exec(disp);
  const name = match ? decodeURIComponent(match[1]) : (fallbackName ?? "download");

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

async function apiDownloadPost(url: string, body: unknown, fallbackName?: string): Promise<void> {
  // POST variant of apiDownload — sends a JSON body and downloads the binary response.
  const res = await fetch(withBasePath(url), {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.error?.message ?? msg;
    } catch { /* not JSON */ }
    throw new ApiError(msg, "DOWNLOAD_FAILED", res.status);
  }

  const disp = res.headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?["']?([^;"'\r\n]+)/i.exec(disp);
  const name = match ? decodeURIComponent(match[1]) : (fallbackName ?? "download");

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/** Fetch a binary response (with auth) and open it inline in a new tab. */
async function apiView(url: string): Promise<void> {
  const res = await fetch(withBasePath(url), { headers: getAuthHeaders() });
  if (!res.ok) {
    let msg = `Couldn't open file (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.error?.message ?? msg;
    } catch { /* not JSON */ }
    throw new ApiError(msg, "VIEW_FAILED", res.status);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const win = window.open(objectUrl, "_blank", "noopener,noreferrer");
  if (!win) window.location.href = objectUrl; // popup blocked → same tab
  // Keep the URL alive long enough for the new tab to load, then release it.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function useApiClient() {
  return {
    get: <T>(url: string) => apiFetch<T>(url),
    post: <T>(url: string, body: unknown) =>
      apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) }),
    put: <T>(url: string, body: unknown) =>
      apiFetch<T>(url, { method: "PUT", body: JSON.stringify(body) }),
    patch: <T>(url: string, body: unknown) =>
      apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
    delete: <T>(url: string) => apiFetch<T>(url, { method: "DELETE" }),
    upload: <T>(url: string, formData: FormData) =>
      // 5-minute timeout — a 100 MB video upload over a slow connection can
      // easily exceed the default 30s.
      apiFetch<T>(url, { method: "POST", body: formData, timeoutMs: 5 * 60_000 }, { skipContentType: true }),
    download: (url: string, filename?: string) => apiDownload(url, filename),
    downloadPost: (url: string, body: unknown, filename?: string) => apiDownloadPost(url, body, filename),
    view: (url: string) => apiView(url),
  };
}
