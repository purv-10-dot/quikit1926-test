'use client';
/**
 * Global top-bar search — quikhrms's `nav-search.tsx`, expressed with QuikLMS's
 * own tokens and data layer.
 *
 * Same behaviour as the reference: 250ms debounce so a fast typist costs one
 * request instead of ten, a minimum of two characters, arrow-key/Enter/Escape
 * navigation, and a panel that closes on an outside click. What differs is the
 * plumbing — `lib/api` instead of react-query (QuikLMS does not carry it), and
 * `--brand-primary` mixes instead of quikhrms's fixed green, so a tenant's
 * accent drives the focus ring and the active row.
 *
 * The hit list is deliberately dumb: the server decides both the label and the
 * href (see `lib/services/search-service.ts`), because the right destination
 * for "Ada Lovelace" is a different page for a school admin, a corporate admin
 * and a manager.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, BookOpen, Users, CalendarDays } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import type { SearchHit } from '@/lib/services/search-service';

const ICON: Record<SearchHit['type'], LucideIcon> = {
  course: BookOpen,
  user: Users,
  batch: CalendarDays,
};

/** Matches `MIN_QUERY` in the service — below it the server returns nothing. */
const MIN_QUERY = 2;

export function NavSearch() {
  const router = useRouter();
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Debounce the input into the fetched term (250ms) so we do not hit the API
  // on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      setHits([]);
      setLoading(false);
      return;
    }
    // A response that arrives after the user has typed on must not overwrite a
    // newer one — the flag is flipped by this effect's own cleanup.
    let stale = false;
    setLoading(true);
    api
      .get<{ data: SearchHit[] }>(`/search?q=${encodeURIComponent(debounced)}`)
      .then((res) => {
        if (stale) return;
        setHits(res?.data ?? []);
        setActive(0);
      })
      .catch(() => {
        if (!stale) setHits([]);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => { stale = true; };
  }, [debounced]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery('');
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const h = hits[active]; if (h) go(h); }
  };

  const enabled = debounced.length >= MIN_QUERY;
  const showPanel = open && enabled;

  return (
    // Hidden below md: at that width the greeting and the icon cluster already
    // fill the bar, and a 16rem input would push one of them off it.
    <div ref={ref} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t('common.searchAnything', 'Search anything...')}
        aria-label={t('common.searchAnything', 'Search anything...')}
        className="qs-search-input w-64 rounded-full border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
      />

      {showPanel && (
        <div className="qs-pop absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {loading && hits.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-fg-muted">
              <Loader2 className="size-3.5 animate-spin" /> {t('common.searching', 'Searching…')}
            </div>
          ) : hits.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-fg-muted">
              {t('common.noResults', 'No results for')} &ldquo;{debounced}&rdquo;
            </div>
          ) : (
            <div className="max-h-96 overflow-auto py-1">
              {hits.map((h, i) => {
                const Icon = ICON[h.type];
                return (
                  <button
                    key={`${h.type}-${h.id}`}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                      i === active ? 'qs-search-hit-active' : 'hover:bg-surface-muted',
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-fg">{h.label}</span>
                      {h.sub && <span className="block truncate text-[11px] text-fg-muted">{h.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
