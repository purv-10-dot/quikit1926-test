'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * SSO entry point. Replaces the old dev `/role-select` picker: unauthenticated
 * users are sent straight to the QuikIT IdP via the "quikit" OAuth provider;
 * authenticated users are routed to the app root, which redirects to their role
 * landing (see app/page.tsx).
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
    if (status === 'unauthenticated') void signIn('quikit', { callbackUrl: '/' });
    if (status === 'authenticated' && !mismatch) router.replace('/');
  }, [status, mismatch, router]);

  async function handleSwitchAccount() {
    setSigningOut(true);

    // 1) Clear this app's cookie first (next-auth also broadcasts to sibling
    //    tabs), then wipe browser storage so no per-user UI state bleeds over.
    try {
      await signOut({ redirect: false });
    } catch {
      /* never let a local cookie-clear failure block the global sign-out */
    }
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* storage may be blocked by strict cookie policies — ignore */
    }

    // 2) Single-logout chain: auth-host → launcher → back to this invite link
    //    (now signed-out) so the effect above starts a fresh SSO login as the
    //    invited user. Mirrors @quikit/ui's globalSignOut without pulling in the
    //    package (quiklms doesn't depend on @quikit/ui).
    const authUrl = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');
    const quikitUrl = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? '').replace(/\/+$/, '');
    const origin = window.location.origin;
    const finalRedirect = `${origin}/login?email=${encodeURIComponent(invitedEmail)}`;

    const launcherSlo = quikitUrl
      ? `${quikitUrl}/api/auth/signout-global?callbackUrl=${encodeURIComponent(finalRedirect)}`
      : finalRedirect;
    const target = authUrl
      ? `${authUrl}/api/auth/signout-global?callbackUrl=${encodeURIComponent(launcherSlo)}`
      : launcherSlo;

    window.location.href = target;
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
