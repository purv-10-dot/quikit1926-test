'use client';
/**
 * Account control at the foot of the sidebar — a circular avatar that opens
 * "Profile settings" / "Sign out" upward.
 *
 * This used to be a pill in the topbar's right corner (AppShell). It moved here
 * so the shell carries ONE identity column instead of two competing ones: the
 * tenant's brand at the top of the sidebar, the person at the bottom — the same
 * arrangement quikhrms uses. AppShell no longer owns any account state; the
 * sign-out flow (globalSignOut plus its fallback) moved across unchanged.
 *
 * The footer is ALWAYS rendered, for every role, because it is the only way to
 * sign out now that the topbar menu is gone.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LogOut, Loader2, UserCog, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCurrentUser } from '@/app/providers';
import { globalSignOut } from '@/lib/global-signout';

/** Display labels for the LMS role enum. Was AppShell's; it is the only reader now. */
const ROLE_LABELS: Record<string, string> = {
  ADMIN:        'Super Admin',
  TENANT_ADMIN: 'Admin',
  SUB_ADMIN:    'Sub Admin',
  MANAGER:      'Manager',
  TEACHER:      'Teacher',
  PARENT:       'Parent',
  LEARNER:      'Learner',
};

interface SidebarAccountProps {
  role: string;
  collapsed: boolean;
}

export function SidebarAccount({ role, collapsed }: SidebarAccountProps) {
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on an outside click or Escape — the menu overlays page content, so
  // it must not need a second click on the trigger to go away.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  // Initials from the name, else the email's first letter, else the role's —
  // so the circle is never empty while `/api/me` is still in flight.
  const initials =
    (user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '') ||
    user?.email?.[0] ||
    roleLabel[0];

  async function handleSignOut() {
    setSigningOut(true);
    setOpen(false);
    try {
      await globalSignOut();
    } catch {
      // globalSignOut navigates on success; landing here means it could not, so
      // fall back to the public landing rather than stranding the user. NOT
      // `/login` — that re-initiates SSO and would undo the sign-out. The
      // `?reason=logged_out` flag stops the landing bouncing a still-settling
      // session onward (see app/(marketing)/page.tsx).
      setSigningOut(false);
      window.location.href = '/?reason=logged_out';
    }
  }

  return (
    <div ref={ref} className={cn('relative shrink-0 border-t border-line', collapsed ? 'p-2' : 'p-2.5')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? fullName || roleLabel : undefined}
        className={cn(
          'qs-account-row flex w-full items-center rounded-xl text-left transition-colors',
          collapsed ? 'justify-center p-1' : 'gap-2.5 p-1.5',
        )}
      >
        <span className="qs-account-avatar grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold uppercase">
          {initials}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-fg">
                {fullName || roleLabel}
              </span>
              <span className="block truncate text-[11px] leading-tight text-fg-subtle">
                {user?.email || roleLabel}
              </span>
            </span>
            <MoreVertical className="size-4 shrink-0 text-fg-subtle" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'qs-account-pop absolute z-30 overflow-hidden rounded-xl border border-line bg-surface shadow-xl',
            // Expanded: rises out of the footer. Collapsed rail: there is no room
            // to the left, so it flies out to the right of the icon instead.
            collapsed ? 'bottom-2 left-full ml-2 w-56' : 'bottom-full left-2.5 right-2.5 mb-2',
          )}
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-fg">{fullName || roleLabel}</p>
            {user?.email && <p className="truncate text-xs text-fg-muted">{user.email}</p>}
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{roleLabel}</p>
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-muted"
          >
            <UserCog className="size-4 text-fg-subtle" />
            Profile settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
