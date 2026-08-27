'use client';
/**
 * Top-bar waffle app switcher — the 3-column icon grid quikhrms, quikscale and
 * quiktrack all show (apps/quikhrms/components/hrms/layout/app-switcher.tsx).
 *
 * This replaces the vertical text list AppShell used to render inline. The list
 * was not wrong, it was just a different app: every sibling app opens a grid of
 * brand icons, and the switcher is the one surface a user meets in ALL of them,
 * so it is the one place where looking the same actually matters.
 *
 * Grants come from the platform's `OrgAppAccess`/`UserAppAccess` tables via
 * `/api/apps/switcher`, so the menu only ever lists apps this user really has in
 * this org. Fetched lazily on first open — most sessions never touch it, and it
 * must not cost every page load.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Grid3x3, Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

/** Wire shape of `GET /api/apps/switcher` (platform-canonical). */
interface SwitcherApp {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  iconUrl: string | null;
  current: boolean;
}

interface SwitcherResponse {
  data: SwitcherApp[];
  quikitUrl: string | null;
}

/** Two-letter fallback monogram when no icon loads. */
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * App icon with a fallback chain. The brand SVGs and the DB `iconUrl` are served
 * by the central QuikIT app, so they must be loaded from the QuikIT ORIGIN — a
 * relative path would 404 against QuikLMS. In order:
 *   1. QuikIT's conventional brand asset:  {quikit}/app-icons/{slug}.svg
 *   2. the DB iconUrl (absolutised to the QuikIT origin when relative)
 *   3. a two-letter monogram
 * `onError` advances to the next candidate.
 */
function AppIcon({ app, base }: { app: SwitcherApp; base: string }) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (base && app.slug) list.push(`${base}/app-icons/${app.slug}.svg`);
    if (app.iconUrl) {
      list.push(
        /^https?:\/\//.test(app.iconUrl)
          ? app.iconUrl
          : `${base}${app.iconUrl.startsWith('/') ? '' : '/'}${app.iconUrl}`,
      );
    }
    return list;
  }, [app, base]);

  const [idx, setIdx] = useState(0);

  if (idx >= candidates.length) {
    return (
      <div className="qs-app-monogram grid size-9 place-items-center rounded-lg text-[12px] font-bold">
        {initials(app.name)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[idx]}
      alt={app.name}
      className="size-9 rounded-lg object-contain"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

export function AppSwitcher() {
  const { t } = useTranslation();
  const [apps, setApps] = useState<SwitcherApp[] | null>(null);
  const [quikitUrl, setQuikitUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || apps !== null || loading) return;
    setLoading(true);
    api
      .get<SwitcherResponse>('/apps/switcher')
      .then((r) => {
        setApps(r?.data ?? []);
        setQuikitUrl(r?.quikitUrl ?? null);
      })
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, [open, apps, loading]);

  // Close on an outside click or Escape.
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

  // Browser-facing QuikIT origin for the icons and the "View all apps" link.
  // Prefer the baked public var (always browser-reachable) over the value the
  // server returned, which may be an internal host in containerised deploys.
  const iconBase = (process.env.NEXT_PUBLIC_QUIKIT_URL || quikitUrl || '').replace(/\/$/, '');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('common.switchApp', 'Switch app')}
        aria-expanded={open}
        title={t('common.apps', 'Apps')}
        className="qs-iconbtn grid size-9 place-items-center rounded-full border border-line-strong bg-surface text-fg-muted"
      >
        <Grid3x3 className="size-4" />
      </button>

      {open && (
        <div className="qs-pop absolute right-0 top-full z-30 mt-2 w-[320px] rounded-2xl border border-line bg-surface p-4 shadow-lg">
          <div className="mb-3 px-1 text-[15px] font-semibold text-fg">{t('common.apps', 'Apps')}</div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-5 text-sm text-fg-muted">
              <Loader2 className="size-4 animate-spin" /> {t('common.loading', 'Loading…')}
            </div>
          ) : apps?.length === 0 ? (
            <div className="py-5 text-center text-sm text-fg-muted">
              {t('common.noApps', 'No apps available for your account.')}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {apps?.map((app) => {
                const tile = (
                  <>
                    <span className="relative">
                      <AppIcon app={app} base={iconBase} />
                      {/* The current app is shown, not hidden — so the menu also
                          says where you are. */}
                      {app.current && (
                        <Check
                          className="absolute -right-1 -top-1 size-3.5 rounded-full bg-surface p-[1px]"
                          style={{ color: 'var(--brand-primary)' }}
                        />
                      )}
                    </span>
                    <span className="w-full truncate text-center text-[11px] leading-tight text-fg-muted">
                      {app.name}
                    </span>
                  </>
                );

                return app.current ? (
                  <div
                    key={app.id}
                    aria-current="true"
                    title={app.name}
                    className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-muted p-3"
                  >
                    {tile}
                  </div>
                ) : (
                  <a
                    key={app.id}
                    href={app.baseUrl}
                    title={app.name}
                    className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-surface-muted"
                  >
                    {tile}
                  </a>
                );
              })}
            </div>
          )}

          {iconBase && (
            <div className="mt-3 border-t border-line pt-3 text-center">
              <a
                href={`${iconBase}/apps`}
                className="text-[13px] font-medium"
                style={{ color: 'var(--brand-primary)' }}
              >
                {t('common.viewAllApps', 'View all apps')}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
