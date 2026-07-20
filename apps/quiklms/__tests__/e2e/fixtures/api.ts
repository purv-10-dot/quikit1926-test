/**
 * Authenticated API client helpers.
 *
 * `apiAs(role)` returns a Playwright APIRequestContext already carrying that
 * role's session cookie, so a spec can do:
 *     const admin = await apiAs('tenantAdmin');
 *     const res = await admin.get('/api/courses');
 */

import { request, type APIRequestContext } from "@playwright/test";
import { mintSessionToken, type RoleKey } from "./auth";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3020";

export async function apiAs(role: RoleKey): Promise<APIRequestContext> {
  const token = await mintSessionToken(role);
  return request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: `next-auth.session-token=${token}` },
  });
}

/** An unauthenticated client — for testing that guards actually reject. */
export async function apiAnon(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE });
}

/** A client carrying a structurally valid but forged/garbage token. */
export async function apiWithBadToken(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: "next-auth.session-token=not-a-real-jwe.token.value" },
  });
}

/** The app's standard error envelope (lib/http.ts). */
export interface ErrorEnvelope {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  requestId: string;
  message?: string;
  error?: string;
  validationErrors?: Array<{ field: string; message: string }>;
}

/** Parse a response body as JSON, tolerating HTML/empty error pages. */
export async function safeJson(res: { text(): Promise<string> }): Promise<unknown> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    return { __nonJson: true, preview: raw.slice(0, 200) };
  }
}
