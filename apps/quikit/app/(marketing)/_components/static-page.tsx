import Script from "next/script";
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
 * Launcher login URL. The marketing site is auth-less; its "Log in" CTA
 * deep-links into the QuikIT launcher's existing /login (NextAuth + SSO).
 * Configurable per-deploy via NEXT_PUBLIC_LOGIN_URL.
 */
const LOGIN_URL =
  process.env.NEXT_PUBLIC_LOGIN_URL ?? "https://quik-it-auth.vercel.app/login";

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
