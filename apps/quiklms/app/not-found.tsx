'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, ArrowLeft, Compass } from 'lucide-react';
import { useCurrentUser } from './providers';

// Role → landing route (mirrors app/role-select/page.tsx).
const ROLE_LANDING: Record<string, string> = {
  SUPER_ADMIN: '/dashboard',
  TENANT_ADMIN: '/tenant-dashboard',
  SUB_ADMIN: '/sub-admin-dashboard',
  MANAGER: '/manager-dashboard',
  TEACHER: '/teacher-dashboard',
  PARENT: '/parent-dashboard',
  LEARNER: '/learner/dashboard',
};

export default function NotFound() {
  const router = useRouter();
  const { user } = useCurrentUser();

  const dashboard =
    (user?.role && ROLE_LANDING[user.role]) || '/role-select';

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* Brand mark */}
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-primary)]/10">
          <Compass className="h-7 w-7 text-[var(--brand-primary)]" />
        </div>

        <h1 className="font-display text-7xl font-bold text-[var(--brand-primary)] mb-3">
          404
        </h1>
        <h2 className="font-display text-2xl font-semibold text-fg mb-2">
          Page not found
        </h2>
        <p className="text-sm text-fg-muted mb-8">
          The page you are looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on track.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-medium text-fg transition-all hover:bg-canvas active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
          <Link
            href={dashboard}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            {user ? 'Dashboard' : 'Choose Role'}
          </Link>
        </div>
      </div>
    </div>
  );
}
