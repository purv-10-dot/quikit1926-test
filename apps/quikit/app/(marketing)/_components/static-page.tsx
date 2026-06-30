import Script from "next/script";
import { buildLoginUrl } from "@quikit/shared/login-url";
import { getPageSchemas } from "../_lib/schema";

export type StaticPageData = {
  route: string;
  slug: string;
  title: string;
  styleText: string;
  bodyHtml: string;
  scripts: string[];
};

/**
 * Launcher login URL. Marketing is auth-less; its "Log in" CTA redirects
 * to the central auth app (`NEXT_PUBLIC_AUTH_URL/login`) carrying a
 * `callbackUrl` so successful sign-in returns the user to the launcher
 * `/apps` page on this app's own origin.
 *
 * The previous in-page modal (login-modal.tsx) is retired — every sub-app
 * now uses the same auth-app-driven login flow for parity, and the
 * auth app's `redirect` callback allow-lists the launcher origin so the
 * round-trip works.
 */
const LOGIN_URL = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
  postLoginPath: "/apps",
});

/**
 * Turn the marketing navbar's single primary CTA into "Get Started →" pointing
 * at the central login (which then offers "Sign up" → self-serve registration).
 * The baked-in blobs ship a "Book a demo → /contact" primary button in both the
 * desktop `.nav-actions` and the mobile `.mobile-nav-cta`; we swap both for one
 * "Get Started →" button. The nav HTML is identical across every _data/*.json
 * page, so doing this once here covers all pages rather than mutating a dozen
 * content blobs. Idempotent — skips if already transformed. The hero
 * "Get In Touch / Book a demo" buttons (btn-outline) are left unchanged.
 */
function withLoginCta(html: string): string {
  if (html.includes("data-quikit-login")) return html;
  const getStarted = `<a href="${LOGIN_URL}" data-quikit-login class="btn btn-primary">Get Started →</a>`;
  const getStartedMobile = `<a href="${LOGIN_URL}" data-quikit-login class="btn btn-primary mobile-nav-cta">Get Started →</a>`;
  let out = html;
  // Mobile primary CTA first (more specific selector), then desktop.
  out = out.replace(
    /<a [^>]*class="btn btn-primary mobile-nav-cta">Book a demo[^<]*<\/a>/,
    getStartedMobile,
  );
  out = out.replace(
    /<a [^>]*class="btn btn-primary">Book a demo[^<]*<\/a>/,
    getStarted,
  );
  return out;
}

export function StaticPage({ page }: { page: StaticPageData }) {
  const schemas = getPageSchemas(page.slug);
  const bodyHtml = withLoginCta(page.bodyHtml);
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={`${page.slug}-jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <style dangerouslySetInnerHTML={{ __html: page.styleText }} />
      <main dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      {page.scripts.map((script, index) => (
        <Script
          id={`${page.slug}-script-${index}`}
          key={`${page.slug}-script-${index}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ))}
    </>
  );
}
