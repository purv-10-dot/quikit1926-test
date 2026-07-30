'use client';
/**
 * Route-level error boundary — the App Router replacement for the old
 * frontend's `src/components/ErrorBoundary.tsx`, which wrapped every route in
 * `App.tsx`. Without a file at this path an uncaught render error anywhere in
 * the tree drops the user on Next's unstyled default screen, which in
 * production is a bare "Application error: a client-side exception has
 * occurred" with no way back into the app.
 *
 * It sits INSIDE the root layout, so `Providers` (and therefore the branding
 * CSS vars and the current user) are still mounted around it — the same
 * arrangement `app/not-found.tsx` relies on, and the reason the styling below
 * can use the normal design tokens.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useCurrentUser, useFeatures } from './providers';
import { landingPathFor } from '@/lib/auth/landing';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Mirrors the old boundary's `componentDidCatch` logging. `digest` is the
  // server-side hash Next puts in the build logs, so it is what makes a user's
  // screenshot traceable in production, where `message` is redacted.
  useEffect(() => {
    console.error('[app/error] Uncaught render error:', error, error.digest);
  }, [error]);

  // Same resolver `not-found.tsx` uses, so a SCHOOL tenant admin is sent to
  // /school-dashboard rather than the corporate one. These contexts have
  // defaults, so they stay safe even if the error came from inside a provider.
  const { user } = useCurrentUser();
  const { tenantType } = useFeatures();
  const dashboard = user?.role ? landingPathFor(user.role, tenantType) : '/login';

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-lg text-center">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10">
          <AlertTriangle className="h-7 w-7 text-danger" />
        </div>

        <h1 className="font-display text-2xl font-semibold text-fg mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-fg-muted mb-8">
          An unexpected error occurred. Trying again usually clears it — if it
          keeps happening, head back to your dashboard.
        </p>

        {/* Dev-only detail, matching the old boundary. In production the
            message is a redacted placeholder, so showing it would only be
            noise. */}
        {process.env.NODE_ENV === 'development' && (
          <pre className="mb-6 max-h-40 overflow-auto rounded-xl border border-line bg-surface p-3 text-left text-xs text-danger">
            {error.message}
          </pre>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={dashboard}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg transition-all hover:bg-canvas active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            {user ? 'Go to Dashboard' : 'Go to Sign In'}
          </Link>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
