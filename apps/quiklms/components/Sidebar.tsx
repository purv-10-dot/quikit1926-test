'use client';
/**
 * Role sidebar — quikhrms's layout language (apps/quikhrms/components/hrms/
 * layout/sidebar.tsx), expressed with QuikLMS's own nav model and brand vars.
 *
 * What that means concretely:
 *   - a light, calm panel: no gradient wash on the rows, no sheen sweep;
 *   - one accordion group open at a time, defaulting to the group that holds
 *     the current route, with children indented under a tree line;
 *   - a group holding a SINGLE item collapses into a plain link (Messages,
 *     Analytics, Dashboard…) — nine of the ten role menus below have several of
 *     those, and an accordion around one child is pure noise;
 *   - the active row is a rounded brand-tinted pill, not a left edge bar.
 *
 * Deliberately NOT copied from quikhrms: its hardcoded `#eaf1fe` / `#2563eb`.
 * Those become `--brand-primary` mixes here so a tenant's accent colour still
 * drives the menu (apps/quiklms/CLAUDE.md §5).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBranding, useFeatures } from '@/app/providers';
import { getNavGroups, GROUP_ICONS, type NavItem } from './nav-groups';

interface SidebarProps {
  role: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

/** The one open group, persisted so the menu shape survives a reload. */
const GROUP_KEY = 'qs_sidebar_group';

/**
 * Sentinel for `openGroup`: the user explicitly shut the group holding the
 * current route. Distinct from `null`, which means "no interaction yet — follow
 * the route" and would otherwise snap the group straight back open.
 */
const COLLAPSED = '__collapsed__';

export function Sidebar({ role, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { branding } = useBranding();
  const { features, tenantType, loaded } = useFeatures();

  const groups = getNavGroups(role, tenantType);

  const isActive = (path: string) =>
    pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));

  // Read in an effect, not during render, so the server and first client paint
  // stay identical — a hydration mismatch here would flash the wrong group.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUP_KEY);
      if (raw) setOpenGroup(raw);
    } catch { /* private mode — fall back to route-driven */ }
  }, []);

  const chooseGroup = (id: string | null) => {
    const next = id ?? COLLAPSED;
    setOpenGroup(next);
    try { localStorage.setItem(GROUP_KEY, next); } catch { /* private mode */ }
  };

  /** Items a tenant's feature flags leave visible. Flags fail open while loading. */
  const visibleItemsOf = (items: NavItem[]) =>
    items.filter((item) => !item.feature || !loaded || features[item.feature] !== false);

  // The group holding the current route — the default open one until the user
  // picks another (or shuts it via the COLLAPSED sentinel).
  const routeGroup =
    groups.find((g) => visibleItemsOf(g.items).some((i) => isActive(i.path)))?.id ?? null;
  const effectiveOpen = openGroup === COLLAPSED ? null : (openGroup ?? routeGroup);

  /** Opening a group from the icon rail has to widen the panel first. */
  const openFromRail = (id: string) => {
    onToggle?.();
    chooseGroup(id);
  };

  const brandName = branding.name ?? 'QuikLMS';

  return (
    <aside
      className={cn(
        'qs-sidebar relative flex h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[264px]',
      )}
    >
      {/* ── Tenant brand ──────────────────────────────────────────────────────
          The tenant's own logo and NOTHING else — no name beside it. Most
          uploaded marks are wordmarks that already carry the name, so printing
          it again gave two names in one row and truncated the longer one ("the
          corporate of corp…"). The name still reaches the user, in the account
          footer and on the tenant pages.

          Shown to every user under the tenant: `/api/tenants/current` is
          `requireAuth`-guarded with no role gate, so a learner reads the same
          branding an admin does.

          `w-auto` with only the HEIGHT pinned is what lets a wide wordmark use
          the space the name vacated — boxing it into a square (the old `w-11`)
          letterboxed it down to a sliver, which is why an uploaded logo looked
          tiny even after the size bump. */}
      <div
        className={cn(
          'flex h-[76px] shrink-0 items-center border-b border-line',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        {branding.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo}
            alt={brandName}
            className={cn(
              'max-w-full object-contain',
              collapsed ? 'size-10' : 'h-12 w-auto',
            )}
          />
        ) : (
          // No uploaded mark — the initial tile stands in as the logo.
          <div
            className={cn(
              'qs-brandmark grid shrink-0 place-items-center rounded-xl font-black',
              collapsed ? 'size-10 text-base' : 'size-11 text-lg',
            )}
          >
            {brandName[0].toUpperCase()}
          </div>
        )}
      </div>

      {/* ── Collapse / expand toggle ──────────────────────────────────────────
          The button straddles the sidebar's right edge (`-right-3`), which puts
          its outer half under the topbar — a sticky `z-20` bar with a backdrop
          filter that spans the first 64px. At `top-[60px] z-10` the two overlapped
          between 60px and 64px and the topbar won, clipping the circle's top.

          Two fixes, and the numbers line up so neither costs anything:
            • `top-[64px]` starts the 24px circle exactly where the topbar ends,
              so they no longer share a pixel — and 64 + 12 = 76 puts its centre
              precisely on the brand header's bottom border.
            • `z-30` clears the topbar anyway, so a future change to either
              height cannot bring the clipping back. */}
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="qs-collapse-btn absolute -right-3 top-[64px] z-30 grid size-6 place-items-center rounded-full border border-line bg-surface text-fg-muted shadow-sm"
        >
          <ChevronLeft className={cn('size-3.5 transition-transform duration-200', collapsed && 'rotate-180')} />
        </button>
      )}

      {/* ── Navigation (only this scrolls) ──────────────────────────────────── */}
      <nav className={cn('flex-1 overflow-y-auto py-3 scrollbar-none', collapsed ? 'px-2' : 'px-2.5')}>
        {groups.map((group) => {
          const items = visibleItemsOf(group.items);
          if (!items.length) return null;

          // ── Single item: render the item itself, not a group around it ──────
          if (items.length === 1) {
            const item = items[0];
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={group.id}
                href={item.path}
                data-active={active}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'qs-nav-link mb-0.5 flex items-center rounded-[10px] text-[14px] transition-colors',
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5',
                  active ? 'font-semibold text-fg' : 'font-medium text-fg-muted hover:text-fg',
                )}
              >
                <Icon
                  className={cn(
                    'size-[18px] shrink-0',
                    active ? 'text-[var(--brand-primary)]' : 'text-fg-subtle',
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          }

          // ── Several items: accordion group ─────────────────────────────────
          const GroupIcon = GROUP_ICONS[group.id] ?? items[0].icon;
          const hasActive = items.some((i) => isActive(i.path));
          const open = !collapsed && effectiveOpen === group.id;

          return (
            <div key={group.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => (collapsed ? openFromRail(group.id) : chooseGroup(open ? null : group.id))}
                aria-expanded={open}
                aria-controls={`navgroup-${group.id}`}
                title={collapsed ? group.label : undefined}
                className={cn(
                  'qs-nav-row flex w-full items-center rounded-[10px] text-[14px] transition-colors',
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5',
                  hasActive ? 'font-semibold text-[var(--brand-primary)]' : 'font-medium text-fg-muted hover:text-fg',
                )}
              >
                <span className="relative shrink-0">
                  <GroupIcon
                    className={cn('size-[18px]', hasActive ? 'text-[var(--brand-primary)]' : 'text-fg-subtle')}
                  />
                  {/* In the rail there is no label to carry the active state. */}
                  {collapsed && hasActive && (
                    <span
                      className="absolute -right-1 -top-1 size-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    />
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-left">{group.label}</span>
                    <ChevronRight
                      className={cn(
                        'size-[15px] shrink-0 text-fg-subtle transition-transform duration-200',
                        open && 'rotate-90',
                      )}
                    />
                  </>
                )}
              </button>

              {/* 0fr→1fr grid animates to the content's natural height, no JS measuring. */}
              {!collapsed && (
                <div className="qs-nav-group" data-open={open} id={`navgroup-${group.id}`}>
                  <div>
                    <div className="my-0.5 ml-[22px] space-y-0.5 border-l border-line pl-3">
                      {items.map((item) => {
                        const active = isActive(item.path);
                        return (
                          <Link
                            key={item.path + item.label}
                            href={item.path}
                            data-active={active}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'qs-nav-link block truncate rounded-[9px] px-3 py-2 text-[13.5px] transition-colors',
                              active ? 'font-semibold text-fg' : 'font-medium text-fg-subtle hover:text-fg',
                            )}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* No account footer. Profile and sign out live in the topbar's account
          menu (components/UserMenu.tsx) — the sidebar carries the TENANT (its
          logo at the top), the header carries the PERSON, which is how quikhrms
          splits the two. */}
    </aside>
  );
}
