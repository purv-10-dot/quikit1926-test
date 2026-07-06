'use client';

import { signIn, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * SSO entry point. Replaces the old dev `/role-select` picker: unauthenticated
 * users are sent straight to the QuikIT IdP via the "quikit" OAuth provider;
 * authenticated users are routed to the app root, which redirects to their role
 * landing (see app/page.tsx).
 */
export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') void signIn('quikit', { callbackUrl: '/' });
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Redirecting to sign-in…</p>
    </div>
  );
}
