'use client';
import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Check, Grid3x3, ExternalLink, Loader2 } from 'lucide-react';
// Shared floating support widget, mounted at the bottom of this shell. The JSX
// reference existed without this import, so EVERY authenticated page in the app
// threw "ReferenceError: SupportLauncher is not defined" and 500'd — the shell
// wraps all eight role groups. Imported from @quikit/ui (never a local copy),
// the same path quikcrm/quikchat/quikinfra/quiktrack/quikasset use.
import { SupportLauncher } from '@quikit/ui/support';
import { Sidebar } from './Sidebar';
import { NavSearch } from './NavSearch';
import { AppSwitcher } from './AppSwitcher';
import { UserMenu } from './UserMenu';
import { useTheme, useCurrentUser } from '@/app/providers';
import { useTranslation, LOCALES, type Locale } from '@/lib/i18n';
// Mounted at the bottom of this shell. Every QuikIT app carries the launcher —
// see the note on the mount site — but the import was missing here, so the
// component reference resolved to nothing and AppShell threw
// `SupportLauncher is not defined` on render, taking every page in the app
// down with it. Same specifier the other apps use.
import { SupportLauncher } from '@quikit/ui/support';

const COLLAPSE_KEY = 'qs_sidebar_collapsed';

export function AppShell({ role, children }: { role: string; children: React.ReactNode }) {
  const { dark, toggle } = useTheme();
  const { t, locale, setLocale } = useTranslation();
  const { user } = useCurrentUser();

  // ── Sidebar collapse (persisted) ────────────────────────────────────────────
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

  // ── Greeting ────────────────────────────────────────────────────────────────
  // Computed AFTER mount only, exactly as quikhrms does it. `new Date()`
  // resolves to the SERVER's timezone during SSR but the user's on the client,
  // so deriving either value during render produces a text mismatch and a
  // hydration error. Render a stable string on the server and the first client
  // paint, then swap in the localised one.
  const [greeting, setGreeting] = useState(t('common.welcome', 'Welcome'));
  const [today, setToday] = useState('');
  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    setGreeting(
      hour < 12 ? t('common.goodMorning', 'Good morning')
        : hour < 18 ? t('common.goodAfternoon', 'Good afternoon')
        : t('common.goodEvening', 'Good evening'),
    );
    // The app's own locale, not the browser's — the header must not read
    // English while the rest of the page is in Hindi. 'en' maps to en-GB for
    // the day-before-month order quikhrms uses.
    setToday(
      now.toLocaleDateString(locale === 'en' ? 'en-GB' : locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }),
    );
  }, [locale, t]);

  const firstName = user?.firstName || t('common.there', 'there');

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-fg">
      {/* Sidebar — fixed full height; only its nav scrolls internally */}
      <Sidebar role={role} collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Topbar (sticky; never scrolls with content) ─────────────────── */}
        <header className="qs-topbar sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 px-5">
          <div className="min-w-0">
            {/* The non-breaking space holds the line's height before the date
                lands, so the greeting does not jump on hydration. */}
            <p className="truncate text-[11px] font-medium text-fg-subtle">{today || ' '}</p>
            <h1 className="truncate text-base font-bold text-fg">
              {greeting}, {firstName}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <NavSearch />

            {/* Language */}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              aria-label={t('common.language', 'Language')}
              className="qs-headselect h-9 rounded-full border border-line-strong bg-surface px-3 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>{l.toUpperCase()}</option>
              ))}
            </select>

            {/* Dark mode */}
            <button
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="qs-iconbtn grid size-9 place-items-center rounded-full border border-line-strong bg-surface text-fg-muted"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>

            {/* App switcher — only the apps this user is granted in this org */}
            <AppSwitcher />

            {/* Account — profile + sign out. Moved here from the sidebar footer
                so the header carries the person and the sidebar the tenant,
                which is the arrangement quikhrms uses. */}
            <UserMenu role={role} />
          </div>
        </header>

        {/* ── Scrollable page content with a consistent max-width ─────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-6">{children}</div>
        </main>
      </div>

      {/* Floating support launcher. Mounted HERE rather than in each route
          group's layout: all eight authenticated groups (learner, teacher,
          parent, manager, tenant-admin, sub-admin, super-admin, shared) render
          through this shell, so one mount covers every role. Outside <main> so
          it stays pinned to the viewport instead of scrolling with the page. */}
      <SupportLauncher appSlug="quiklms" />
    </div>
  );
}
