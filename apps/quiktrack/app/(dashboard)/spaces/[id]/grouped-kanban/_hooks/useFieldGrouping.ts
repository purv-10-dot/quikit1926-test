"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BoardMemberLite,
  GroupedBoardGroup,
  GroupedBoardStatus,
} from "../_types";
import {
  deriveFieldGroups,
  isFieldMode,
  type GroupByMode,
  type GroupedBoardEpicLite,
} from "../_lib/field-grouping";

const STORAGE_PREFIX = "qt-grouped-kanban-groupby:";

function isValidMode(v: string | null): v is GroupByMode {
  return (
    v === "manual" ||
    v === "status" ||
    v === "priority" ||
    v === "assignee" ||
    v === "type" ||
    v === "epic"
  );
}

interface FieldGroupingInput {
  projectId: string;
  /** Manual QtTaskGroup rows from the server payload. */
  manualGroups: GroupedBoardGroup[];
  statuses: GroupedBoardStatus[];
  members: BoardMemberLite[];
  /** Project epics, used to label groups in "epic" mode. */
  epics: GroupedBoardEpicLite[];
}

interface FieldGroupingResult {
  groupBy: GroupByMode;
  setGroupBy: (mode: GroupByMode) => void;
  isVirtual: boolean;
  /** Groups to render: manual rows in `"manual"` mode, derived groups otherwise. */
  displayGroups: GroupedBoardGroup[];
  /** Collapse a virtual group (client-only; manual collapse is server-persisted). */
  toggleVirtualCollapse: (groupId: string) => void;
}

/**
 * Owns the Grouped Kanban grouping axis. In `"manual"` mode it passes the
 * server's QtTaskGroup rows straight through. In a field mode it derives groups
 * from the chosen task field and tracks collapse state locally (there are no
 * QtTaskGroup rows to persist `isCollapsed` against). The selection is
 * remembered per project in localStorage.
 */
export function useFieldGrouping({
  projectId,
  manualGroups,
  statuses,
  members,
  epics,
}: FieldGroupingInput): FieldGroupingResult {
  const [groupBy, setGroupByState] = useState<GroupByMode>("manual");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  // Load the remembered axis once on mount (kept out of initial state to avoid
  // an SSR/client hydration mismatch — first paint is always "manual").
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + projectId);
      if (isValidMode(saved)) setGroupByState(saved);
    } catch {
      /* localStorage unavailable — fall back to manual */
    }
  }, [projectId]);

  const setGroupBy = useCallback(
    (mode: GroupByMode) => {
      setGroupByState(mode);
      setCollapsed(new Set()); // collapse state is per-axis; reset on switch
      try {
        window.localStorage.setItem(STORAGE_PREFIX + projectId, mode);
      } catch {
        /* non-fatal */
      }
    },
    [projectId],
  );

  const toggleVirtualCollapse = useCallback((groupId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const isVirtual = isFieldMode(groupBy);

  const displayGroups = useMemo<GroupedBoardGroup[]>(() => {
    if (!isVirtual) return manualGroups;
    const allTasks = manualGroups.flatMap((g) => g.tasks);
    return deriveFieldGroups(groupBy, allTasks, { statuses, members, epics }).map((g) =>
      collapsed.has(g.id) ? { ...g, isCollapsed: true } : g,
    );
  }, [isVirtual, groupBy, manualGroups, statuses, members, epics, collapsed]);

  return { groupBy, setGroupBy, isVirtual, displayGroups, toggleVirtualCollapse };
}
