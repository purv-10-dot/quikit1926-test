'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2, Users, BookOpen, TrendingUp,
  CheckCircle2, Clock, UserCircle, BarChart3, Globe, AlertCircle,
  Search, RefreshCw, PauseCircle, School,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { cn } from '@/lib/cn';

// ─── types ────────────────────────────────────────────────────────────────────

interface RecentTenant {
  id: string; name: string; subdomain: string;
  tenantType: string; status: string; officialEmail: string; createdAt: string;
}
interface RecentUser {
  id: string; firstName: string; lastName: string; email: string; role: string; createdAt: string;
}
interface Stats {
  tenants: { total: number; corporate: number; school: number; active: number; trial: number; paused: number; recent: RecentTenant[] };
  users: { total: number; byRole: Record<string, number>; recent: RecentUser[] };
  masterCourses: { total: number; published: number; draft: number };
  progress: { total: number; completed: number; inProgress: number; rate: number };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(date: Date) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}
function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Tenant Admin', SUB_ADMIN: 'Sub-Admin', MANAGER: 'Manager',
  TEACHER: 'Teacher', LEARNER: 'Learner', PARENT: 'Parent',
};

// Tone → token classes / glow. Never hardcode colors — CLAUDE.md.
//
// Semantic tokens are space-separated RGB channels, so `bg-info-soft` and the
// `/<alpha>` modifier both work on them. `--brand-primary` is a per-tenant HEX,
// and Tailwind 3.4 cannot apply an opacity modifier to an arbitrary `var()`
// color: `bg-[var(--brand-primary)]/10` is silently dropped from the compiled
// CSS (verified with `npx tailwindcss --content`), so it renders no background
// at all. `color-mix()` — already this app's baseline, see the sidebar rules in
// globals.css — is the form that actually emits CSS. Tailwind's scanner reads
// these string literals, so keeping them in consts is safe.
const BRAND_TINT = 'bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)]';
const BRAND_TINT_HOVER = 'hover:bg-[color-mix(in_srgb,var(--brand-primary)_5%,transparent)]';

type Tone = 'brand' | 'info' | 'success' | 'warning' | 'danger';
const CHIP: Record<Tone, string> = {
  brand: `${BRAND_TINT} text-[var(--brand-primary)]`,
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};
const GLOW: Record<Tone, string> = {
  brand: 'radial-gradient(circle at center, color-mix(in srgb, var(--brand-primary) 22%, transparent), transparent 70%)',
  info: 'radial-gradient(circle at center, color-mix(in srgb, rgb(var(--info)) 22%, transparent), transparent 70%)',
  success: 'radial-gradient(circle at center, color-mix(in srgb, rgb(var(--success)) 22%, transparent), transparent 70%)',
  warning: 'radial-gradient(circle at center, color-mix(in srgb, rgb(var(--warning)) 22%, transparent), transparent 70%)',
  danger: 'radial-gradient(circle at center, color-mix(in srgb, rgb(var(--danger)) 22%, transparent), transparent 70%)',
};

// ─── animated counter ──────────────────────────────────────────────────────────

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Counts from the previous value to `target` with an ease-out on mount and on
 *  every data refresh. Honors prefers-reduced-motion (snaps instantly). */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (prefersReducedMotion() || from === target) {
      setVal(target);
      fromRef.current = target;
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(from + (target - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setVal(target);
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return Math.round(val);
}

// ─── primitives ─────────────────────────────────────────────────────────────

/** A thin part-to-whole bar. Segments separated by a 2px surface gap (gap-0.5). */
function MiniSplit({ segments }: { segments: { value: number; className: string; label: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-muted" role="img"
      aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
      {total > 0 && segments.filter((s) => s.value > 0).map((s) => (
        <div key={s.label} className={cn('h-full rounded-full', s.className)}
          style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
}

function StatTile({
  tone, icon: Icon, label, value, suffix, delay = 0, sub, ring,
}: {
  tone: Tone; icon: LucideIcon; label: string; value: number; suffix?: string;
  delay?: number; sub?: React.ReactNode; ring?: React.ReactNode;
}) {
  const count = useCountUp(value);
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: GLOW[tone] }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className={cn('flex size-11 items-center justify-center rounded-xl', CHIP[tone])}>
          <Icon className="size-5" aria-hidden />
        </div>
        {ring}
      </div>
      <p className="relative mt-4 text-sm font-medium text-fg-muted">{label}</p>
      <p className="relative mt-1 font-display text-3xl font-semibold tabular text-fg">
        {count}{suffix}
      </p>
      {sub && <div className="relative mt-2.5 space-y-1.5">{sub}</div>}
    </div>
  );
}

function StatTileSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="size-12 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-4 w-24" />
      <Skeleton className="mt-2 h-8 w-16" />
      <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
    active: { tone: 'success', label: 'Active' },
    Active: { tone: 'success', label: 'Active' },
    paused: { tone: 'danger', label: 'Paused' },
    Paused: { tone: 'danger', label: 'Paused' },
    trial: { tone: 'warning', label: 'Trial' },
  };
  const cfg = map[status] ?? { tone: 'success' as const, label: status ? status[0].toUpperCase() + status.slice(1) : 'Active' };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge tone={type === 'corporate' ? 'brand' : 'info'}>
      {type === 'corporate' ? 'Corporate' : 'School'}
    </Badge>
  );
}

/** Sequential single-hue magnitude bar — bars scaled to the largest role so the
 *  reader compares counts at a glance. Share-of-total shown on hover. */
function RoleBar({ role, count, total, max }: { role: string; count: number; total: number; max: number }) {
  const share = pct(count, total);
  const width = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="group flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs font-medium text-fg-muted">{ROLE_LABELS[role] ?? role}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-[var(--brand-primary)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${width}%` }}
          role="progressbar"
          aria-valuenow={share}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${ROLE_LABELS[role] ?? role}: ${count} users (${share}%)`}
        />
      </div>
      <span className="flex w-16 shrink-0 items-baseline justify-end gap-1 text-right text-xs tabular">
        <span className="font-semibold text-fg">{count}</span>
        <span className="text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100">{share}%</span>
      </span>
    </div>
  );
}

interface Segment { label: string; value: number; bar: string; text: string }

/** Horizontal part-to-whole with a legend. Legend carries identity (dot + label
 *  in text tokens); the bar carries the color. 2px surface gaps between fills. */
function StackedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  return (
    <div className="space-y-3.5">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-muted" role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => (
          <div key={s.label} className={cn('h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none', s.bar)}
            style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <ul className="space-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span className={cn('size-2.5 shrink-0 rounded-full', s.bar)} aria-hidden />
            <span className="flex-1 text-fg-muted">{s.label}</span>
            <span className={cn('font-display text-sm font-semibold tabular', s.text)}>{s.value}</span>
            <span className="w-10 text-right text-xs tabular text-fg-subtle">{pct(s.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniStat({ tone, icon: Icon, label, value, delay = 0 }: {
  tone: Tone; icon: LucideIcon; label: string; value: number; delay?: number;
}) {
  const count = useCountUp(value);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}>
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', CHIP[tone])}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-fg-muted">{label}</p>
        <p className="font-display text-xl font-semibold tabular text-fg">{count}</p>
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Tenant Directory controls
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<'all' | 'corporate' | 'school'>('all');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ data: Stats }>('/super-admin/stats')
      .then((r) => { setStats(r.data); setUpdatedAt(new Date()); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = stats;

  // Role distribution — sorted by count (magnitude), largest first.
  const roleEntries = useMemo(() => {
    if (!s) return [];
    return Object.entries(s.users.byRole)
      .map(([role, count]) => ({ role, count }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [s]);
  const roleMax = roleEntries[0]?.count ?? 0;

  // Tenant Directory — client-side filter across segment + search.
  const filteredTenants = useMemo(() => {
    if (!s) return [];
    const q = query.trim().toLowerCase();
    return s.tenants.recent.filter((t) => {
      if (segment !== 'all' && t.tenantType !== segment) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.subdomain.toLowerCase().includes(q) ||
        t.officialEmail.toLowerCase().includes(q)
      );
    });
  }, [s, query, segment]);

  const segments = s
    ? [
        { value: 'all' as const, label: 'All', count: s.tenants.recent.length },
        { value: 'corporate' as const, label: 'Corporate', count: s.tenants.recent.filter((t) => t.tenantType === 'corporate').length },
        { value: 'school' as const, label: 'School', count: s.tenants.recent.filter((t) => t.tenantType === 'school').length },
      ]
    : [];

  if (error) {
    return (
      <DashboardScaffold title="Super Admin Dashboard" subtitle="Platform health across all tenants">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-danger-soft">
            <AlertCircle className="size-6 text-danger" aria-hidden />
          </div>
          <p className="font-medium text-fg">Failed to load dashboard data</p>
          <p className="max-w-sm text-sm text-fg-muted">Check the API connection and try again.</p>
          <Button variant="outline" size="sm" onClick={load} loading={loading} className="mt-1">
            <RefreshCw className="size-4" aria-hidden /> Retry
          </Button>
        </div>
      </DashboardScaffold>
    );
  }

  const learners = s?.users.byRole['LEARNER'] ?? 0;
  const courseOther = s ? Math.max(0, s.masterCourses.total - s.masterCourses.published - s.masterCourses.draft) : 0;
  const notStarted = s ? Math.max(0, s.progress.total - s.progress.completed - s.progress.inProgress) : 0;

  return (
    <DashboardScaffold
      title="Super Admin Dashboard"
      subtitle="Platform health across all tenants"
      actions={
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="hidden text-xs text-fg-subtle sm:inline">Updated {fmtTime(updatedAt)}</span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            <span className="relative flex size-1.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            Live
          </span>
          <Button variant="outline" size="sm" onClick={load} loading={loading} aria-label="Refresh dashboard">
            <RefreshCw className="size-4" aria-hidden /> Refresh
          </Button>
        </div>
      }
    >
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
        {s ? (
          <>
            <StatTile
              tone="brand" icon={Building2} label="Total Tenants" value={s.tenants.total} delay={0}
              sub={
                <>
                  <MiniSplit segments={[
                    { value: s.tenants.corporate, className: 'bg-[var(--brand-primary)]', label: 'Corporate' },
                    { value: s.tenants.school, className: 'bg-info', label: 'School' },
                  ]} />
                  <p className="text-xs text-fg-subtle">{s.tenants.corporate} corporate · {s.tenants.school} school</p>
                </>
              }
            />
            <StatTile
              tone="info" icon={Users} label="Platform Users" value={s.users.total} delay={60}
              sub={
                <>
                  <MiniSplit segments={[
                    { value: learners, className: 'bg-info', label: 'Learners' },
                    { value: Math.max(0, s.users.total - learners), className: 'bg-[var(--brand-primary)]', label: 'Staff & others' },
                  ]} />
                  <p className="text-xs text-fg-subtle">{learners} learners · {s.tenants.active} active tenant{s.tenants.active !== 1 ? 's' : ''}</p>
                </>
              }
            />
            <StatTile
              tone="success" icon={BookOpen} label="Master Courses" value={s.masterCourses.total} delay={120}
              sub={
                <>
                  <MiniSplit segments={[
                    { value: s.masterCourses.published, className: 'bg-success', label: 'Published' },
                    { value: s.masterCourses.draft, className: 'bg-fg-subtle', label: 'Draft' },
                  ]} />
                  <p className="text-xs text-fg-subtle">{s.masterCourses.published} published · {s.masterCourses.draft} draft</p>
                </>
              }
            />
            <StatTile
              tone="warning" icon={TrendingUp} label="Completion Rate" value={s.progress.rate} suffix="%" delay={180}
              ring={<ProgressRing value={s.progress.rate} size={52} strokeWidth={5} />}
              sub={<p className="text-xs text-fg-subtle">{s.progress.completed} of {s.progress.total} enrollments</p>}
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />)
        )}
      </div>

      {/* ── Directory + Distribution Row ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

        {/* Tenant Directory — 2/3 */}
        <div className="xl:col-span-2">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex-col items-stretch gap-4 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-4 text-fg-muted" aria-hidden />
                  Tenant Directory
                </CardTitle>
                <CardDescription>All registered organizations</CardDescription>
              </div>
              {s && (
                <div className="relative sm:ml-auto sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search tenants…"
                    aria-label="Search tenants"
                    className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-[var(--brand-primary)]"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 pt-4">
              {s ? (
                <>
                  {/* Segmented filter */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex rounded-lg border border-line bg-surface-muted p-0.5" role="tablist" aria-label="Filter tenants by type">
                      {segments.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          role="tab"
                          aria-selected={segment === o.value}
                          onClick={() => setSegment(o.value)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                            segment === o.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                          )}
                        >
                          {o.label}
                          <span className={cn('tabular', segment === o.value ? 'text-fg-muted' : 'text-fg-subtle')}>{o.count}</span>
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-fg-subtle">
                      Showing <span className="tabular font-medium text-fg-muted">{filteredTenants.length}</span> of {s.tenants.recent.length}
                    </span>
                  </div>

                  {filteredTenants.length > 0 ? (
                    <div className="-mx-5 overflow-x-auto px-5">
                      <table className="w-full min-w-[560px] text-sm" role="table">
                        <thead>
                          <tr className="border-b border-line">
                            <th className="pb-2.5 text-left text-xs font-medium text-fg-muted" scope="col">Organization</th>
                            <th className="pb-2.5 text-left text-xs font-medium text-fg-muted" scope="col">Type</th>
                            <th className="pb-2.5 text-left text-xs font-medium text-fg-muted" scope="col">Status</th>
                            <th className="hidden pb-2.5 text-left text-xs font-medium text-fg-muted md:table-cell" scope="col">Contact</th>
                            <th className="hidden pb-2.5 text-left text-xs font-medium text-fg-muted lg:table-cell" scope="col">Joined</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {filteredTenants.map((t) => (
                            <tr key={t.id} className={cn('group transition-colors', BRAND_TINT_HOVER)}>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={cn(
                                      'flex size-8 shrink-0 items-center justify-center rounded-lg font-display text-xs font-semibold text-[var(--brand-primary)] transition-transform group-hover:scale-105',
                                      BRAND_TINT,
                                    )}
                                    aria-hidden
                                  >
                                    {initials(t.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-fg">{t.name}</p>
                                    <p className="truncate text-xs text-fg-subtle">{t.subdomain}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 pr-4"><TypeBadge type={t.tenantType} /></td>
                              <td className="py-3 pr-4"><StatusBadge status={t.status} /></td>
                              <td className="hidden py-3 pr-4 md:table-cell">
                                <span className="block max-w-[180px] truncate text-fg-muted">{t.officialEmail}</span>
                              </td>
                              <td className="hidden py-3 lg:table-cell">
                                <span className="tabular text-fg-subtle">{fmt(t.createdAt)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                      <Search className="size-7 text-fg-subtle" aria-hidden />
                      <p className="text-sm text-fg-muted">No tenants match your filters</p>
                      <button
                        type="button"
                        onClick={() => { setQuery(''); setSegment('all'); }}
                        className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-8 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column — 1/3 */}
        <div className="flex flex-col gap-4">
          {/* User Distribution */}
          <Card className="flex-1">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-fg-muted" aria-hidden />
                  User Distribution
                </CardTitle>
                <CardDescription>By role across all tenants</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {s ? (
                <div className="space-y-3.5">
                  {roleEntries.length > 0 ? roleEntries.map(({ role, count }) => (
                    <RoleBar key={role} role={role} count={count} total={s.users.total} max={roleMax} />
                  )) : (
                    <p className="py-4 text-center text-sm text-fg-subtle">No users yet</p>
                  )}
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs text-fg-muted">Total platform users</span>
                    <span className="font-display text-sm font-semibold tabular text-fg">{s.users.total}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 flex-1 rounded-full" />
                      <Skeleton className="h-3 w-6" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Course Pipeline */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="size-4 text-fg-muted" aria-hidden />
                  Course Pipeline
                </CardTitle>
                <CardDescription>Master course status</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {s ? (
                s.masterCourses.total > 0 ? (
                  <StackedBar segments={[
                    { label: 'Published', value: s.masterCourses.published, bar: 'bg-success', text: 'text-success' },
                    { label: 'Draft', value: s.masterCourses.draft, bar: 'bg-fg-subtle', text: 'text-fg-muted' },
                    { label: 'Other', value: courseOther, bar: 'bg-warning', text: 'text-warning' },
                  ].filter((r) => r.value > 0)} />
                ) : (
                  <p className="py-4 text-center text-sm text-fg-subtle">No courses yet</p>
                )
              ) : (
                <div className="space-y-2.5">
                  <Skeleton className="h-2.5 w-full rounded-full" />
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-8" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Progress + Recent Signups Row ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Learning Progress — 2/3 */}
        <div className="xl:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-fg-muted" aria-hidden />
                  Learning Progress
                </CardTitle>
                <CardDescription>Enrollment completion across all tenants</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {s ? (
                s.progress.total > 0 ? (
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                    <div className="flex shrink-0 flex-col items-center gap-2 sm:w-32">
                      <ProgressRing value={s.progress.rate} size={104} strokeWidth={8} />
                      <span className="text-xs text-fg-muted">Completion</span>
                    </div>
                    <div className="flex-1">
                      <StackedBar segments={[
                        { label: 'Completed', value: s.progress.completed, bar: 'bg-success', text: 'text-success' },
                        { label: 'In Progress', value: s.progress.inProgress, bar: 'bg-info', text: 'text-info' },
                        { label: 'Not Started', value: notStarted, bar: 'bg-fg-subtle', text: 'text-fg-muted' },
                      ]} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <TrendingUp className="size-8 text-fg-subtle" aria-hidden />
                    <p className="text-sm text-fg-muted">No enrollments yet</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                  <Skeleton className="size-[104px] shrink-0 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-2.5 w-full rounded-full" />
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-8" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Signups — 1/3 */}
        <Card className="h-full">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-fg-muted" aria-hidden />
                Recent Signups
              </CardTitle>
              <CardDescription>Latest platform users</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {s ? (
              s.users.recent.length > 0 ? (
                <ul className="space-y-1">
                  {s.users.recent.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-muted">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-semibold text-[var(--brand-primary)]',
                          BRAND_TINT,
                        )}
                        aria-hidden
                      >
                        {initials(`${u.firstName} ${u.lastName}`)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{u.firstName} {u.lastName}</p>
                        <p className="truncate text-xs text-fg-subtle">{u.email}</p>
                      </div>
                      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                        <Badge tone="neutral">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                        <span className="text-xs tabular text-fg-subtle">{fmt(u.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <UserCircle className="size-8 text-fg-subtle" aria-hidden />
                  <p className="text-sm text-fg-muted">No users yet</p>
                </div>
              )
            ) : (
              <div className="space-y-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="size-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-44" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tenant Status Tiles ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {s ? (
          <>
            <MiniStat tone="success" icon={CheckCircle2} label="Active Tenants" value={s.tenants.active} delay={0} />
            <MiniStat tone="danger" icon={PauseCircle} label="Paused Tenants" value={s.tenants.paused} delay={60} />
            <MiniStat tone="brand" icon={Building2} label="Corporate" value={s.tenants.corporate} delay={120} />
            <MiniStat tone="info" icon={School} label="School" value={s.tenants.school} delay={180} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
              <Skeleton className="size-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-8" />
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardScaffold>
  );
}
