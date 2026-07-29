import Link from 'next/link';
import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';

/**
 * `/reset-password` — informational, NOT a password form.
 *
 * This page used to render a full old/new/confirm form that POSTed to
 * `/api/auth/change-password`. Under centralized auth that endpoint
 * unconditionally throws 400 ("Password changes are managed by central
 * sign-in"), because a QuikLMS SSO session holds no local password to change —
 * credentials live on `auth.User` and are owned by the QuikIT auth service
 * (baseline §2/§7). So the form could never succeed: every submission walked
 * the user through three fields and a validation pass to reach a guaranteed
 * error.
 *
 * The route is kept rather than deleted — it is linked from the shared shell
 * and asserted by `__tests__/e2e/ui/phase36-shared-pages.spec.ts` — but it now
 * tells the truth and points at the place that can actually do the job.
 */
export default function ResetPasswordPage() {
  const authUrl = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link
        href="/profile"
        className="mb-6 inline-flex items-center gap-2 text-sm text-fg-muted transition hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      <h1 className="text-2xl font-semibold text-fg">Reset Password</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        Your password is managed by your QuikIT account, which is the single
        sign-in shared across every QuikIT application. Changing it here is not
        possible — and changing it centrally updates it everywhere at once.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">Change it in QuikIT account settings</h2>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              You will be asked to confirm your current password there. Once
              saved, use the new password the next time you sign in to QuikSkill.
            </p>

            {authUrl ? (
              <a
                href={`${authUrl}/login`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-700"
              >
                Open account settings
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : (
              // No central host configured (local bring-up) — don't render a
              // link to nowhere.
              <p className="mt-4 text-sm text-fg-muted">
                Contact your administrator for the QuikIT sign-in address.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
