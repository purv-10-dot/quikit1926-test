'use client';
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
