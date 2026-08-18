/**
 * Browser-page fixtures for the UI audit phases (31–37).
 *
 * Every assertion in those phases has to survive three traps that are specific
 * to this app and are documented in CONVENTIONS.md:
 *
 *  1. `app/(shared)/[...slug]/page.tsx` renders HTTP 200 + a placeholder for ANY
 *     unmatched URL, so "the page loaded" is worth nothing. `expectRealPage()`
 *     therefore asserts a page-specific marker AND the absence of the scaffold.
 *  2. Route-group layouts enforce no roles (F-001), so a page must be loaded as
 *     its OWNING role or its XHRs 403 and it renders an empty shell that looks
 *     like a bug. `gotoAs()` takes the owner role explicitly.
 *  3. Every page except the two server components is a client component whose
 *     content only exists after its XHRs resolve. `gotoAs()` waits for
 *     networkidle before returning.
 *
 * `watch()` must be installed BEFORE navigation — console/pageerror/response
 * listeners do not replay.
 */

import { expect, type Page } from "@playwright/test";
import { storageStateFor, type RoleKey } from "./auth";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3016";

/** Text the catch-all scaffold renders. Its presence means the real page did not. */
export const SCAFFOLD_MARKER = /wired to its API and ready for UI build-out/i;

/** Visible strings that mean the page crashed rather than rendered. */
export const CRASH_MARKERS: RegExp[] = [
  /Application error: a client-side exception has occurred/i,
  /Unhandled Runtime Error/i,
  /This page could not be found/i,
  /Internal Server Error/i,
];

/**
 * Hydration mismatches are emitted by EVERY page in this app (see F-013): a
 * lucide-react `aria-hidden` server/client prop mismatch trips React's hydration
 * check in the root layout, so the whole document is re-rendered client-side.
 * It is one systemic defect, asserted once in phase 37 rather than 25 times, and
 * filtered out of the per-page console assertion so that genuine per-page errors
 * are not buried under it.
 */
export const HYDRATION_NOISE = [
  /Hydration failed because/i,
  /did not match\. Server:/i,
  /An error occurred during hydration/i,
  /There was an error while hydrating/i,
  /Text content does not match server-rendered HTML/i,
  /server rendered HTML didn't match the client/i,
];

export function isHydrationNoise(text: string): boolean {
  return HYDRATION_NOISE.some((re) => re.test(text));
}

export interface NetEvent {
  url: string;
  status: number;
}

export interface PageProbe {
  consoleErrors: string[];
  pageErrors: string[];
  /** Every /api/* response with status >= 400. */
  apiFailures: NetEvent[];
  /** Every /api/* response with status >= 500 — a page that renders on top of
   *  these is a finding even when the UI looks fine. */
  serverErrors: NetEvent[];
  /** Non-API responses >= 400 (chunks, static assets). */
  assetFailures: NetEvent[];
}

/** Install listeners on `page`. Call before `gotoAs`. */
export function watch(page: Page): PageProbe {
  const probe: PageProbe = {
    consoleErrors: [],
    pageErrors: [],
    apiFailures: [],
    serverErrors: [],
    assetFailures: [],
  };

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    probe.consoleErrors.push(msg.text().replace(/\s+/g, " ").slice(0, 300));
  });
  page.on("pageerror", (err) => {
    probe.pageErrors.push(String(err.message).replace(/\s+/g, " ").slice(0, 300));
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url().replace(BASE, "");
    // The dev server 404s on-demand-compiled HMR probes; never interesting.
    if (/\/_next\/(webpack-hmr|static\/development)/.test(url)) return;
    const evt = { url, status };
    if (url.startsWith("/api/")) {
      probe.apiFailures.push(evt);
      if (status >= 500) probe.serverErrors.push(evt);
    } else {
      probe.assetFailures.push(evt);
    }
  });

  return probe;
}

const cookieCache = new Map<RoleKey, Awaited<ReturnType<typeof storageStateFor>>["cookies"]>();

/** Navigate to `path` carrying `role`'s session, then wait for client XHRs. */
export async function gotoAs(
  page: Page,
  role: RoleKey,
  path: string,
  opts: { timeout?: number; idle?: number; settle?: number } = {},
): Promise<number> {
  if (!cookieCache.has(role)) {
    cookieCache.set(role, (await storageStateFor(role, BASE)).cookies);
  }
  await page.context().addCookies(cookieCache.get(role)!);

  // First compile of a cold App Router route regularly takes 20–40s on this app
  // (92 pages, dev server, no prebuilt output) — rule 8/9 in CONVENTIONS.md.
  const resp = await page.goto(BASE + path, {
    waitUntil: "domcontentloaded",
    timeout: opts.timeout ?? 90_000,
  });
  // networkidle is best-effort: a few pages hold an open socket/poll forever, so
  // a timeout here is not a failure — the explicit settle below covers them.
  await page.waitForLoadState("networkidle", { timeout: opts.idle ?? 20_000 }).catch(() => {});
  await page.waitForTimeout(opts.settle ?? 800);
  return resp?.status() ?? 0;
}

/** Whole-document visible text, normalised. */
export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => (document.body?.innerText ?? "").replace(/\s+/g, " ").trim());
}

/**
 * The core page assertion. Proves the REAL page rendered:
 *   - the owner-specific marker is visible (not merely present in HTML),
 *   - the catch-all scaffold is absent,
 *   - no crash overlay / error-boundary fallback,
 *   - the body is not empty.
 */
export async function expectRealPage(
  page: Page,
  opts: {
    /** A locator-based marker unique to this page. */
    heading?: { name: string | RegExp; level?: 1 | 2 | 3 };
    /** Fallback: text that must appear somewhere visible on the page. */
    text?: RegExp;
    path: string;
  },
): Promise<void> {
  if (opts.heading) {
    await expect(
      page.getByRole("heading", { name: opts.heading.name, level: opts.heading.level ?? 1 }).first(),
      `${opts.path}: page-specific <h${opts.heading.level ?? 1}> did not render`,
    ).toBeVisible({ timeout: 20_000 });
  }

  if (opts.text) {
    // Polled rather than snapshotted: several pages render their <h1> from
    // static JSX and the rest of the page only after two or three chained XHRs
    // resolve (`/audit` fires three), so a single read taken the instant
    // networkidle fires catches a "Loading…" body on a page that is fine.
    await expect
      .poll(() => bodyText(page), {
        message: `${opts.path}: page-specific content never appeared`,
        timeout: 25_000,
      })
      .toMatch(opts.text);
  }

  const text = await bodyText(page);

  expect(
    SCAFFOLD_MARKER.test(text),
    `${opts.path}: rendered the (shared)/[...slug] catch-all scaffold, not a real page`,
  ).toBe(false);

  for (const crash of CRASH_MARKERS) {
    expect(crash.test(text), `${opts.path}: rendered a crash state matching ${crash}`).toBe(false);
  }

  expect(text.length, `${opts.path}: <body> rendered empty`).toBeGreaterThan(40);
}

/** A page whose data XHRs 5xx is a finding even if the shell renders. */
export function expectNoServerErrors(probe: PageProbe, path: string): void {
  expect(
    probe.serverErrors,
    `${path}: XHR(s) returned 5xx while the page rendered — ` +
      JSON.stringify(probe.serverErrors),
  ).toEqual([]);
}

/** Console errors excluding the app-wide hydration mismatch (F-013). */
export function realConsoleErrors(probe: PageProbe): string[] {
  return [...probe.consoleErrors, ...probe.pageErrors].filter((t) => !isHydrationNoise(t));
}
