/**
 * Thin fetch wrapper all api/*.ts files use.
 *
 * WIRING GUIDE FOR THE BACKEND DEVELOPER:
 * - Set NEXT_PUBLIC_API_BASE_URL in .env.local to your real API's base URL.
 * - Set NEXT_PUBLIC_USE_MOCK_DATA=false once endpoints are ready.
 * - Each function in lib/api/*.ts currently branches on USE_MOCK_DATA and
 *   returns data from lib/mock/*.ts when true. Replace the mock branch's
 *   contents with a real call to apiFetch(...) — the shape to return is
 *   already defined by the TypeScript types in src/types, so once the
 *   real fetch resolves to that same shape, no component code needs to change.
 */

export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL is not set. Set it in .env.local, or leave NEXT_PUBLIC_USE_MOCK_DATA=true while developing.`
    );
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed with ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}
