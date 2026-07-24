'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBranding, useFeatures } from '@/app/providers';
import { getNavGroups } from './nav-groups';

interface SidebarProps {
  role: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

/** Per-group open/closed state, persisted so the menu shape survives reloads. */
const GROUPS_KEY = 'qs_sidebar_groups';

export function Sidebar({ role, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { branding } = useBranding();
  const { features, tenantType, loaded } = useFeatures();

  const groups = getNavGroups(role, tenantType);

  const isActive = (path: string) =>
    pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));

  // Groups default to open; only explicit user toggles are stored. Reading in an
  // effect (not during render) keeps the server and first client paint identical,
  // so this can't produce a hydration mismatch.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      if (raw) setOpenGroups(JSON.parse(raw));
    } catch { /* corrupt value — fall back to all-open */ }
  }, []);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) };
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  // Running index across all rendered items so the entrance stagger is smooth
  // across group boundaries (capped so long menus don't crawl in forever).
  let animIndex = 0;

  return (
    <aside
      className={cn(
        'qs-sidebar relative flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* Ambient brand glow — clipped decorative layer, sits behind everything. */}
      <div className="qs-sidebar-glow" aria-hidden="true" />

      {/* ── Logo / Brand ────────────────────────────────────────────────────── */}
      <div className={cn('flex h-16 shrink-0 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'gap-3 px-5')}>
        {branding.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo} alt={branding.name} className="h-8 w-auto max-w-full object-contain" />
        ) : (
          <div className={cn('flex items-center', collapsed ? '' : 'gap-2.5')}>
            <div className="qs-brandmark flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black">
              {(branding.name ?? 'Q')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <span className="font-display text-base font-bold text-fg truncate">{branding.name ?? 'QuikSkill'}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Collapse / expand toggle ────────────────────────────────────────── */}
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="qs-collapse-btn absolute -right-3 top-[52px] z-10 grid size-6 place-items-center rounded-full border border-line bg-surface text-fg-muted shadow-sm"
        >
          <ChevronLeft className={cn('size-3.5 transition-transform duration-200', collapsed && 'rotate-180')} />
        </button>
      )}

      {/* ── Navigation (only this scrolls) ──────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-none">
        {groups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.feature || !loaded || features[item.feature] !== false,
          );
          if (!visibleItems.length) return null;

          // In the icon-only rail there is no header to click, so groups always
          // render open — the accordion only applies to the expanded sidebar.
          const hasActive = visibleItems.some((item) => isActive(item.path));
          const open = collapsed ? true : (openGroups[group.id] ?? true);

          return (
            <div key={group.id} className="mb-1">
              {/* Group label — hidden when collapsed (a divider stands in) */}
              {collapsed ? (
                <div className="mx-3 my-2 border-t border-line/70 first:border-0" />
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  aria-controls={`navgroup-${group.id}`}
                  className="qs-group-btn mb-0.5 flex w-full items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle first:pt-2"
                >
                  <span className="truncate">{group.label}</span>
                  {/* Shut group still holds the current page — say so. */}
                  {!open && hasActive && (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      'ml-auto size-3 shrink-0 transition-transform duration-200',
                      !open && '-rotate-90',
                    )}
                  />
                </button>
              )}

              <div className="qs-nav-group" data-open={open} id={`navgroup-${group.id}`}>
                <div>
                  {visibleItems.map((item) => {
                    const active = isActive(item.path);
                    const Icon = item.icon;
                    const delay = Math.min(animIndex++ * 28, 420);
                    return (
                      <Link
                        key={item.path + item.label}
                        href={item.path}
                        data-active={active}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        style={{ animationDelay: `${delay}ms` }}
                        className={cn(
                          'qs-nav-link qs-nav-enter group mx-2 flex items-center gap-3 rounded-lg py-2 text-sm',
                          collapsed ? 'justify-center px-0' : 'px-3',
                          active
                            ? 'font-semibold text-[var(--brand-primary)]'
                            : 'font-medium text-fg-muted hover:text-fg',
                        )}
                      >
                        <Icon
                          className={cn(
                            'qs-nav-icon size-[17px] shrink-0',
                            active ? 'text-[var(--brand-primary)]' : 'text-fg-subtle group-hover:text-fg-muted',
                          )}
                        />
                        {!collapsed && <span className="truncate leading-none">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Tenant badge ────────────────────────────────────────────────────── */}
      <div className={cn('shrink-0 border-t border-line py-3', collapsed ? 'px-2' : 'px-3')}>
        <div className={cn('qs-tenant-card flex items-center rounded-lg', collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2.5')}>
          <div className="qs-tenant-avatar flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold">
            {(branding.name ?? 'Q')[0].toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg leading-none mb-0.5">{branding.name ?? 'QuikSkill'}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle leading-none">
                {tenantType === 'school' ? 'School' : tenantType === 'corporate' ? 'Corporate' : 'Platform'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
