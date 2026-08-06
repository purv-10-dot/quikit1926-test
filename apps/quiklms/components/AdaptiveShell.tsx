'use client';
/**
 * SUPERSEDED — no longer mounted anywhere. Do not reach for it.
 *
 * This was `app/(shared)/layout.tsx`'s shell. It picked the navigation role from
 * `localStorage.qs_role` and defaulted to LEARNER when absent, so on a fresh
 * browser six of the seven roles got the learner sidebar on /profile, /messages,
 * /reset-password and /video/[id] — and a user who had just switched to Sub Admin
 * watched the sidebar revert the moment they followed a shared-page link.
 *
 * `(shared)` now resolves the ACTIVE role server-side via `resolveActivePageRole`
 * (lib/auth/page-guard.ts), the same resolver the seven role-gated groups use. Kept
 * only because `__tests__/e2e/ui/phase20-page-gating.spec.ts` and
 * `phase36-shared-pages.spec.ts` describe this file by name; it should be deleted
 * once those notes are rewritten.
 */
import { useEffect, useState } from 'react';
import { AppShell } from './AppShell';

const VALID_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER'];

export function AdaptiveShell({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('qs_role') : null;
    const resolved = stored && VALID_ROLES.includes(stored) ? stored : 'LEARNER';
    setRole(resolved);
  }, []);

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fg-muted text-sm">
        Loading…
      </div>
    );
  }

  return <AppShell role={role}>{children}</AppShell>;
}
