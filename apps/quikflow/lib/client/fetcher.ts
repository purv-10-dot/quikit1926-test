import type { ApiResult } from "@/types";

/**
 * Client-side fetch helper for QuikFlow API routes. Unwraps the standard
 * `{ success, data }` envelope and throws on failure so react-query surfaces
 * the error state.
 */
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const json = (await res.json()) as ApiResult<T>;
  if (!res.ok || !json.success) {
    throw new Error(json.success ? `Request failed (${res.status})` : json.error);
  }
  return json.data;
}

/** POST/PATCH/PUT/DELETE helper with a JSON body. */
export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResult<T>;
  if (!res.ok || !json.success) {
    throw new Error(json.success ? `Request failed (${res.status})` : json.error);
  }
  return json.data;
}
