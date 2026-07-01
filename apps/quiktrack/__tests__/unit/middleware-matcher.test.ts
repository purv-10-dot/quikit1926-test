import { describe, it, expect } from "vitest";
import { config } from "../../middleware";

/**
 * Regression test for the landing-page image bug (same class as quikscale).
 *
 * The marketing landing serves hero/logo/gradient PNGs from the site root via
 * plain <img> tags and CSS url() (not next/image). If the middleware matcher
 * covers those requests, the auth factory intercepts and redirects them, so
 * the browser receives HTML instead of image bytes and every image fails.
 *
 * The matcher must therefore EXCLUDE any static file (path containing a dot)
 * while STILL covering app routes so auth stays enforced.
 */

// Next.js compiles config.matcher[0] into an anchored regex. Reconstruct the
// equivalent RegExp so we can assert which paths middleware runs on.
const pattern = config.matcher[0];
const matcher = new RegExp(`^${pattern}$`);

describe("middleware matcher", () => {
  it.each([
    "/HEro BG.png",
    "/logo.png",
    "/moreyeahs-logo.png",
    "/gradient_1920x1080 (29).png",
    "/marketing/logo.png",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/api/health",
  ])("excludes static asset / infra path %s", (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it.each(["/dashboard", "/timesheet", "/"])(
    "still covers app route %s (auth enforced)",
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );
});
