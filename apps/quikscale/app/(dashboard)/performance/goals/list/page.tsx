"use client";

/**
 * Goals / OKRs — /performance/goals/list
 *
 * R10f: quarterly/annual goals. Distinct from Priority (which is short-term
 * execution). Each user sees their own goals by default; admins can pivot
 * to company-wide via the owner filter.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Target, CheckCircle2, AlertTriangle, CircleDashed, ChevronLeft,
  Trash2, Pencil, Search,
} from "lucide-react";
import Link from "next/link";
import { useGoals, useCreateGoal, useUpdateGoal, useDeleteGoal } from "@/lib/hooks/useGoals";
import { useUsers } from "@/lib/hooks/useUsers";
import { AddButton, EmptyState, useConfirm, Pagination, DEFAULT_PAGE_SIZE } from "@quikit/ui";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import { useCurrentQuarter } from "@/lib/hooks/useCurrentWeek";
import { GOAL_STATUSES, type GoalStatus } from "@/lib/schemas/goalSchema";

interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  ownerId: string;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  progressPercent: number | null;
  quarter: string | null;
  year: number;
  status: GoalStatus;
  owner: { id: string; firstName: string; lastName: string; email: string };
}

const STATUS_COLORS: Record<GoalStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-600", label: "Draft" },
  active: { bg: "bg-blue-100", text: "text-blue-700", label: "Active" },
  "on-track": { bg: "bg-green-100", text: "text-green-700", label: "On track" },
  "at-risk": { bg: "bg-amber-100", text: "text-amber-700", label: "At risk" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Completed" },
  abandoned: { bg: "bg-gray-100", text: "text-gray-500", label: "Abandoned" },
};

export default function GoalsPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id as string | undefined;
  const confirm = useConfirm();

  const [scope, setScope] = useState<"me" | "all">("me");
  const year = getFiscalYear();
  // getFiscalQuarter() assumes an April-start fiscal year; resolve the org's
  // REAL current quarter from its actual QuarterSetting date ranges instead,
  // falling back to the calendar guess while loading / if unresolved. An org
  // whose fiscalYearStart isn't April (schema default is January) otherwise
  // permanently filters this page to the wrong quarter — there's no picker
  // here to work around it, unlike other pages.
  const quarter = useCurrentQuarter(year) ?? getFiscalQuarter();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [sortBy, sortOrder] = sort.split(":") as [string, "asc" | "desc"];

  const { data, isLoading, error } = useGoals({
    ownerId: scope === "me" ? currentUserId : undefined,
    year,
    quarter: quarter || undefined,
    search: search.trim() || undefined,
    sortBy: sortBy === "createdAt" ? undefined : sortBy,
    sortOrder,
    page,
    pageSize,
  });
  const { data: users = [] } = useUsers();
  const createGoal = useCreateGoal();
  const deleteGoal = useDeleteGoal();

  const goals = (data?.data as GoalRow[] | undefined) ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  // Reset to page 1 whenever a filter/search/sort that changes the result set
  // is touched, so the user never lands on an out-of-range page.
  function resetTo<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    ownerId: "",
    targetValue: "",
    currentValue: "",
    unit: "",
    quarter,
    year,
    status: "draft" as GoalStatus,
  });

  function openCreate() {
    setForm({
      title: "",
      description: "",
      ownerId: currentUserId ?? "",
      targetValue: "",
      currentValue: "",
      unit: "",
      quarter,
      year,
      status: "draft",
    });
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      setFormError("Title is required");
      return;
    }
    if (!form.ownerId) {
      setFormError("Owner is required");
      return;
    }
    setFormError(null);
    try {
      await createGoal.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim() || null,
        ownerId: form.ownerId,
        targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
        currentValue: form.currentValue ? parseFloat(form.currentValue) : null,
        unit: form.unit.trim() || null,
        quarter: form.quarter || null,
        year: form.year,
        status: form.status,
      });
      setShowModal(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create");
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!(await confirm({ title: `Delete "${title}"?`, description: "This cannot be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    await deleteGoal.mutateAsync(id);
  }

  // Stats reflect the FULL filtered set (server aggregate), not just this page.
  const stats = data?.stats ?? { total: 0, onTrack: 0, atRisk: 0, completed: 0 };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/performance/goals"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Pillar Hub
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Goals</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Quarterly and annual objectives. Distinct from Priorities (short-term
              execution).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => resetTo(setSearch)(e.target.value)}
                placeholder="Search goals…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-44"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => resetTo(setSort)(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
              title="Sort goals"
            >
              <option value="createdAt:desc">Newest</option>
              <option value="title:asc">Title A–Z</option>
              <option value="title:desc">Title Z–A</option>
              <option value="status:asc">Status</option>
              <option value="progressPercent:desc">Progress (high→low)</option>
              <option value="progressPercent:asc">Progress (low→high)</option>
            </select>
            <div className="flex border border-gray-200 rounded-md overflow-hidden">
              <button
                onClick={() => resetTo(setScope)("me")}
                className={`px-3 py-1.5 text-xs font-medium ${
                  scope === "me"
                    ? "bg-accent-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Mine
              </button>
              <button
                onClick={() => resetTo(setScope)("all")}
                className={`px-3 py-1.5 text-xs font-medium ${
                  scope === "all"
                    ? "bg-accent-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                All
              </button>
            </div>
            <AddButton onClick={openCreate}>Add Goal</AddButton>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50 min-h-0">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              icon={Target}
              label="Total"
              value={stats.total}
              color="text-gray-600 bg-gray-100"
            />
            <StatCard
              icon={CheckCircle2}
              label="On track"
              value={stats.onTrack}
              color="text-green-700 bg-green-100"
            />
            <StatCard
              icon={AlertTriangle}
              label="At risk"
              value={stats.atRisk}
              color="text-amber-700 bg-amber-100"
            />
            <StatCard
              icon={CircleDashed}
              label="Completed"
              value={stats.completed}
              color="text-emerald-700 bg-emerald-100"
            />
          </div>

          {/* Goals list */}
          {isLoading && (
            <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
          )}
          {error && (
            <div className="text-sm text-red-600 text-center py-12">
              Error: {(error as Error).message}
            </div>
          )}
          {!isLoading && goals.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl">
              <EmptyState
                icon={Target}
                title="Set your first goal"
                message={`Goals are your quarterly and annual objectives — the outcomes you're working toward in ${quarter} ${year}. Unlike Priorities (short-term execution), Goals set direction.`}
                action={{ label: "Add your first goal", onClick: openCreate }}
              />
            </div>
          )}
          <div className="space-y-2">
            {goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onDelete={() => handleDelete(g.id, g.title)}
              />
            ))}
          </div>
        </div>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={stats.total}
        limit={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">New Goal</h2>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto">
              <Field label="Title *">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Launch v2 platform"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  autoFocus
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </Field>
              <Field label="Owner *">
                <select
                  value={form.ownerId}
                  onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
                >
                  <option value="">Select owner…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target">
                  <input
                    type="number"
                    value={form.targetValue}
                    onChange={(e) =>
                      setForm({ ...form, targetValue: e.target.value })
                    }
                    placeholder="100"
                    className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  />
                </Field>
                <Field label="Unit">
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="%"
                    className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  />
                </Field>
              </div>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as GoalStatus })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
                >
                  {GOAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_COLORS[s].label}
                    </option>
                  ))}
                </select>
              </Field>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createGoal.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
              >
                {createGoal.isPending ? "Creating…" : "Create goal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className={`h-6 w-6 rounded flex items-center justify-center ${color}`}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function GoalCard({
  goal,
  onDelete,
}: {
  goal: GoalRow;
  onDelete: () => void;
}) {
  const updateGoal = useUpdateGoal(goal.id);
  const statusCfg = STATUS_COLORS[goal.status];
  const ownerName = `${goal.owner.firstName} ${goal.owner.lastName}`;

  async function updateStatus(status: GoalStatus) {
    await updateGoal.mutateAsync({ status });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {goal.title}
            </h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusCfg.bg} ${statusCfg.text}`}
            >
              {statusCfg.label}
            </span>
          </div>
          {goal.description && (
            <p className="text-xs text-gray-600 mb-2">{goal.description}</p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>{ownerName}</span>
            <span>·</span>
            <span>
              {goal.quarter ?? "Annual"} {goal.year}
            </span>
            {goal.targetValue != null && (
              <>
                <span>·</span>
                <span>
                  {goal.currentValue ?? 0}/{goal.targetValue}
                  {goal.unit ? ` ${goal.unit}` : ""}
                </span>
              </>
            )}
            {goal.progressPercent != null && (
              <>
                <span>·</span>
                <span className="font-medium">{goal.progressPercent}%</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <select
            value={goal.status}
            onChange={(e) => updateStatus(e.target.value as GoalStatus)}
            disabled={updateGoal.isPending}
            className="text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white"
          >
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_COLORS[s].label}
              </option>
            ))}
          </select>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-50 text-red-500"
            title="Delete goal"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {goal.progressPercent != null && (
        <div className="mt-3 bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-accent-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, goal.progressPercent)}%` }}
          />
        </div>
      )}
    </div>
  );
}
