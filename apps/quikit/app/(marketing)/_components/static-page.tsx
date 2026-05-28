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
 * Inject a "Log in" CTA into the baked-in marketing navbar (desktop
 * `.nav-actions` + mobile `.mobile-nav-cta`). The nav HTML is identical
 * across every _data/*.json page, so doing this once here covers all
 * pages and keeps the launcher URL in one configurable place rather than
 * mutating a dozen content blobs. Idempotent — skips if already present.
 */
function withLoginCta(html: string): string {
  if (html.includes('data-quikit-login')) return html;
  const desktopCta = `<a href="${LOGIN_URL}" data-quikit-login class="btn btn-ghost" style="margin-right:10px;">Log in</a>`;
  const mobileCta = `<a href="${LOGIN_URL}" data-quikit-login class="btn btn-primary mobile-nav-cta" style="margin-bottom:10px;">Log in</a>`;
  let out = html;
  // Desktop: prepend inside .nav-actions (before "Book a demo").
  out = out.replace(
    /<div class="nav-actions">/,
    `<div class="nav-actions">${desktopCta}`,
  );
  // Mobile: place a Log in button just before the mobile "Book a demo" CTA.
  out = out.replace(
    /(<a href="[^"]*" class="btn btn-primary mobile-nav-cta">)/,
    `${mobileCta}$1`,
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
