'use client';
import { useEffect, useState } from 'react';
import {
  Building2, Users, BookOpen, TrendingUp,
  CheckCircle2, Clock, UserCircle, BarChart3, Globe, AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DashboardScaffold } from '@/components/DashboardScaffold';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
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

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Tenant Admin', SUB_ADMIN: 'Sub-Admin', MANAGER: 'Manager',
  TEACHER: 'Teacher', LEARNER: 'Learner', PARENT: 'Parent',
};
const ROLE_ORDER = ['LEARNER', 'TEACHER', 'TENANT_ADMIN', 'PARENT', 'MANAGER', 'SUB_ADMIN'];
const ROLE_COLORS: Record<string, string> = {
  LEARNER: 'bg-[var(--brand-primary)]', TEACHER: 'bg-info', TENANT_ADMIN: 'bg-success',
  PARENT: 'bg-warning', MANAGER: 'bg-danger', SUB_ADMIN: 'bg-fg-subtle',
};

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent = false,
}: { label: string; value: string | number; sub?: string; icon: LucideIcon; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg-muted">{label}</p>
          <p className="mt-1.5 font-display text-3xl font-semibold tabular text-fg">{value}</p>
          {sub && <p className="mt-1 text-xs text-fg-subtle">{sub}</p>}
        </div>
        <div className={cn('shrink-0 rounded-lg p-2.5', accent ? 'bg-[var(--brand-primary)]' : 'bg-[var(--brand-primary)]/10')}>
          <Icon className={cn('size-5', accent ? 'text-white' : 'text-[var(--brand-primary)]')} aria-hidden />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
    Active: { tone: 'success', label: 'Active' },
    Trial: { tone: 'warning', label: 'Trial' },
    Paused: { tone: 'danger', label: 'Paused' },
  };
  const cfg = map[status] ?? { tone: 'neutral', label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge tone={type === 'corporate' ? 'brand' : 'info'}>
      {type === 'corporate' ? 'Corporate' : 'School'}
    </Badge>
  );
}

function RoleBar({ role, count, total }: { role: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-fg-muted">{ROLE_LABELS[role] ?? role}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-surface-muted h-1.5">
        <div
          className={cn('h-full rounded-full transition-all duration-700', ROLE_COLORS[role] ?? 'bg-fg-subtle')}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${ROLE_LABELS[role] ?? role}: ${count} users`}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs tabular text-fg-muted">{count}</span>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="size-10 rounded-lg" />
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<{ data: Stats }>('/super-admin/stats')
      .then((r) => setStats(r.data))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <DashboardScaffold title="Super Admin Dashboard" subtitle="Platform overview">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface p-12 text-center">
          <AlertCircle className="size-8 text-danger" aria-hidden />
          <p className="font-medium text-fg">Failed to load dashboard data</p>
          <p className="text-sm text-fg-muted">Check the API connection and try refreshing the page.</p>
        </div>
      </DashboardScaffold>
    );
  }

  const s = stats;

  // Role distribution ordered for display
  const roleEntries = ROLE_ORDER
    .map((r) => ({ role: r, count: s?.users.byRole[r] ?? 0 }))
    .filter((e) => e.count > 0);

  return (
    <DashboardScaffold
      title="Super Admin Dashboard"
      subtitle="Platform health across all tenants"
    >
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {s ? (
          <>
            <KpiCard
              label="Total Tenants"
              value={s.tenants.total}
              sub={`${s.tenants.corporate} corporate · ${s.tenants.school} school`}
              icon={Building2}
            />
            <KpiCard
              label="Platform Users"
              value={s.users.total}
              sub={`${s.tenants.active} tenant${s.tenants.active !== 1 ? 's' : ''} active`}
              icon={Users}
            />
            <KpiCard
              label="Master Courses"
              value={s.masterCourses.total}
              sub={`${s.masterCourses.published} published · ${s.masterCourses.draft} draft`}
              icon={BookOpen}
            />
            {/* Completion rate with ProgressRing */}
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg-muted">Completion Rate</p>
                  <p className="mt-1.5 font-display text-3xl font-semibold tabular text-fg">{s.progress.rate}%</p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    {s.progress.completed} of {s.progress.total} enrollments
                  </p>
                </div>
                <ProgressRing value={s.progress.rate} size={56} strokeWidth={5} />
              </div>
            </div>
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
        )}
      </div>

      {/* ── Content Row ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

        {/* Tenant Directory — 2/3 */}
        <div className="xl:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-4 text-fg-muted" aria-hidden />
                  Tenant Directory
                </CardTitle>
                <CardDescription>All registered organizations</CardDescription>
              </div>
              {s && (
                <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <span className="inline-flex size-2 rounded-full bg-success" aria-hidden />
                  {s.tenants.active} active
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              {s ? (
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full min-w-[560px] text-sm" role="table">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="pb-2.5 text-left text-xs font-medium text-fg-muted" scope="col">Organization</th>
                        <th className="pb-2.5 text-left text-xs font-medium text-fg-muted" scope="col">Type</th>
                        <th className="pb-2.5 text-left text-xs font-medium text-fg-muted" scope="col">Status</th>
                        <th className="pb-2.5 text-left text-xs font-medium text-fg-muted hidden md:table-cell" scope="col">Contact</th>
                        <th className="pb-2.5 text-left text-xs font-medium text-fg-muted hidden lg:table-cell" scope="col">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {s.tenants.recent.map((t) => (
                        <tr key={t.id} className="group transition-colors hover:bg-surface-muted/60">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 font-display text-xs font-semibold text-[var(--brand-primary)]"
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
                          <td className="py-3 pr-4 hidden md:table-cell">
                            <span className="truncate text-fg-muted max-w-[180px] block">{t.officialEmail}</span>
                          </td>
                          <td className="py-3 hidden lg:table-cell">
                            <span className="text-fg-subtle tabular">{fmt(t.createdAt)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
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
                    <RoleBar key={role} role={role} count={count} total={s.users.total} />
                  )) : (
                    <p className="text-sm text-fg-subtle text-center py-4">No users yet</p>
                  )}
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs text-fg-muted">Total platform users</span>
                    <span className="font-display text-sm font-semibold tabular text-fg">{s.users.total}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-1.5 flex-1 rounded-full" />
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
                <CardDescription>Master course status breakdown</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {s ? (
                <div className="space-y-2.5">
                  {[
                    { label: 'Published', value: s.masterCourses.published, tone: 'text-success', bg: 'bg-success' },
                    { label: 'Draft', value: s.masterCourses.draft, tone: 'text-fg-muted', bg: 'bg-fg-subtle' },
                    {
                      label: 'Other',
                      value: s.masterCourses.total - s.masterCourses.published - s.masterCourses.draft,
                      tone: 'text-warning',
                      bg: 'bg-warning',
                    },
                  ].filter((r) => r.value > 0).map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={cn('inline-flex size-2 rounded-full', row.bg)} aria-hidden />
                        <span className="text-sm text-fg-muted">{row.label}</span>
                      </div>
                      <span className={cn('font-display text-sm font-semibold tabular', row.tone)}>{row.value}</span>
                    </div>
                  ))}
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                    {s.masterCourses.published > 0 && (
                      <div className="bg-success h-full" style={{ width: `${(s.masterCourses.published / s.masterCourses.total) * 100}%` }} aria-hidden />
                    )}
                    {s.masterCourses.draft > 0 && (
                      <div className="bg-fg-subtle h-full" style={{ width: `${(s.masterCourses.draft / s.masterCourses.total) * 100}%` }} aria-hidden />
                    )}
                  </div>
                  <p className="text-xs text-fg-subtle text-right tabular">{s.masterCourses.total} total</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-8" />
                    </div>
                  ))}
                  <Skeleton className="mt-3 h-2 w-full rounded-full" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Recent Users ── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-fg-muted" aria-hidden />
              Recent Signups
            </CardTitle>
            <CardDescription>Latest users across the platform</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {s ? (
            s.users.recent.length > 0 ? (
              <div className="space-y-3">
                {s.users.recent.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-muted/60">
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/10 font-display text-xs font-semibold text-[var(--brand-primary)]"
                      aria-hidden
                    >
                      {initials(`${u.firstName} ${u.lastName}`)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{u.firstName} {u.lastName}</p>
                      <p className="truncate text-xs text-fg-subtle">{u.email}</p>
                    </div>
                    <div className="hidden shrink-0 sm:flex flex-col items-end gap-1">
                      <Badge tone="neutral">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                      <span className="text-xs text-fg-subtle tabular">{fmt(u.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <UserCircle className="size-8 text-fg-subtle" aria-hidden />
                <p className="text-sm text-fg-muted">No users yet</p>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tenant Status Overview ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Tenants', value: s?.tenants.active, icon: CheckCircle2, color: 'text-success', bg: 'bg-success-soft' },
          { label: 'Trial Tenants', value: s?.tenants.trial, icon: Clock, color: 'text-warning', bg: 'bg-warning-soft' },
          { label: 'Paused Tenants', value: s?.tenants.paused, icon: AlertCircle, color: 'text-danger', bg: 'bg-danger-soft' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', bg)}>
              <Icon className={cn('size-4.5', color)} aria-hidden />
            </div>
            <div>
              <p className="text-xs text-fg-muted">{label}</p>
              {s ? (
                <p className={cn('font-display text-xl font-semibold tabular', color)}>{value ?? 0}</p>
              ) : (
                <Skeleton className="mt-1 h-6 w-8" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Progress Overview ── */}
      <Card>
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
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex shrink-0 justify-center sm:justify-start">
                <ProgressRing value={s.progress.rate} size={88} strokeWidth={7} />
              </div>
              <div className="flex-1 space-y-3">
                {[
                  { label: 'Completed', value: s.progress.completed, color: 'bg-success', text: 'text-success' },
                  { label: 'In Progress', value: s.progress.inProgress, color: 'bg-info', text: 'text-info' },
                  {
                    label: 'Not Started',
                    value: s.progress.total - s.progress.completed - s.progress.inProgress,
                    color: 'bg-fg-subtle',
                    text: 'text-fg-muted',
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className={cn('inline-flex size-2 rounded-full shrink-0', row.color)} aria-hidden />
                    <span className="flex-1 text-sm text-fg-muted">{row.label}</span>
                    <span className={cn('font-display text-sm font-semibold tabular', row.text)}>{row.value}</span>
                    <span className="w-10 text-right text-xs text-fg-subtle tabular">
                      {s.progress.total > 0 ? Math.round((row.value / s.progress.total) * 100) : 0}%
                    </span>
                  </div>
                ))}
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted mt-1">
                  {s.progress.total > 0 && (
                    <>
                      <div className="bg-success h-full" style={{ width: `${(s.progress.completed / s.progress.total) * 100}%` }} aria-hidden />
                      <div className="bg-info h-full" style={{ width: `${(s.progress.inProgress / s.progress.total) * 100}%` }} aria-hidden />
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-5">
              <Skeleton className="size-[88px] rounded-full shrink-0" />
              <div className="flex-1 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-3.5 flex-1" />
                    <Skeleton className="h-3.5 w-8" />
                  </div>
                ))}
                <Skeleton className="h-2 w-full rounded-full mt-1" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardScaffold>
  );
}
