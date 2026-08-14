"use client";

import dynamic from "next/dynamic";
import { SPEC_PATH } from "@/lib/api-docs";
import "swagger-ui-react/swagger-ui.css";

/**
 * Swagger UI reaches for `window` on import, so it can only load client-side.
 * It is also a heavy tree (~30 transitive deps: redux, immutable, syntax
 * highlighting), which this keeps in its own lazy chunk — nothing outside
 * /api-docs pays for it.
 *
 * Bundled from npm rather than pulled from a CDN on purpose: the CSP in
 * next.config.js is baked at build time and allows `script-src 'self'` /
 * `style-src 'self'`, so a self-hosted bundle needs no CSP change at all. A CDN
 * would need new origins in both directives — the exact kind of build-time
 * header change that has broken production here before.
 */
const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-gray-500">Loading API reference…</p>,
});

/**
 * Swagger UI hands its interceptor a plain object bag, not a DOM `Request`
 * (whose `credentials` is readonly and so could not be set at all). Its own
 * types model that as an open `{ [k: string]: any }`, which this narrows.
 */
type SwaggerRequest = { credentials?: RequestCredentials; [key: string]: unknown };

/**
 * Force same-origin credentials so the NextAuth session cookie rides along on
 * "Try it out" calls. Relies on `servers[0]` in docs/openapi.yaml being the
 * relative `/` entry — an absolute origin there makes these requests
 * cross-origin, at which point the cookie is dropped and the CSP `connect-src`
 * blocks them. Exported so that coupling is asserted in tests.
 */
export function sameOriginRequestInterceptor(req: SwaggerRequest): SwaggerRequest {
  req.credentials = "same-origin";
  return req;
}

export function ApiDocsViewer() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[var(--color-border)] px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900">QuikChat API reference</h1>
        <p className="mt-1 text-sm text-gray-500">
          Live spec from <code>docs/openapi.yaml</code>. You are signed in, so “Try it out” executes
          real requests against this deployment as your own user.
        </p>
      </header>

      {/* Non-dismissible on purpose. The most likely way this page misleads
          someone is a mobile dev watching "Try it out" succeed and concluding
          that auth is solved for React Native. It is not — that works only
          because a browser is attaching a cookie it already had. */}
      <div
        role="note"
        aria-label="Mobile authentication warning"
        className="border-b border-amber-200 bg-amber-50 px-6 py-4"
      >
        <p className="text-sm font-semibold text-amber-900">
          ⚠️ Mobile / native auth is UNRESOLVED — a working “Try it out” does not mean otherwise.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
          <li>
            Every endpoint here authenticates with a <strong>NextAuth session cookie</strong>. “Try
            it out” only works because your browser already holds one and is sending it on a
            same-origin request.
          </li>
          <li>
            <strong>No bearer-token, PKCE, or other non-cookie mechanism exists</strong> in
            <code> @quikit/auth</code> or in QuikChat today. A React Native client cannot reproduce
            what this page is doing by pasting a token.
          </li>
          <li>
            Treat every <code>security: [sessionCookie]</code> block as <strong>TBD in practice</strong>.
            The only validated mobile precedent in this monorepo is the Flutter cookie-jar bridge —
            see <code>docs/MOBILE_INTEGRATION_GUIDE.md</code> before designing the mobile auth flow.
          </li>
        </ul>
      </div>

      <SwaggerUI
        url={SPEC_PATH}
        docExpansion="list"
        deepLinking
        displayRequestDuration
        defaultModelsExpandDepth={-1}
        requestInterceptor={sameOriginRequestInterceptor}
      />
    </div>
  );
}
