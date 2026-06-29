"use client";

import { useCallback, useEffect, useState } from "react";
import { Zap, CalendarRange, Search } from "lucide-react";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { Pagination } from "@/components/reports/pagination";

interface EpicUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
}
interface Epic {
  id: string;
  key: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status?: { id: string; name: string; color: string | null; category: string } | null;
  assignee?: EpicUser | null;
}
interface Progress {
  done: number;
  inProgress: number;
  todo: number;
  total: number;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function userColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}
function userName(u: EpicUser): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
}
function userInitials(u: EpicUser): string {
  return ((u.firstName?.[0] ?? u.email[0] ?? "?") + (u.lastName?.[0] ?? "")).toUpperCase();
}

const COLS = "grid grid-cols-[minmax(0,1.6fr)_140px_minmax(160px,1fr)_180px] gap-4 px-4";

export function EpicsView({ projectId }: { projectId: string }) {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Debounce the search box: the fetch keys off `appliedSearch`, which only
  // updates 300ms after the last keystroke — so typing is instant but we fire
  // at most one request per pause, not one per character.
  useEffect(() => {
    const t = setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to the first page whenever the applied query changes.
  useEffect(() => {
    setPage(1);
  }, [appliedSearch]);

  const loadEpics = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      projectId,
      type: "EPIC",
      expand: "true",
      page: String(page),
      pageSize: String(pageSize),
    });
    if (appliedSearch) params.set("search", appliedSearch);
    const res = await fetch(`/api/issues?${params.toString()}`)
      .then((r) => r.json())
      .catch(() => null);
    if (res?.success) {
      setEpics((res.data ?? []) as Epic[]);
      setTotal(typeof res.total === "number" ? res.total : 0);
      setTotalPages(Math.max(1, res.totalPages ?? 1));
    }
    setLoading(false);
  }, [projectId, page, pageSize, appliedSearch]);

  // Progress is space-wide (all epics) and independent of the current page.
  const loadProgress = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/summary`)
      .then((r) => r.json())
      .catch(() => null);
    if (res?.success) {
      const rows = (res.data?.epicProgress ?? []) as Array<{ id: string } & Progress>;
      setProgress(new Map(rows.map((e) => [e.id, e] as const)));
    }
  }, [projectId]);

  useEffect(() => {
    void loadEpics();
  }, [loadEpics]);

  useEffect(() => {
    void loadProgress();
    const onUpdated = () => {
      void loadEpics();
      void loadProgress();
    };
    window.addEventListener("quiktrack:issue-updated", onUpdated);
    return () => window.removeEventListener("quiktrack:issue-updated", onUpdated);
  }, [loadEpics, loadProgress]);

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Epics</h1>
          <p className="text-sm text-gray-500">
            Large bodies of work in this project, with progress across their child items.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search epics…"
            className="h-9 w-64 pl-8 pr-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        </div>
      </header>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className={`${COLS} py-3 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200 font-semibold`}>
          <div>Epic</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Dates / Assignee</div>
        </div>

        {loading ? (
          Array.from({ length: pageSize > 6 ? 6 : pageSize }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-t border-gray-100 first:border-t-0">
              <span className="qt-shimmer block h-6 rounded" />
            </div>
          ))
        ) : epics.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Zap className="mx-auto h-6 w-6 text-gray-300" />
            <div className="mt-2 text-sm font-medium text-gray-700">
              {appliedSearch ? "No epics match your search" : "No epics yet"}
            </div>
            <div className="text-xs text-gray-400">
              {appliedSearch ? "Try a different name or key." : "Create an epic to group related work items."}
            </div>
          </div>
        ) : (
          epics.map((e) => {
            const p = progress.get(e.id);
            const totalChildren = Math.max(1, p?.total ?? 0);
            const donePct = p ? (p.done / totalChildren) * 100 : 0;
            const inProgPct = p ? (p.inProgress / totalChildren) * 100 : 0;
            const u = e.assignee;
            return (
              <div
                key={e.id}
                className={`${COLS} py-3 border-t border-gray-100 items-center hover:bg-blue-50/30 transition-colors`}
              >
                <button
                  type="button"
                  onClick={() => setEditingId(e.id)}
                  className="flex items-center gap-2.5 text-left min-w-0 group"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-purple-100">
                    <Zap className="h-3.5 w-3.5 text-purple-600" />
                  </span>
                  <span className="min-w-0">
                    <span className="text-[11px] font-medium text-gray-500">{e.key}</span>
                    <span className="block truncate text-sm text-gray-900 group-hover:text-blue-700 group-hover:underline">
                      {e.title}
                    </span>
                  </span>
                </button>

                <div>
                  {e.status ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium text-gray-700 bg-gray-100">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.status.color ?? "#9ca3af" }} />
                      {e.status.name}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>

                <div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full bg-green-500" style={{ width: `${donePct}%` }} />
                    <div className="h-full bg-blue-500" style={{ width: `${inProgPct}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
                    {p ? `${p.done} done · ${p.inProgress} in progress · ${p.todo} to do` : "No child items"}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                    <CalendarRange className="h-3.5 w-3.5 text-gray-400" />
                    {fmtDate(e.startDate)} – {fmtDate(e.dueDate)}
                  </span>
                  {u ? (
                    u.avatar ? (
                      <img src={u.avatar} alt={userName(u)} title={userName(u)} className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <span
                        title={userName(u)}
                        className="h-6 w-6 rounded-full text-white text-[10px] font-semibold inline-flex items-center justify-center"
                        style={{ background: userColor(u.id) }}
                      >
                        {userInitials(u)}
                      </span>
                    )
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-gray-100 border border-dashed border-gray-300" title="Unassigned" />
                  )}
                </div>
              </div>
            );
          })
        )}

        {!loading && total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        )}
      </div>

      <EditIssueModal
        open={editingId !== null}
        issueId={editingId}
        projectId={projectId}
        onClose={() => setEditingId(null)}
        onSaved={() => void loadEpics()}
      />
    </div>
  );
}
