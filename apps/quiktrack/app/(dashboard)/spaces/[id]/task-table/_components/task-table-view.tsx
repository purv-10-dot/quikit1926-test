"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  Clock,
  GitBranch,
  Hash,
  ListChecks,
  MoreHorizontal,
  User as UserIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMembersChanged } from "@/lib/hooks/useMembersChanged";
import { EpicsSection, WithoutParentSection } from "./task-table-sections";
import type { EpicLite, IssueStatus, SprintLite, UserLite } from "./task-types";

interface Props { projectId: string; }

const HEAD_CELL = "border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold text-gray-700";

function HeaderCell({
  Icon,
  label,
  width,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  width: string;
}) {
  return (
    <th className={`${HEAD_CELL} ${width}`}>
      <span className="flex items-center gap-1.5 text-gray-700">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        {label}
      </span>
    </th>
  );
}

export function TaskTableView({ projectId }: Props) {
  const queryClient = useQueryClient();
  // Project lookups shared across views via React Query (same keys as backlog /
  // board / work item) — cached across navigation and StrictMode-safe.
  const { data: statuses = [] } = useApiData<IssueStatus[]>(
    ["quiktrack", "project-statuses", projectId],
    `/api/projects/${projectId}/statuses`,
  );
  const { data: members = [] } = useApiData<{ userId: string; user: UserLite | null }[]>(
    ["quiktrack", "project-members", projectId],
    `/api/projects/${projectId}/members`,
    {
      select: (d) => {
        const payload = d as { members?: { userId: string; user: UserLite | null }[] } | { userId: string; user: UserLite | null }[] | null;
        return Array.isArray(payload) ? payload : payload?.members ?? [];
      },
    },
  );
  const { data: sprints = [] } = useApiData<SprintLite[]>(
    ["quiktrack", "project-sprints", projectId],
    `/api/sprints?projectId=${projectId}`,
  );
  const [epics, setEpics] = useState<EpicLite[]>([]);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  // Bumping refreshTick on save remounts the sections (via key) — simplest way
  // to drop all cached pages and re-fetch from the server after an edit.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // All epics — used by the inline EpicLinker on each row. One paged fetch is
    // enough for typical projects; if a project ever exceeds 200 epics this
    // becomes a paginated dropdown.
    fetch(`/api/issues?projectId=${projectId}&type=EPIC&page=1&pageSize=200`)
      .then((r) => r.json() as Promise<{ success: boolean; data: EpicLite[] }>)
      .then((ep) => {
        if (cancelled) return;
        if (ep.success) setEpics((ep.data ?? []).map((e) => ({ id: e.id, key: e.key, title: e.title })));
      })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, [projectId, refreshTick]);

  // Refetch members when membership changes via the Add-people modal.
  useMembersChanged(projectId, () => {
    void queryClient.invalidateQueries({
      queryKey: ["quiktrack", "project-members", projectId],
    });
  });

  const memberMap = useMemo(() => {
    const map = new Map<string, UserLite>();
    for (const m of members) if (m.user) map.set(m.user.id, m.user);
    return map;
  }, [members]);

  const sprintMap = useMemo(() => {
    const map = new Map<string, SprintLite>();
    for (const s of sprints) map.set(s.id, s);
    return map;
  }, [sprints]);

  const ctx = useMemo(
    () => ({
      projectId,
      statuses,
      members: memberMap,
      sprints: sprintMap,
      // Array forms for the inline editors' member/sprint pickers (the Maps
      // above are kept for fast per-row lookup of the current value).
      memberList: members,
      sprintList: sprints,
      // Functional projects have no sprints → hide the Sprint column entirely.
      hasSprints: sprints.length > 0,
      epics,
      onOpenIssue: (id: string) => setOpenIssueId(id),
      // Both onDelete and onPatchIssue are overridden at the section level so
      // each section can reload its own paged list after mutating an issue.
      onDelete: () => { /* overridden per-section */ },
      onPatchIssue: () => { /* overridden per-section */ },
    }),
    [projectId, statuses, memberMap, sprintMap, members, sprints, epics],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="qt-list-scroll flex-1 overflow-x-scroll overflow-y-auto">
        <table className="border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${HEAD_CELL} w-8`} />
              <HeaderCell Icon={Hash} label="Key" width="w-28" />
              <HeaderCell Icon={AlignLeft} label="Work item" width="w-[420px]" />
              {sprints.length > 0 && (
                <HeaderCell Icon={GitBranch} label="Sprint" width="w-44" />
              )}
              <HeaderCell Icon={UserIcon} label="Assigned to" width="w-44" />
              <HeaderCell Icon={CheckSquare} label="Status" width="w-32" />
              <HeaderCell Icon={CalendarDays} label="Start Date" width="w-28" />
              <HeaderCell Icon={CalendarDays} label="Due Date" width="w-28" />
              <HeaderCell Icon={Clock} label="ETA" width="w-20" />
              <th className={`${HEAD_CELL} w-16`}>
                <span className="flex items-center gap-1.5 text-gray-700">
                  <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" />
                  Actions
                </span>
              </th>
            </tr>
          </thead>
          <tbody key={refreshTick}>
            <WithoutParentSection ctx={ctx} />
            <EpicsSection ctx={ctx} />
          </tbody>
        </table>
      </div>

      <EditIssueModal
        open={openIssueId != null}
        issueId={openIssueId}
        projectId={projectId}
        onClose={() => setOpenIssueId(null)}
        onSaved={() => setRefreshTick((t) => t + 1)}
      />
    </div>
  );
}

// Quiet unused-import warning when build prunes ListChecks variant.
void ListChecks;
