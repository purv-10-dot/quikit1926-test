'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, BookOpen, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { DashboardScaffold, StatCard } from '@/components/DashboardScaffold';
import { api } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PaginatedMeta {
  total?: number;
  count?: number;
}

interface Submission {
  id: string;
  title?: string;
  courseTitle?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  createdAt?: string;
  submittedAt?: string;
}

interface User {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  createdAt?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
  switch (status) {
    case 'PENDING':
      return (
        <span className={`${base} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300`}>
          Pending
        </span>
      );
    case 'APPROVED':
      return (
        <span className={`${base} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`}>
          Approved
        </span>
      );
    case 'REJECTED':
      return (
        <span className={`${base} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300`}>
          Rejected
        </span>
      );
    default:
      return (
        <span className={`${base} bg-surface border border-line text-fg-muted`}>
          {status}
        </span>
      );
  }
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function userDisplayName(u: User) {
  if (u.name) return u.name;
  const parts = [u.firstName, u.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return u.email ?? 'Unknown';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubAdminDashboard() {
  // Stats
  const [totalUsers, setTotalUsers] = useState<number | '—'>('—');
  const [activeCourses, setActiveCourses] = useState<number | '—'>('—');
  const [pendingSubmissions, setPendingSubmissions] = useState<number | '—'>('—');
  const [completedCourses, setCompletedCourses] = useState<number | '—'>('—');

  // Table data
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.allSettled([
          // 1 — total users
          api.get<{ meta?: PaginatedMeta; total?: number; count?: number }>('/users?limit=1'),
          // 2 — active (published) courses count
          api.get<{ meta?: PaginatedMeta; total?: number; count?: number }>('/courses?status=published&limit=1'),
          // 3 — pending submissions
          api.get<{ data?: Submission[]; items?: Submission[] } | Submission[]>(
            '/master-courses/my-submissions?status=PENDING'
          ),
          // 4 — all published courses (for "completed" stat)
          api.get<{ meta?: PaginatedMeta; total?: number; count?: number }>('/courses?status=published'),
          // 5 — submissions list for table
          api.get<{ data?: Submission[]; items?: Submission[] } | Submission[]>(
            '/master-courses/my-submissions'
          ),
          // 6 — recent users
          api.get<{ data?: User[]; items?: User[]; users?: User[] } | User[]>('/users?limit=5'),
        ]);

        // 1. total users
        if (results[0].status === 'fulfilled') {
          const d = results[0].value as Record<string, unknown>;
          const n =
            (d?.meta as PaginatedMeta)?.total ??
            (d?.meta as PaginatedMeta)?.count ??
            (d as { total?: number })?.total ??
            (d as { count?: number })?.count ??
            0;
          setTotalUsers(n);
        }

        // 2. active courses
        if (results[1].status === 'fulfilled') {
          const d = results[1].value as Record<string, unknown>;
          const n =
            (d?.meta as PaginatedMeta)?.total ??
            (d?.meta as PaginatedMeta)?.count ??
            (d as { total?: number })?.total ??
            (d as { count?: number })?.count ??
            0;
          setActiveCourses(n);
        }

        // 3. pending submissions count
        if (results[2].status === 'fulfilled') {
          const raw = results[2].value;
          const arr: Submission[] = Array.isArray(raw)
            ? (raw as Submission[])
            : ((raw as { data?: Submission[]; items?: Submission[] })?.data ??
              (raw as { data?: Submission[]; items?: Submission[] })?.items ??
              []);
          setPendingSubmissions(arr.length);
        }

        // 4. completed courses
        if (results[3].status === 'fulfilled') {
          const d = results[3].value as Record<string, unknown>;
          const n =
            (d?.meta as PaginatedMeta)?.total ??
            (d?.meta as PaginatedMeta)?.count ??
            (d as { total?: number })?.total ??
            (d as { count?: number })?.count ??
            0;
          setCompletedCourses(n);
        }

        // 5. submissions table
        if (results[4].status === 'fulfilled') {
          const raw = results[4].value;
          const arr: Submission[] = Array.isArray(raw)
            ? (raw as Submission[])
            : ((raw as { data?: Submission[]; items?: Submission[] })?.data ??
              (raw as { data?: Submission[]; items?: Submission[] })?.items ??
              []);
          setSubmissions(arr);
        }

        // 6. recent users
        if (results[5].status === 'fulfilled') {
          const raw = results[5].value;
          const arr: User[] = Array.isArray(raw)
            ? (raw as User[])
            : ((raw as { data?: User[]; items?: User[]; users?: User[] })?.data ??
              (raw as { data?: User[]; items?: User[]; users?: User[] })?.items ??
              (raw as { data?: User[]; items?: User[]; users?: User[] })?.users ??
              []);
          setRecentUsers(arr.slice(0, 5));
        }

        // Surface an error only if ALL requests failed
        const allFailed = results.every((r) => r.status === 'rejected');
        if (allFailed) {
          setError('Failed to load dashboard data. Please try refreshing.');
        }
      } catch (err) {
        console.error('SubAdminDashboard load error', err);
        setError('An unexpected error occurred while loading the dashboard.');
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardScaffold
      title="Sub Admin Dashboard"
      subtitle="Delegated administration overview"
    >
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Users"
          value={loading ? '…' : totalUsers}
          icon={Users}
        />
        <StatCard
          label="Active Courses"
          value={loading ? '…' : activeCourses}
          icon={BookOpen}
        />
        <StatCard
          label="Pending Submissions"
          value={loading ? '…' : pendingSubmissions}
          icon={Clock}
        />
        <StatCard
          label="Completed Courses"
          value={loading ? '…' : completedCourses}
          icon={CheckCircle2}
        />
      </div>

      {/* ── Two-column content area ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* ── LEFT — Submissions table (2/3 width on lg) ──────────────── */}
        <div className="lg:col-span-2 rounded-xl border border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-display text-base font-semibold text-fg">My Submissions</h2>
            <Link
              href="/my-submissions"
              className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              View All <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-fg-muted">
              Loading submissions…
            </div>
          ) : (submissions ?? []).length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-fg-muted">
              No submissions found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                    <th className="px-5 py-3">Course Name</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Submitted Date</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(submissions ?? []).map((sub) => (
                    <tr
                      key={sub.id}
                      className="border-b border-line last:border-0 hover:bg-surface-raised/50 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-fg">
                        {sub.courseTitle ?? sub.title ?? '—'}
                      </td>
                      <td className="px-5 py-3">{statusBadge(sub.status)}</td>
                      <td className="px-5 py-3 text-fg-muted">
                        {formatDate(sub.submittedAt ?? sub.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/my-submissions`}
                          className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── RIGHT column (1/3 width on lg) ──────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Quick Actions */}
          <div className="rounded-xl border border-line bg-surface shadow-sm">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-display text-base font-semibold text-fg">Quick Actions</h2>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <Link
                href="/user-management"
                className="flex items-center justify-between rounded-lg border border-line px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-surface-raised hover:border-[var(--brand-primary)]"
              >
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-[var(--brand-primary)]" />
                  Manage Users
                </span>
                <ArrowRight className="size-4 text-fg-muted" />
              </Link>
              <Link
                href="/my-submissions"
                className="flex items-center justify-between rounded-lg border border-line px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-surface-raised hover:border-[var(--brand-primary)]"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="size-4 text-[var(--brand-primary)]" />
                  Submit Content
                </span>
                <ArrowRight className="size-4 text-fg-muted" />
              </Link>
              <Link
                href="/course-analytics"
                className="flex items-center justify-between rounded-lg border border-line px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-surface-raised hover:border-[var(--brand-primary)]"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[var(--brand-primary)]" />
                  View Reports
                </span>
                <ArrowRight className="size-4 text-fg-muted" />
              </Link>
            </div>
          </div>

          {/* Recent Users */}
          <div className="rounded-xl border border-line bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-display text-base font-semibold text-fg">Recent Users</h2>
              <Link
                href="/user-management"
                className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
              >
                View All <ArrowRight className="size-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-fg-muted">
                Loading users…
              </div>
            ) : (recentUsers ?? []).length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-fg-muted">
                No users found.
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {(recentUsers ?? []).map((u) => (
                  <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                    {/* Avatar initials */}
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: 'var(--brand-primary)' }}
                      aria-hidden
                    >
                      {userDisplayName(u).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">
                        {userDisplayName(u)}
                      </p>
                      <p className="truncate text-xs text-fg-muted">{u.email ?? u.role ?? '—'}</p>
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-fg-muted">
                      {formatDate(u.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </DashboardScaffold>
  );
}
