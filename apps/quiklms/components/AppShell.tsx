'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sun, Moon, RefreshCw, Bell, ChevronDown, Check, UserCog } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useTheme, useFeatures, useCurrentUser } from '@/app/providers';
import { useTranslation, LOCALES, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/cn';

// Role display labels shown in the header badge / switcher.
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:  'Super Admin',
  TENANT_ADMIN: 'Admin',
  SUB_ADMIN:    'Sub Admin',
  MANAGER:      'Manager',
  TEACHER:      'Teacher',
  PARENT:       'Parent',
  LEARNER:      'Learner',
};

// Where each role lands when activated.
const ROLE_LANDING: Record<string, string> = {
  SUPER_ADMIN:  '/dashboard',
  TENANT_ADMIN: '/tenant-dashboard',
  SUB_ADMIN:    '/sub-admin-dashboard',
  MANAGER:      '/manager-dashboard',
  TEACHER:      '/teacher-dashboard',
  PARENT:       '/parent-dashboard',
  LEARNER:      '/learner/dashboard',
};

const COLLAPSE_KEY = 'qs_sidebar_collapsed';

export function AppShell({ role, children }: { role: string; children: React.ReactNode }) {
  const { dark, toggle } = useTheme();
  const { tenantType, loaded } = useFeatures();
  const { user } = useCurrentUser();
  const { t, locale, setLocale } = useTranslation();

  // ── Sidebar collapse (persisted) ──────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const roleLabel = ROLE_LABELS[role] ?? role.replace(/_/g, ' ');

  // ── Role switcher (users with a secondary role) ───────────────────────────
  // The user's own roles — primary + secondary (de-duped). Multi-role users get
  // an in-place switcher; single-role users get the dev account picker.
  // We persist the role set (qs_roles) so the switcher round-trips: the dev auth
  // resolves each role-cookie to a different seed identity, which would
  // otherwise drop the "other" role after switching.
  const [storedRoles, setStoredRoles] = useState<string[]>([]);
  useEffect(() => {
    try { setStoredRoles(JSON.parse(localStorage.getItem('qs_roles') || '[]')); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (user?.secondaryRole && user.role) {
      const roles = Array.from(new Set([user.role, user.secondaryRole]));
      localStorage.setItem('qs_roles', JSON.stringify(roles));
      setStoredRoles(roles);
    }
  }, [user?.role, user?.secondaryRole]);

  const myRoles = Array.from(
    new Set([role, user?.role, user?.secondaryRole, ...storedRoles].filter(Boolean)),
  ) as string[];
  const isMultiRole = myRoles.length > 1;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  function activateRole(r: string) {
    if (r === role) { setMenuOpen(false); return; }
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `qs_role=${r}; path=/; max-age=${maxAge}; SameSite=Lax`;
    localStorage.setItem('qs_role', r);
    // Full navigation so providers re-fetch /api/me and the shell rebuilds.
    window.location.href = ROLE_LANDING[r] ?? '/';
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-fg">
      {/* Sidebar — fixed full height; only its nav scrolls internally */}
      <Sidebar role={role} collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Topbar (sticky; never scrolls with content) ─────────────────── */}
        <header className="z-20 flex h-16 shrink-0 items-center justify-end gap-2 border-b border-line bg-surface/80 px-5 backdrop-blur">
          {/* Role badge */}
          <span
            className={cn(
              'mr-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1',
              tenantType === 'school'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800'
                : tenantType === 'corporate'
                ? 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-800'
                : 'bg-surface-muted text-fg-muted ring-line',
            )}
          >
            <span className={cn('size-1.5 rounded-full', loaded ? (tenantType === 'school' ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-fg-subtle')} />
            {roleLabel}
            {loaded && tenantType && <span className="opacity-60">· {tenantType === 'school' ? 'School' : 'Corporate'}</span>}
          </span>

          {/* Language */}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={t('common.language', 'Language')}
            className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>

          {/* Dark mode */}
          <button
            onClick={toggle}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid size-9 place-items-center rounded-md border border-line-strong text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          {/* Notifications */}
          <button
            aria-label="Notifications"
            className="relative grid size-9 place-items-center rounded-md border border-line-strong text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <Bell className="size-4" />
          </button>

          {/* Role switcher — dropdown for multi-role users, dev picker otherwise */}
          {isMultiRole ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-white transition-[filter] hover:brightness-110 active:scale-[0.98]"
                style={{ backgroundColor: 'var(--brand-secondary)' }}
              >
                <UserCog className="size-3.5" />
                <span>{ROLE_LABELS[role] ?? role}</span>
                <ChevronDown className={cn('size-3.5 transition-transform', menuOpen && 'rotate-180')} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
                  <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Switch role</p>
                  {myRoles.map((r) => (
                    <button
                      key={r}
                      onClick={() => activateRole(r)}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-muted"
                    >
                      <span className="flex items-center gap-2">
                        <span className="grid size-6 place-items-center rounded-md bg-surface-muted text-[10px] font-bold text-fg-muted">
                          {(ROLE_LABELS[r] ?? r)[0]}
                        </span>
                        {ROLE_LABELS[r] ?? r}
                      </span>
                      {r === role && <Check className="size-4 text-[var(--brand-primary)]" />}
                    </button>
                  ))}
                  <div className="border-t border-line">
                    <Link href="/role-select" className="block px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-surface-muted">
                      Switch account…
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : null /* Single-role users: role is fixed by their centralized
             login (the retired qs_role dev-switch is gone). To act as another
             role, log in as that user — or use impersonation (future). */}
        </header>

        {/* ── Scrollable page content with a consistent max-width ──────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
