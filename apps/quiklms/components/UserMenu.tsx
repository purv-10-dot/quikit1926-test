'use client';
/**
 * Top-bar account menu — avatar + chevron that opens Profile settings / Sign
 * out, the same corner quikhrms puts it in (`top-bar.tsx` → `UserMenu`).
 *
 * This is `components/SidebarAccount.tsx` moved back up to the header. The
 * sidebar footer was a deliberate choice once — one identity column, tenant at
 * the top, person at the bottom — but the shell is being aligned with quikhrms,
 * where the sidebar carries the tenant alone and the person lives beside the
 * apps waffle. The sign-out flow (`globalSignOut` plus its fallback) crossed
 * over unchanged; it is still the ONLY sign-out surface in the app, which is
 * why this menu renders for every role.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Loader2, UserCog } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCurrentUser } from '@/app/providers';
import { useTranslation } from '@/lib/i18n';
import { globalSignOut } from '@/lib/global-signout';

/** Display labels for the LMS role enum. */
const ROLE_LABELS: Record<string, string> = {
  ADMIN:        'Super Admin',
  TENANT_ADMIN: 'Admin',
  SUB_ADMIN:    'Sub Admin',
  MANAGER:      'Manager',
  TEACHER:      'Teacher',
  PARENT:       'Parent',
  LEARNER:      'Learner',
};

export function UserMenu({ role }: { role: string }) {
  const { user } = useCurrentUser();
  const { t } = useTranslation();
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  // Initials from the name, else the email's first letter, else the role's — so
  // the circle is never empty while `/api/me` is still in flight.
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={fullName || roleLabel}
        className="qs-account-row flex items-center gap-1 rounded-full border border-line-strong py-0.5 pl-0.5 pr-2"
      >
        <span className="qs-account-avatar grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold uppercase">
          {initials}
        </span>
        <ChevronDown className={cn('size-3 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="qs-pop absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
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
            {t('common.profileSettings', 'Profile settings')}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            {signingOut ? t('common.signingOut', 'Signing out…') : t('common.signOut', 'Sign out')}
          </button>
        </div>
      )}
    </div>
  );
}
