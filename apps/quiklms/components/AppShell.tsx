'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sun, Moon, Bell, ChevronDown, Check, UserCog, LogOut, Grid3x3, ExternalLink, Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useTheme, useFeatures, useCurrentUser } from '@/app/providers';
import { useTranslation, LOCALES, type Locale } from '@/lib/i18n';
import { globalSignOut } from '@/lib/global-signout';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { landingPathFor } from '@/lib/auth/landing';

interface SwitchableApp {
  id: string;
  name: string;
  slug: string;
  url: string;
  iconUrl: string | null;
  current: boolean;
}

/** Wire shape returned by `GET /api/apps/switcher` (platform-canonical). */
interface SwitcherApp {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  iconUrl: string | null;
  current: boolean;
}

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

const COLLAPSE_KEY = 'qs_sidebar_collapsed';

export function AppShell({ role, children }: { role: string; children: React.ReactNode }) {
  const { dark, toggle } = useTheme();
  const { tenantType, loaded } = useFeatures();
  const { user } = useCurrentUser();
  const { t, locale, setLocale } = useTranslation();

  // â”€â”€ Sidebar collapse (persisted) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Role switcher (users with a secondary role) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The user's own roles â€” primary + secondary (de-duped). Multi-role users get
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

  // â”€â”€ App switcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Grants come from the platform's UserAppAccess table, so the menu only ever
  // lists apps this user actually has in this org. Fetched lazily on first open
  // â€” most sessions never touch it, and it must not cost every page load.
  const [apps, setApps] = useState<SwitchableApp[] | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const appsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appsOpen || apps !== null || appsLoading) return;
    setAppsLoading(true);
    // `/apps/switcher` is the platform-canonical endpoint every sibling app
    // exposes; it replaced the bespoke `/me/apps`, which applied only one of
    // the launcher's five visibility clauses. The response is the shared shape
    // (`data[]` with `baseUrl`), so map it onto the local `url` field here.
    api
      .get<{ data: SwitcherApp[] }>('/apps/switcher')
      .then((r) =>
        setApps(
          (r?.data ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            slug: a.slug,
            url: a.baseUrl,
            iconUrl: a.iconUrl ?? null,
            current: a.current,
          })),
        ),
      )
      .catch(() => setApps([]))
      .finally(() => setAppsLoading(false));
  }, [appsOpen, apps, appsLoading]);

  useEffect(() => {
    if (!appsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (appsRef.current && !appsRef.current.contains(e.target as Node)) setAppsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [appsOpen]);

  // â”€â”€ Sign out â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [signingOut, setSigningOut] = useState(false);
  async function handleSignOut() {
    setSigningOut(true);
    setMenuOpen(false);
    try {
      await globalSignOut();
    } catch {
      // globalSignOut navigates on success; landing here means it could not,
      // so fall back to the public landing page rather than stranding the user.
      // NOT `/login` â€” that re-initiates SSO and would undo the sign-out.
      setSigningOut(false);
      window.location.href = '/';
    }
  }

  function activateRole(r: string) {
    if (r === role) { setMenuOpen(false); return; }
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `qs_role=${r}; path=/; max-age=${maxAge}; SameSite=Lax`;
    localStorage.setItem('qs_role', r);
    // Full navigation so providers re-fetch /api/me and the shell rebuilds.
    // School tenant admins belong on /school-dashboard, not the corporate one.
    // tenantType is already in hand from useFeatures(), so the role switcher
    // routes correctly too. See lib/auth/landing.ts.
    window.location.href = landingPathFor(r, tenantType);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-fg">
      {/* Sidebar â€” fixed full height; only its nav scrolls internally */}
      <Sidebar role={role} collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* â”€â”€ Topbar (sticky; never scrolls with content) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
            {loaded && tenantType && <span className="opacity-60">Â· {tenantType === 'school' ? 'School' : 'Corporate'}</span>}
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

          {/* App switcher â€” only the apps this user is granted in this org */}
          <div className="relative" ref={appsRef}>
            <button
              onClick={() => setAppsOpen((o) => !o)}
              aria-label="Switch app"
              aria-expanded={appsOpen}
              className="grid size-9 place-items-center rounded-md border border-line-strong text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <Grid3x3 className="size-4" />
            </button>
            {appsOpen && (
              <div className="absolute right-0 top-11 z-30 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
                <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Your apps
                </p>

                {appsLoading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-fg-muted">
                    <Loader2 className="size-4 animate-spin" /> Loadingâ€¦
                  </div>
                )}

                {!appsLoading && apps?.length === 0 && (
                  <p className="px-3 py-3 text-sm text-fg-muted">No other apps available.</p>
                )}

                {!appsLoading &&
                  apps?.map((a) =>
                    a.current ? (
                      // Current app is shown, not hidden â€” so the menu says where you are.
                      <div
                        key={a.id}
                        className="flex items-center justify-between px-3 py-2 text-sm text-fg"
                        aria-current="true"
                      >
                        <span className="flex items-center gap-2">
                          <span className="grid size-6 place-items-center rounded-md bg-surface-muted text-[10px] font-bold text-fg-muted">
                            {a.name[0]}
                          </span>
                          {a.name}
                        </span>
                        <Check className="size-4 text-[var(--brand-primary)]" />
                      </div>
                    ) : (
                      <a
                        key={a.id}
                        href={a.url}
                        className="flex items-center justify-between px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-muted"
                      >
                        <span className="flex items-center gap-2">
                          <span className="grid size-6 place-items-center rounded-md bg-surface-muted text-[10px] font-bold text-fg-muted">
                            {a.name[0]}
                          </span>
                          {a.name}
                        </span>
                        <ExternalLink className="size-3.5 text-fg-subtle" />
                      </a>
                    ),
                  )}
              </div>
            )}
          </div>

          {/* Account menu â€” ALWAYS rendered.
              This used to be `isMultiRole ? <switcher/> : null`, so a
              single-role user (most users) had no menu at all and therefore no
              way to sign out. Role switching is now a section INSIDE the
              account menu rather than the reason the menu exists. */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-white transition-[filter] hover:brightness-110 active:scale-[0.98]"
              style={{ backgroundColor: 'var(--brand-secondary)' }}
            >
              <UserCog className="size-3.5" />
              <span className="max-w-[10rem] truncate">
                {user?.firstName || ROLE_LABELS[role] || role}
              </span>
              <ChevronDown className={cn('size-3.5 transition-transform', menuOpen && 'rotate-180')} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
                {/* Who you are â€” the menu is now the account menu, so say so. */}
                <div className="border-b border-line px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-fg">
                    {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || roleLabel}
                  </p>
                  {user?.email && <p className="truncate text-xs text-fg-muted">{user.email}</p>}
                </div>

                {isMultiRole && (
                  <>
                    <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                      Switch role
                    </p>
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
                  </>
                )}

                <div className="border-t border-line">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-muted"
                  >
                    Profile settings
                  </Link>
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                    {signingOut ? 'Signing outâ€¦' : 'Sign out'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* â”€â”€ Scrollable page content with a consistent max-width â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
