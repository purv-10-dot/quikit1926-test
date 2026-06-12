"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Clock, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import {
  TableSkeletonRows,
  WeekGridSkeleton,
  CardListSkeleton,
} from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { TaskDueChip } from "@/components/tasks/task-due-chip";
import { TaskEditModal, type TaskFormSeed } from "@/components/tasks/task-edit-modal";

interface TaskRow {
  id: string;
  subject: string;
  taskType: string | null;
  priority: "Low" | "Medium" | "High";
  status: "Open" | "InProgress" | "Completed" | "Cancelled";
  dueDate: string | null;
  assignedToUserId: string | null;
  relatedKind: string | null;
  relatedObjectId: string | null;
  leadId: string | null;
}

interface ListResponse {
  items: TaskRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface AssigneeOption {
  id: string;
  name: string;
}

interface Props {
  currentUserId: string;
  assignees: AssigneeOption[];
}

type ViewKey = "list" | "week" | "myDay";

const SMART_VIEWS = [
  { key: "", label: "All" },
  { key: "bd_manager_review", label: "BD Manager Review" },
  { key: "client_meeting", label: "Client Meeting" },
  { key: "intro_call", label: "Intro Call" },
  { key: "outreach", label: "Outreach" },
  { key: "follow_up", label: "Follow Up" },
];

const STATUS_FILTERS = ["", "Open", "InProgress", "Completed", "Cancelled"] as const;
const STATUS_LABEL: Record<string, string> = {
  "": "All statuses",
  Open: "Open",
  InProgress: "In Progress",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

const DUE_PRESETS = [
  { key: "", label: "Any due date" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "this_week", label: "This week" },
  { key: "next_week", label: "Next week" },
  { key: "no_date", label: "No date" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
/** My Day fetches a single big batch then OR-merges client-side. 100 fits the shared allow-list cap. */
const MY_DAY_FETCH_SIZE = 100;

function readPageFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
function readPageSizeFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("limit"));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

function nameFor(map: Map<string, string>, id: string | null): string {
  if (!id) return "Unassigned";
  return map.get(id) ?? "—";
}

export function TasksExplorer({ currentUserId, assignees }: Props) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setView] = useState<ViewKey>("list");
  const [status, setStatus] = useState<string>("");
  const [smartView, setSmartView] = useState<string>("");
  const [duePreset, setDuePreset] = useState<string>("");
  const [q, setQ] = useState("");

  const [page, setPageState] = useState<number>(() =>
    readPageFromUrl(new URLSearchParams(searchParams.toString())),
  );
  const [pageSize, setPageSizeState] = useState<number>(() =>
    readPageSizeFromUrl(new URLSearchParams(searchParams.toString())),
  );

  const writeUrl = useCallback(
    (nextPage: number, nextLimit: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (nextPage === 1) sp.delete("page");
      else sp.set("page", String(nextPage));
      if (nextLimit === DEFAULT_PAGE_SIZE) sp.delete("limit");
      else sp.set("limit", String(nextLimit));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState(next);
      writeUrl(next, pageSize);
    },
    [pageSize, writeUrl],
  );
  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      setPageState(1);
      writeUrl(1, next);
    },
    [writeUrl],
  );

  // Mirror URL → state on browser back/forward.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const nextPage = readPageFromUrl(sp);
    const nextSize = readPageSizeFromUrl(sp);
    setPageState((cur) => (cur === nextPage ? cur : nextPage));
    setPageSizeState((cur) => (cur === nextSize ? cur : nextSize));
  }, [searchParams]);

  const [items, setItems] = useState<TaskRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormSeed | null>(null);

  const assigneeMap = useMemo(() => new Map(assignees.map((u) => [u.id, u.name])), [assignees]);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (status) params.set("status", status);
    if (smartView) params.set("smartView", smartView);
    if (duePreset) params.set("duePreset", duePreset);
    if (q.trim()) params.set("q", q.trim());
    if (view === "myDay") {
      params.set("assignedToUserId", currentUserId);
      // My Day = today + overdue + InProgress; we OR them client-side after
      // pulling overdue + today via the API.
    }
    return params.toString();
  }, [page, pageSize, status, smartView, duePreset, q, view, currentUserId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "myDay") {
        // Three server calls: today's, overdue, and in-progress tasks for
        // the current user — OR-merged client-side. We use the back-compat
        // `limit` param (capped at 500) so My Day can grab a single big batch
        // without being constrained to the strict shared `pageSize` allow-list.
        const baseParams = new URLSearchParams();
        baseParams.set("assignedToUserId", currentUserId);
        baseParams.set("limit", String(MY_DAY_FETCH_SIZE));
        const [todayRes, overdueRes, inprogRes] = await Promise.all([
          fetch(`/api/tasks?${baseParams.toString()}&status=Open&duePreset=today`, { credentials: "include" }),
          fetch(`/api/tasks?${baseParams.toString()}&status=Open&duePreset=overdue`, { credentials: "include" }),
          fetch(`/api/tasks?${baseParams.toString()}&status=InProgress`, { credentials: "include" }),
        ]);
        const [today, overdue, inprog] = await Promise.all([
          todayRes.json() as Promise<ListResponse>,
          overdueRes.json() as Promise<ListResponse>,
          inprogRes.json() as Promise<ListResponse>,
        ]);
        const merged = new Map<string, TaskRow>();
        [...overdue.items, ...today.items, ...inprog.items].forEach((t) => merged.set(t.id, t));
        setItems(Array.from(merged.values()));
        setTotal(merged.size);
      } else {
        const res = await fetch(`/api/tasks?${buildQuery()}`, { credentials: "include" });
        const json: ListResponse = await res.json();
        setItems(Array.isArray(json.items) ? json.items : []);
        setTotal(typeof json.total === "number" ? json.total : 0);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [view, buildQuery, currentUserId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reset to page 1 on filter/view change — but skip first render so a deep-link like
  // `/tasks?page=3` isn't immediately reset.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, smartView, duePreset, q, view]);

  function openCreate() {
    setEditing({ priority: "Medium", status: "Open" });
    setModalOpen(true);
  }
  function openEdit(t: TaskRow) {
    setEditing({
      id: t.id,
      subject: t.subject,
      taskType: t.taskType,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      assignedToUserId: t.assignedToUserId,
      relatedKind: (t.relatedKind as TaskFormSeed["relatedKind"]) ?? null,
      relatedObjectId: t.relatedObjectId,
      leadId: t.leadId,
    });
    setModalOpen(true);
  }

  async function quickComplete(id: string) {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      toast.success("Task completed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function snooze(id: string, minutes: number) {
    try {
      const res = await fetch(`/api/tasks/${id}/snooze`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Snooze failed");
      toast.success(minutes === 60 ? "Snoozed 1 hour" : minutes === 1440 ? "Snoozed 1 day" : "Snoozed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-crm-border bg-white p-1">
          {(
            [
              { key: "list", label: "List" },
              { key: "week", label: "Week" },
              { key: "myDay", label: "My Day" },
            ] as { key: ViewKey; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={
                "rounded-md px-3 py-1.5 text-sm transition " +
                (view === t.key
                  ? "bg-crm-blue text-white"
                  : "text-crm-text hover:bg-slate-100")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button onClick={openCreate}>
          <Plus size={14} /> New task
        </Button>
      </div>

      {view !== "myDay" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-crm-muted" />
            <Input
              className="w-64 pl-7"
              placeholder="Search subject…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={smartView} onChange={(e) => setSmartView(e.target.value)}>
            {SMART_VIEWS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={duePreset} onChange={(e) => setDuePreset(e.target.value)}>
            {DUE_PRESETS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {view === "list" && (
        <div className="crm-card overflow-hidden">
          <TableScroll minWidth={720} bleed={false}>
            <Table>
              <THead>
                <TR>
                  <TH>Subject</TH>
                  <TH hideBelow="md">Priority</TH>
                  <TH>Status</TH>
                  <TH hideBelow="lg">Assigned</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeletonRows
                    rows={10}
                    columns={[
                      { widthClass: "w-48" },
                      { widthClass: "w-16", hideBelow: "md" },
                      { widthClass: "w-24" },
                      { widthClass: "w-28", hideBelow: "lg" },
                      { widthClass: "w-20" },
                      { widthClass: "w-24", className: "text-right" },
                    ]}
                  />
                ) : items.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="py-8 text-center text-crm-muted">
                      No tasks.
                    </TD>
                  </TR>
                ) : (
                  items.map((t) => (
                    <TR key={t.id}>
                      <TD>
                        <button
                          onClick={() => openEdit(t)}
                          className="block min-w-0 max-w-[260px] truncate text-left font-medium text-crm-text hover:text-crm-blue sm:max-w-none"
                        >
                          {t.subject}
                        </button>
                        {t.taskType && (
                          <div className="truncate text-xs text-crm-muted">{t.taskType}</div>
                        )}
                        {/* `<md` loses the Priority column — surface it inline. */}
                        <div className="mt-0.5 text-xs text-crm-muted md:hidden">
                          {t.priority} priority
                          {t.assignedToUserId
                            ? ` · ${nameFor(assigneeMap, t.assignedToUserId)}`
                            : ""}
                        </div>
                      </TD>
                      <TD hideBelow="md">{t.priority}</TD>
                      <TD>{STATUS_LABEL[t.status] ?? t.status}</TD>
                      <TD hideBelow="lg">{nameFor(assigneeMap, t.assignedToUserId)}</TD>
                      <TD>
                        <TaskDueChip dueDate={t.dueDate} status={t.status} />
                      </TD>
                      <TD className="text-right">
                        <RowActions
                          onComplete={() => quickComplete(t.id)}
                          onSnoozeHour={() => snooze(t.id, 60)}
                          onSnoozeDay={() => snooze(t.id, 1440)}
                          onSnoozeWeek={() => snooze(t.id, 10080)}
                          disabled={t.status === "Completed" || t.status === "Cancelled"}
                        />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableScroll>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={setPageSize}
            showPageNumbers
          />
        </div>
      )}

      {view === "week" && <WeekGrid items={items} loading={loading} onEdit={openEdit} />}

      {view === "myDay" && (
        <MyDayList
          items={items}
          loading={loading}
          assigneeMap={assigneeMap}
          onEdit={openEdit}
          onComplete={quickComplete}
          onSnoozeHour={(id) => snooze(id, 60)}
          onSnoozeDay={(id) => snooze(id, 1440)}
        />
      )}

      <TaskEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
        seed={editing}
        assigneeOptions={assignees}
      />
    </div>
  );
}

function RowActions({
  onComplete,
  onSnoozeHour,
  onSnoozeDay,
  onSnoozeWeek,
  disabled,
}: {
  onComplete: () => void;
  onSnoozeHour: () => void;
  onSnoozeDay: () => void;
  onSnoozeWeek: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (disabled) return <span className="text-xs text-crm-muted">—</span>;
  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={onComplete}
        className="crm-btn-ghost h-7 px-2 text-xs"
        title="Mark complete"
      >
        <CheckCircle2 size={14} /> Done
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="crm-btn-ghost h-7 px-2 text-xs"
        >
          <Clock size={14} /> Snooze <ChevronDown size={12} />
        </button>
        {open && (
          <div className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-crm-border bg-white shadow-lg">
            <button onMouseDown={(e) => { e.preventDefault(); onSnoozeHour(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50">1 hour</button>
            <button onMouseDown={(e) => { e.preventDefault(); onSnoozeDay(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50">1 day</button>
            <button onMouseDown={(e) => { e.preventDefault(); onSnoozeWeek(); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50">1 week</button>
          </div>
        )}
      </div>
    </div>
  );
}

function startOfThisWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  return start;
}

function WeekGrid({
  items,
  loading,
  onEdit,
}: {
  items: TaskRow[];
  loading: boolean;
  onEdit: (t: TaskRow) => void;
}) {
  const weekStart = useMemo(() => startOfThisWeek(), []);
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      return d;
    });
  }, [weekStart]);

  const buckets = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of items) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    }
    return m;
  }, [items]);

  if (loading) {
    return (
      <div className="crm-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-crm-border bg-crm-peach/30 px-2 py-2 text-xs font-semibold text-crm-text">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="h-3 w-12 animate-pulse rounded bg-crm-panel" />
          ))}
        </div>
        <WeekGridSkeleton tasksPerDay={2} />
      </div>
    );
  }

  return (
    <div className="crm-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-crm-border bg-crm-peach/30 text-xs font-semibold text-crm-text">
        {days.map((d) => (
          <div key={d.toISOString()} className="px-2 py-2">
            {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 min-h-[260px]">
        {days.map((d) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayTasks = buckets.get(key) ?? [];
          return (
            <div key={key} className="border-r border-crm-border last:border-r-0 p-2 space-y-1">
              {dayTasks.length === 0 ? (
                <span className="text-xs text-crm-muted">—</span>
              ) : (
                dayTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onEdit(t)}
                    className="block w-full rounded-md border border-crm-border bg-white px-2 py-1 text-left text-xs hover:border-crm-blue"
                  >
                    <div className="font-medium text-crm-text truncate">{t.subject}</div>
                    <TaskDueChip dueDate={t.dueDate} status={t.status} className="mt-1" />
                  </button>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyDayList({
  items,
  loading,
  assigneeMap,
  onEdit,
  onComplete,
  onSnoozeHour,
  onSnoozeDay,
}: {
  items: TaskRow[];
  loading: boolean;
  assigneeMap: Map<string, string>;
  onEdit: (t: TaskRow) => void;
  onComplete: (id: string) => void;
  onSnoozeHour: (id: string) => void;
  onSnoozeDay: (id: string) => void;
}) {
  // Sort: overdue first, then today, then in-progress without due date.
  const sorted = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    function bucket(t: TaskRow): number {
      if (!t.dueDate) return t.status === "InProgress" ? 2 : 3;
      const d = new Date(t.dueDate);
      if (d < startOfToday) return 0; // overdue
      return 1; // today
    }
    return [...items].sort((a, b) => {
      const ba = bucket(a);
      const bb = bucket(b);
      if (ba !== bb) return ba - bb;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
  }, [items]);

  if (loading) return <CardListSkeleton rows={6} />;
  if (sorted.length === 0) {
    return (
      <div className="crm-card p-12 text-center">
        <div className="text-base font-medium text-crm-text">All clear for today.</div>
        <div className="mt-1 text-sm text-crm-muted">No overdue or in-progress tasks.</div>
      </div>
    );
  }

  return (
    <ul className="crm-card divide-y divide-crm-border overflow-hidden">
      {sorted.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <button onClick={() => onEdit(t)} className="flex-1 text-left">
            <div className="font-medium text-crm-text">{t.subject}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-crm-muted">
              <TaskDueChip dueDate={t.dueDate} status={t.status} />
              <span>· {t.priority}</span>
              <span>· {assigneeMap.get(t.assignedToUserId ?? "") ?? "—"}</span>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => onComplete(t.id)} className="crm-btn-ghost h-7 px-2 text-xs">
              <CheckCircle2 size={14} /> Complete
            </button>
            <button onClick={() => onSnoozeHour(t.id)} className="crm-btn-ghost h-7 px-2 text-xs">
              +1h
            </button>
            <button onClick={() => onSnoozeDay(t.id)} className="crm-btn-ghost h-7 px-2 text-xs">
              +1d
            </button>
            <button onClick={() => onEdit(t)} className="crm-btn-ghost h-7 px-2 text-xs">Open</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
