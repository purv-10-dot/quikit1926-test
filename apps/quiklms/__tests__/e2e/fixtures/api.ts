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

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3014";

/**
 * `timeout` sets the default per-request timeout for every call made through the
 * returned context, overriding the config's 15s `actionTimeout`. Pass it for
 * feature areas whose endpoints are legitimately slow against the dev server
 * (the `/api/course-assignments/*` lists, for example, run several seconds each
 * because they resolve every row's course with a separate query). Without it a
 * slow-but-correct response fails as a timeout and masks the assertion the test
 * was actually making.
 */
export async function apiAs(role: RoleKey, opts: { timeout?: number } = {}): Promise<APIRequestContext> {
  const token = await mintSessionToken(role);
  return request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Cookie: `next-auth.session-token=${token}` },
    ...(opts.timeout ? { timeout: opts.timeout } : {}),
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

/** The app's standard error envelope (lib/http.ts) — platform-standard shape. */
export interface ErrorEnvelope {
  success: false;
  error: string;
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
