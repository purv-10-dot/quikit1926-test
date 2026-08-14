'use client';
import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Check, Grid3x3, ExternalLink, Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useTheme } from '@/app/providers';
import { useTranslation, LOCALES, type Locale } from '@/lib/i18n';
import { api } from '@/lib/api';

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

// Role display labels now live with their only reader, SidebarAccount.

const COLLAPSE_KEY = 'qs_sidebar_collapsed';

export function AppShell({ role, children }: { role: string; children: React.ReactNode }) {
  const { dark, toggle } = useTheme();
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

  // Sign out lives in components/SidebarAccount.tsx now, with the menu that
  // triggers it.

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-fg">
      {/* Sidebar â€” fixed full height; only its nav scrolls internally */}
      <Sidebar role={role} collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* â”€â”€ Topbar (sticky; never scrolls with content) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* The role/tenant badge that used to open this bar ("Admin · Corporate")
            is gone, for every role: it restated what the sidebar's brand row and
            the account footer already say, and it was the only thing anchoring
            the topbar to the left. */}
        <header className="qs-topbar sticky top-0 z-20 flex h-16 shrink-0 items-center justify-end gap-2 px-5">
          {/* Language */}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={t('common.language', 'Language')}
            className="qs-headselect h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>

          {/* Dark mode */}
          <button
            onClick={toggle}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="qs-iconbtn grid size-9 place-items-center rounded-lg border border-line-strong text-fg-muted"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          {/* App switcher â€” only the apps this user is granted in this org */}
          <div className="relative" ref={appsRef}>
            <button
              onClick={() => setAppsOpen((o) => !o)}
              aria-label="Switch app"
              aria-expanded={appsOpen}
              className="qs-iconbtn grid size-9 place-items-center rounded-lg border border-line-strong text-fg-muted"
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
          {/* No account menu here — profile + sign out moved to the sidebar's
              footer (components/SidebarAccount.tsx), which now owns that state. */}
        </header>

        {/* â”€â”€ Scrollable page content with a consistent max-width â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
