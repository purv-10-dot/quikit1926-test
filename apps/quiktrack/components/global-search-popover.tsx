"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  ListTree,
  CornerDownLeft,
} from "lucide-react";
import { fetchActivity, type HistoryEntry } from "@/lib/utils/history";
import { SkeletonList, Skeleton } from "@/components/skeleton";
import { SpaceIcon } from "@/components/space-icon";

type StatusCategory = "BACKLOG" | "IN_PROGRESS" | "DONE";
type UpdatedRange =
  | "any"
  | "today"
  | "yesterday"
  | "past7"
  | "past30"
  | "pastYear";

const UPDATED_RANGES: { value: UpdatedRange; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "past7", label: "Past 7 days" },
  { value: "past30", label: "Past 30 days" },
  { value: "pastYear", label: "Past year" },
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function relativeUpdated(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `Updated ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Updated ${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Updated 1d ago";
  if (day < 8) return `Updated ${day}d ago`;
  return `Updated ${new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function rangeToSinceISO(r: UpdatedRange): string | null {
  const now = new Date();
  const today = startOfDay(now);
  if (r === "any") return null;
  if (r === "today") return today.toISOString();
  if (r === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return y.toISOString();
  }
  if (r === "past7") {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (r === "past30") {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }
  const d = new Date(today);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

interface IssueHit {
  id: string;
  key: string;
  title: string;
  type: string;
  projectId: string;
  updatedAt: string;
  status: { id: string; name: string; category: string } | null;
  project: { id: string; name: string } | null;
}

interface ProjectHit {
  id: string;
  name: string;
  projectKey: string;
  icon?: string | null;
  color?: string | null;
}

interface MemberOption {
  userId: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-500" },
  EPIC: { Icon: Zap, color: "text-purple-500" },
  SUBTASK: { Icon: ListTree, color: "text-gray-500" },
};

export interface GlobalSearchPopoverHandle {
  focus: () => void;
}

/**
 * Header search-and-discover popover modeled on Jira's quick-search.
 *
 * Layout:
 *  - Left column: Recently viewed work items + Recent projects, OR live
 *    search results when the user has typed a query.
 *  - Right column: filter rail (project, assignee, reporter "me", status)
 *    that narrows the search payload.
 *  - Footer: "View all work items" link.
 *
 * Opens on input focus, closes on outside click + Escape. Pressing Enter on
 * the highlighted result fires `quiktrack:open-issue` so any mounted page
 * listening for it can pop its EditIssueModal.
 */
export const GlobalSearchPopover = forwardRef<GlobalSearchPopoverHandle>(
  function GlobalSearchPopover(_, ref) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [appliedQuery, setAppliedQuery] = useState("");

    const [issues, setIssues] = useState<IssueHit[]>([]);
    const [totalIssues, setTotalIssues] = useState(0);
    const [projects, setProjects] = useState<ProjectHit[]>([]);
    // Catalogs for the right-rail filter dropdowns. Loaded once on first
    // open and cached for the session — independent of the search payload
    // so the dropdowns aren't empty when results are.
    const [allProjects, setAllProjects] = useState<ProjectHit[]>([]);
    const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
    const [recent, setRecent] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters — multi-select sets so the user can pick e.g. two projects
    // and two assignees at once. State stays as Sets internally, serialized
    // to CSV when the API call goes out.
    const [filterProjectIds, setFilterProjectIds] = useState<Set<string>>(() => new Set());
    const [filterAssigneeIds, setFilterAssigneeIds] = useState<Set<string>>(() => new Set());
    const [filterReporterMe, setFilterReporterMe] = useState(false);
    const [statusCats, setStatusCats] = useState<Record<StatusCategory, boolean>>({
      BACKLOG: false,
      IN_PROGRESS: false,
      DONE: false,
    });
    const [updatedRange, setUpdatedRange] = useState<UpdatedRange>("any");
    // Show-more toggles for the long sub-lists.
    const [moreProjects, setMoreProjects] = useState(false);
    const [moreAssignees, setMoreAssignees] = useState(false);

    const router = useRouter();

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // Outside click + Escape close.
    useEffect(() => {
      function onDown(e: MouseEvent) {
        if (
          open &&
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape" && open) {
          setOpen(false);
          inputRef.current?.blur();
        }
      }
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    // Boot: lazy-load the filter-rail catalogs (projects + members) and the
    // activity feed on first open. Cached for the session, so the dropdowns
    // are populated regardless of the current search query.
    useEffect(() => {
      if (!open) return;
      if (recent.length === 0) {
        void fetchActivity(20).then((rows) => setRecent(rows));
      }
      if (allProjects.length === 0) {
        void fetch("/api/projects?pageSize=100&sort=name&order=asc")
          .then((r) => r.json())
          .then((j) => {
            if (j?.success) {
              setAllProjects(
                (j.data ?? []).map((p: ProjectHit) => ({
                  id: p.id,
                  name: p.name,
                  projectKey: p.projectKey,
                  icon: p.icon,
                  color: p.color,
                })),
              );
            }
          })
          .catch(() => undefined);
      }
      if (allMembers.length === 0) {
        void fetch("/api/users/search?limit=100")
          .then((r) => r.json())
          .then((j) => {
            if (j?.success) {
              setAllMembers(
                (j.data ?? []).map(
                  (u: {
                    id: string;
                    firstName: string | null;
                    lastName: string | null;
                    email: string;
                  }) => ({ userId: u.id, user: u }),
                ),
              );
            }
          })
          .catch(() => undefined);
      }
    }, [open, recent.length, allProjects.length, allMembers.length]);

    // Debounce search input.
    useEffect(() => {
      const t = setTimeout(() => setAppliedQuery(query.trim()), 200);
      return () => clearTimeout(t);
    }, [query]);

    // Build the query string used by both the live search call and the
    // "View all work items" deep link. Returns a URLSearchParams.
    const buildParams = useCallback(() => {
      const params = new URLSearchParams();
      if (appliedQuery) params.set("q", appliedQuery);
      if (filterProjectIds.size > 0) {
        params.set("projectIds", Array.from(filterProjectIds).join(","));
      }
      if (filterAssigneeIds.size > 0) {
        params.set("assigneeIds", Array.from(filterAssigneeIds).join(","));
      }
      if (filterReporterMe) params.set("reporterId", "me");
      const cats = (Object.keys(statusCats) as StatusCategory[]).filter(
        (k) => statusCats[k],
      );
      if (cats.length > 0) params.set("statusCategory", cats.join(","));
      const since = rangeToSinceISO(updatedRange);
      if (since) params.set("updatedSince", since);
      return params;
    }, [
      appliedQuery,
      filterProjectIds,
      filterAssigneeIds,
      filterReporterMe,
      statusCats,
      updatedRange,
    ]);

    const run = useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?${buildParams().toString()}`).then((r) =>
          r.json(),
        );
        if (res?.success) {
          setIssues(res.data.issues ?? []);
          setTotalIssues(res.data.totalIssues ?? 0);
          setProjects(res.data.projects ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, [buildParams]);

    useEffect(() => {
      if (!open) return;
      void run();
    }, [open, run]);

    // Recent issues from the activity history (kind === "task" / "epic").
    const recentIssues = useMemo(() => {
      return recent
        .filter((h) => h.kind === "task" || h.kind === "epic")
        .slice(0, 10);
    }, [recent]);

    // Recent projects — first 6 from the catalog (already sorted by name).
    // When searching, the live projects list takes over below.
    const recentProjects = useMemo(() => allProjects.slice(0, 6), [allProjects]);

    function openIssue(issueId: string, projectId?: string) {
      setOpen(false);
      // Prefer the full-page view when we know the project; otherwise fall
      // back to the legacy in-place modal event so anything mounted that
      // listens (board / backlog) still pops a modal.
      if (projectId) {
        router.push(`/spaces/${projectId}/work/${issueId}`);
        return;
      }
      window.dispatchEvent(
        new CustomEvent("quiktrack:open-issue", { detail: { id: issueId } }),
      );
    }

    return (
      <div ref={containerRef} className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search"
          className="w-full h-8 pl-9 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        />

        {open && (
          <div className="absolute left-0 top-full mt-1.5 w-[820px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-[0_10px_40px_rgba(15,23,42,0.18)] z-[60] grid grid-cols-[1fr_280px] max-h-[72vh] overflow-hidden">
            {/* Left — work items list (filters from the right rail apply
                live; project list shows only when matching). */}
            <div className="overflow-y-auto flex flex-col">
              <div className="sticky top-0 bg-white px-4 pt-3.5 pb-2 flex items-center gap-2 border-b border-gray-100 z-10">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                  Work items
                </span>
                <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 text-[10px] font-semibold text-gray-600 bg-gray-100 rounded-full">
                  {totalIssues}
                </span>
                {loading && (
                  <span className="text-[11px] text-gray-400 ml-auto">Searching…</span>
                )}
              </div>

              <div className="flex-1">
                {issues.length === 0 && loading && (
                  <div className="px-4 py-3">
                    <SkeletonList rows={5} />
                  </div>
                )}
                {issues.length === 0 && !loading && (
                  <div className="px-4 py-8 text-center text-xs text-gray-400">
                    No matching work items.
                  </div>
                )}

                <ul className="py-1">
                  {issues.map((i) => {
                    const T = TYPE_ICON[i.type] ?? TYPE_ICON.TASK!;
                    return (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => openIssue(i.id, i.projectId)}
                          className="w-full grid grid-cols-[18px_1fr] gap-3 items-start px-4 py-2 text-left hover:bg-blue-50/40 rounded-none transition-colors"
                        >
                          <T.Icon className={`h-4 w-4 shrink-0 mt-0.5 ${T.color}`} />
                          <div className="min-w-0">
                            <div className="text-[13px] text-gray-900 truncate leading-snug">
                              <span className="text-gray-700 font-medium">{i.key}</span>
                              <span className="text-gray-300 mx-1.5">·</span>
                              <span>{i.title}</span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-gray-500 truncate flex items-center gap-1.5">
                              <span className="truncate">{i.project?.name ?? ""}</span>
                              {i.project?.name && (
                                <span className="h-0.5 w-0.5 rounded-full bg-gray-300" />
                              )}
                              <span className="shrink-0">
                                {relativeUpdated(i.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {projects.length > 0 && appliedQuery && (
                  <>
                    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 border-t border-gray-100">
                      Projects
                    </div>
                    <ul className="py-1">
                      {projects.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/spaces/${p.id}/backlog`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-1.5 text-[13px] hover:bg-blue-50/40"
                          >
                            <ProjectIcon project={p} small />
                            <span className="truncate text-gray-800">{p.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-2.5 text-xs flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-gray-400" />
                <button
                  type="button"
                  onClick={() => {
                    const targetProjectId =
                      filterProjectIds.size === 1
                        ? Array.from(filterProjectIds)[0]
                        : issues[0]?.projectId ??
                          recentProjects[0]?.id ??
                          allProjects[0]?.id;
                    if (!targetProjectId) {
                      setOpen(false);
                      router.push("/spaces");
                      return;
                    }
                    const qs = buildParams().toString();
                    setOpen(false);
                    router.push(
                      `/spaces/${targetProjectId}/list${qs ? `?${qs}` : ""}`,
                    );
                  }}
                  className="text-blue-600 font-medium hover:underline"
                >
                  View all results
                </button>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-400">
                  Enter <CornerDownLeft className="h-3 w-3" />
                </span>
              </div>
            </div>

            {/* Right — filters */}
            <div className="overflow-y-auto py-3 px-4 text-xs bg-gray-50/40 border-l border-gray-100">
              <FilterSection title="Last updated">
                <div className="flex flex-wrap gap-1.5">
                  {UPDATED_RANGES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setUpdatedRange(r.value)}
                      className={`h-7 px-3 rounded-full text-[11px] border transition-colors ${
                        updatedRange === r.value
                          ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title="Filter by project">
                <CheckboxList
                  items={allProjects.map((p) => ({
                    id: p.id,
                    label: p.name,
                    leading: <ProjectIcon project={p} small />,
                  }))}
                  selected={filterProjectIds}
                  onToggle={(id) =>
                    setFilterProjectIds((cur) => toggleSet(cur, id))
                  }
                  expanded={moreProjects}
                  onToggleExpand={() => setMoreProjects((v) => !v)}
                  loading={allProjects.length === 0}
                />
              </FilterSection>

              <FilterSection title="Filter by assignee">
                <CheckboxList
                  items={allMembers
                    .filter((m) => m.user)
                    .map((m) => ({
                      id: m.userId,
                      label:
                        `${m.user!.firstName ?? ""} ${m.user!.lastName ?? ""}`.trim() ||
                        m.user!.email,
                      leading: <AssigneeBubble seed={m.userId} label={m.user!.firstName ?? m.user!.email} />,
                    }))}
                  selected={filterAssigneeIds}
                  onToggle={(id) =>
                    setFilterAssigneeIds((cur) => toggleSet(cur, id))
                  }
                  expanded={moreAssignees}
                  onToggleExpand={() => setMoreAssignees((v) => !v)}
                  loading={allMembers.length === 0}
                />
              </FilterSection>

              <FilterSection title="Filter by reporter">
                <label className="inline-flex items-center gap-2 text-gray-700">
                  <input
                    type="checkbox"
                    checked={filterReporterMe}
                    onChange={(e) => setFilterReporterMe(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                  />
                  Reported by me
                </label>
              </FilterSection>

              <FilterSection title="Filter by status">
                <div className="space-y-1">
                  {(["BACKLOG", "IN_PROGRESS", "DONE"] as StatusCategory[]).map((c) => (
                    <label
                      key={c}
                      className="flex items-center gap-2 text-gray-700 text-[12px]"
                    >
                      <input
                        type="checkbox"
                        checked={statusCats[c]}
                        onChange={(e) =>
                          setStatusCats((cur) => ({ ...cur, [c]: e.target.checked }))
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                      />
                      {c === "BACKLOG"
                        ? "Open"
                        : c === "IN_PROGRESS"
                          ? "In progress"
                          : "Done"}
                    </label>
                  ))}
                </div>
              </FilterSection>

              <button
                type="button"
                onClick={() => {
                  setFilterProjectIds(new Set());
                  setFilterAssigneeIds(new Set());
                  setFilterReporterMe(false);
                  setStatusCats({ BACKLOG: false, IN_PROGRESS: false, DONE: false });
                  setUpdatedRange("any");
                }}
                className="mt-3 text-xs text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-xs text-gray-400">{children}</div>;
}

function ProjectIcon({ project, small }: { project: ProjectHit; small?: boolean }) {
  return (
    <SpaceIcon
      icon={project.icon}
      name={project.name}
      color={project.color}
      size={small ? 20 : 24}
      radius={6}
    />
  );
}

function AssigneeBubble({ seed, label }: { seed: string; label: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (
    <span
      className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
      style={{ background: `hsl(${h % 360}deg 45% 50%)` }}
    >
      {(label.charAt(0) || "?").toUpperCase()}
    </span>
  );
}

function toggleSet(cur: Set<string>, id: string): Set<string> {
  const next = new Set(cur);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

interface CheckboxItem {
  id: string;
  label: string;
  leading?: React.ReactNode;
}

function CheckboxList({
  items,
  selected,
  onToggle,
  expanded,
  onToggleExpand,
  initialCount = 3,
  loading = false,
}: {
  items: CheckboxItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  initialCount?: number;
  loading?: boolean;
}) {
  if (items.length === 0 && loading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 rounded-sm" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="text-[11px] text-gray-400">No options</div>;
  }
  const visible = expanded ? items : items.slice(0, initialCount);
  const hasMore = items.length > initialCount;
  return (
    <div>
      <ul className="space-y-1">
        {visible.map((it) => {
          const checked = selected.has(it.id);
          return (
            <li key={it.id}>
              <label
                className={`flex items-center gap-2 cursor-pointer text-[12px] py-1 px-1.5 -mx-1.5 rounded ${
                  checked ? "bg-blue-50 text-blue-900" : "text-gray-800 hover:bg-gray-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(it.id)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                />
                {it.leading}
                <span className="truncate">{it.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-1.5 text-xs text-blue-600 hover:underline"
        >
          {expanded ? "Show less" : `Show more (${items.length - initialCount})`}
        </button>
      )}
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500 mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

