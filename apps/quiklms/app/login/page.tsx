'use client';

import { useSession } from 'next-auth/react';
import { buildLoginUrl } from '@quikit/shared/login-url';
import { globalSignOut } from '@/lib/global-signout';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * SSO entry point. Replaces the old dev `/role-select` picker: unauthenticated
 * users are bounced to the central QuikAuth login via the shared post-login
 * bridge (`buildLoginUrl` → `${AUTH_URL}/api/post-login` → this app's
 * `/auth-handoff`), exactly like quikscale / quikinfra; authenticated users are
 * routed to the app root, which redirects to their role landing (see
 * app/(marketing)/page.tsx).
 *
 * Why the bridge and NOT `signIn('quikit')` (the OAuth authorize flow): the
 * authorize endpoint enforces app access at the IdP and redirects a user who
 * lacks QuikLMS to the launcher `/apps`. The bridge instead mints a session for
 * any authenticated user and lets THIS app's own access gate (the role-group
 * layouts' `requirePageRoles` → `hasCentralAppAccess`) bounce a denied user to
 * `/?reason=no_app_access`, where the AppAccessDeniedPopup shows — the same
 * "stay on the landing + popup" behaviour every other QuikIT app has. The
 * bridge honours this app's return origin only if it is on the auth host's
 * allow-list (`AUTH_ALLOWED_RETURN_ORIGINS` — QuikLMS's origin must be listed,
 * or the callback is dropped and the user lands on the launcher instead).
 *
 * INVITE-LINK GUARD: invitation emails link here with `?email=<invitee>`. If a
 * DIFFERENT user is already signed in — e.g. the super admin who sent the invite
 * clicks the link in their own browser — silently bouncing to `/` would resolve
 * *their* role and dump them on the wrong dashboard (the "school admin lands on
 * the super-admin dashboard" report). Identity is owned by the central IdP, so
 * a plain local sign-out + re-`signIn` would just SSO the same person back in;
 * we must run the platform single-logout (auth-host → launcher) to actually
 * switch accounts. We detect the mismatch, stop the auto-redirect, and offer
 * that full sign-out.
 */

function normalizeEmail(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

function Redirecting() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Redirecting to sign-in…</p>
    </div>
  );
}

function LoginInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signingOut, setSigningOut] = useState(false);

  const invitedEmail = normalizeEmail(searchParams.get('email'));
  const currentEmail = normalizeEmail(session?.user?.email);

  // Signed in as someone other than the invited address → don't auto-redirect.
  const mismatch =
    status === 'authenticated' &&
    invitedEmail !== '' &&
    currentEmail !== '' &&
    invitedEmail !== currentEmail;

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Bounce to the central login through the post-login bridge, returning to
      // this app's root ('/') afterwards — the landing then routes the user to
      // their role dashboard, or (when they lack QuikLMS access) to the
      // access-denied popup. Mirrors quikscale/quikinfra's buildLoginUrl CTA.
      const appUrl =
        (process.env.NEXT_PUBLIC_QUIKLMS_URL ?? '').replace(/\/+$/, '') || window.location.origin;
      window.location.href = buildLoginUrl({ appUrl, postLoginPath: '/' });
    }
    if (status === 'authenticated' && !mismatch) router.replace('/');
  }, [status, mismatch, router]);

  async function handleSwitchAccount() {
    setSigningOut(true);
    // Same single-logout chain the topbar's Sign out uses — this page used to
    // carry its own inline copy of it. Returning to `/login?email=…` (rather
    // than the landing page) is the one difference that matters here: the
    // effect above sees the signed-out state and starts a fresh SSO login as
    // the INVITED user, which is the whole point of "wrong account".
    // Canonical origin, not the live one — the signout hosts allow-list the
    // canonical host only, and fall back to their own root otherwise (which is
    // how sign-out from a deployment URL ended up on the QuikIT launcher).
    const base = (process.env.NEXT_PUBLIC_QUIKLMS_URL ?? '').replace(/\/+$/, '') || window.location.origin;
    await globalSignOut(`${base}/login?email=${encodeURIComponent(invitedEmail)}`);
  }

  if (mismatch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Wrong account</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            You&apos;re signed in as{' '}
            <span className="font-medium text-gray-900">{currentEmail}</span>. This
            invitation is for{' '}
            <span className="font-medium text-gray-900">{invitedEmail}</span>.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Sign out of QuikIT to accept it as{' '}
            <span className="font-medium text-gray-900">{invitedEmail}</span>.
          </p>
          <button
            type="button"
            onClick={handleSwitchAccount}
            disabled={signingOut}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out & switch account'}
          </button>
          <button
            type="button"
            onClick={() => router.replace('/')}
            disabled={signingOut}
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-gray-500 transition hover:text-gray-700 disabled:opacity-60"
          >
            Stay signed in as {currentEmail}
          </button>
        </div>
      </div>
    );
  }

  return <Redirecting />;
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={<Redirecting />}>
      <LoginInner />
    </Suspense>
  );
}
