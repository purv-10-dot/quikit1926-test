'use client';
/**
 * Last-resort boundary: catches errors thrown by the ROOT layout itself (and by
 * `app/error.tsx`), which `app/error.tsx` cannot — it renders inside that
 * layout. Next requires this file to emit its own <html>/<body>, because it
 * REPLACES the root layout rather than nesting inside it.
 *
 * That replacement is also why everything here is inline-styled rather than
 * Tailwind: the root layout is what pulls in `globals.css` and the `next/font`
 * variables, and neither is guaranteed once it has been swapped out. Hardcoding
 * the values keeps this screen readable in exactly the situation it exists for.
 * The colours are copied from the `:root` defaults in `globals.css` so it still
 * looks like the product (untenanted — branding lives in a provider that is
 * gone by this point).
 *
 * In development Next's error overlay renders on top of this; it only becomes
 * user-visible in production.
 */
import { useEffect } from 'react';

const BRAND = '#4f46e5'; // --brand-primary default
const CANVAS = '#f7f8fa'; // rgb(247 248 250) — --bg
const SURFACE = '#ffffff';
const FG = '#111827'; // rgb(17 24 39) — --fg
const FG_MUTED = '#64748b'; // rgb(100 116 139) — --fg-muted
const LINE = '#e5e8ee'; // rgb(229 232 238) — --line
const DANGER = '#dc2626'; // rgb(220 38 38) — --danger

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/global-error] Root-level render error:', error, error.digest);
  }, [error]);

  const button: React.CSSProperties = {
    padding: '0.625rem 1.25rem',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          backgroundColor: CANVAS,
          color: FG,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '32rem',
            textAlign: 'center',
            backgroundColor: SURFACE,
            border: `1px solid ${LINE}`,
            borderRadius: '1.125rem',
            padding: '2rem',
            boxShadow: '0 12px 28px -6px rgb(17 24 39 / 0.16)',
          }}
        >
          <div
            style={{
              width: '3.5rem',
              height: '3.5rem',
              margin: '0 auto 1.5rem',
              borderRadius: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgb(254 226 226)',
              color: DANGER,
              fontSize: '1.75rem',
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            !
          </div>

          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 2rem', fontSize: '0.875rem', color: FG_MUTED }}>
            QuikLMS hit an unexpected error and could not finish loading.
            Try again, or return to the home page.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            <a
              href="/"
              style={{
                ...button,
                border: `1px solid ${LINE}`,
                backgroundColor: SURFACE,
                color: FG,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Go to Home
            </a>
            <button
              onClick={reset}
              style={{ ...button, border: `1px solid ${BRAND}`, backgroundColor: BRAND, color: '#fff' }}
            >
              Try again
            </button>
          </div>

          {/* The digest is the only handle support has on a production error —
              `message` is redacted by Next before it reaches the client. */}
          {error.digest && (
            <p style={{ margin: '1.5rem 0 0', fontSize: '0.75rem', color: FG_MUTED }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
