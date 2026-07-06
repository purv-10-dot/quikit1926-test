'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBranding, useFeatures } from '@/app/providers';
import { getNavGroups } from './nav-groups';

interface SidebarProps {
  role: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ role, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { branding } = useBranding();
  const { features, tenantType, loaded } = useFeatures();

  const groups = getNavGroups(role, tenantType);

  const isActive = (path: string) =>
    pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));

  return (
    <aside
      className={cn(
        'relative flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out',
        collapsed ? 'w-[68px]' : 'w-64',
      )}
    >
      {/* ── Logo / Brand ────────────────────────────────────────────────────── */}
      <div className={cn('flex h-16 shrink-0 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'gap-3 px-5')}>
        {branding.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo} alt={branding.name} className="h-8 w-auto max-w-full object-contain" />
        ) : (
          <div className={cn('flex items-center', collapsed ? '' : 'gap-2.5')}>
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white shadow-sm"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
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
          className="absolute -right-3 top-[52px] z-10 grid size-6 place-items-center rounded-full border border-line bg-surface text-fg-muted shadow-sm transition-colors hover:bg-surface-muted hover:text-fg"
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

          return (
            <div key={group.id} className="mb-1">
              {/* Group label — hidden when collapsed (a divider stands in) */}
              {collapsed ? (
                <div className="mx-3 my-2 border-t border-line/70 first:border-0" />
              ) : (
                <p className="mb-0.5 px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle first:pt-2">
                  {group.label}
                </p>
              )}

              {visibleItems.map((item) => {
                const active = isActive(item.path);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path + item.label}
                    href={item.path}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group relative mx-2 flex items-center gap-3 rounded-lg py-2 text-sm transition-all duration-150',
                      collapsed ? 'justify-center px-0' : 'px-3',
                      active
                        ? 'font-semibold text-[var(--brand-primary)]'
                        : 'font-medium text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )}
                    style={active ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' } : undefined}
                  >
                    {active && (
                      <span
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      />
                    )}
                    <Icon
                      className={cn(
                        'size-[17px] shrink-0 transition-colors duration-150',
                        active ? 'text-[var(--brand-primary)]' : 'text-fg-subtle group-hover:text-fg-muted',
                      )}
                    />
                    {!collapsed && <span className="truncate leading-none">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── Tenant badge ────────────────────────────────────────────────────── */}
      <div className={cn('shrink-0 border-t border-line py-3', collapsed ? 'px-2' : 'px-3')}>
        <div className={cn('flex items-center rounded-lg bg-surface-muted', collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2.5')}>
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
            style={{ backgroundColor: 'var(--brand-secondary)' }}
          >
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
