"use client";

import { useApiData } from "@/lib/hooks/useApiData";
import type { FilterOption } from "@/lib/test/caseFilters";
import { useProjectMembers } from "./use-project-members";

/**
 * Loads the dynamic option lists the filter panel needs: labels, test runs,
 * execution statuses, and project members.
 *
 * All four are read through `useApiData` (shared React Query cache) against
 * endpoints that already exist for other QuikTest surfaces — labels power
 * `LabelPicker`, runs power the Runs list, statuses power the runner — so opening
 * the filter panel adds no new API routes, just new consumers of ones already
 * fetched elsewhere in the module (and usually already warm in cache).
 */

interface RawTag {
  id: string;
  name: string;
  color: string | null;
}

interface RawRun {
  id: string;
  refId: number;
  name: string;
  isDeleted: boolean;
}

interface RawStatus {
  id: string;
  key: string;
  label: string;
  color: string | null;
}

export function useFilterSources(projectId: string) {
  const members = useProjectMembers(projectId);

  const { data: labels } = useApiData<FilterOption[]>(
    ["quiktrack", "test-tags", projectId],
    `/api/test/tags?projectId=${projectId}`,
    {
      select: (d) =>
        ((d as RawTag[] | null) ?? []).map((t) => ({
          value: t.id,
          label: t.name,
          color: t.color ?? undefined,
        })),
    },
  );

  const { data: runs } = useApiData<FilterOption[]>(
    ["quiktrack", "test-runs-picker", projectId],
    // Runs, not deleted, newest first, capped generously — this is a filter
    // picker, not the Runs page, so one page is enough to cover realistic use.
    `/api/test/runs?projectId=${projectId}&deleted=false&pageSize=200`,
    {
      select: (d) => {
        const items = (d as { items?: RawRun[] } | null)?.items ?? [];
        return items.map((r) => ({ value: r.id, label: `R${r.refId} — ${r.name}` }));
      },
    },
  );

  const { data: statuses } = useApiData<FilterOption[]>(
    ["quiktrack", "test-statuses"],
    "/api/test/statuses",
    {
      select: (d) =>
        ((d as RawStatus[] | null) ?? []).map((s) => ({
          value: s.id,
          label: s.label,
          color: s.color ?? undefined,
        })),
    },
  );

  const people: FilterOption[] = members.members.map((m) => ({
    value: m.userId,
    label: m.name,
  }));

  return {
    labels: labels ?? [],
    runs: runs ?? [],
    statuses: statuses ?? [],
    people,
    /** Resolves an id from any source to a label, for chip rendering. */
    labelFor: (key: "label" | "run" | "execution" | "assignee" | "createdBy", value: string) => {
      const pool =
        key === "label" ? labels : key === "run" ? runs : key === "execution" ? statuses : people;
      return (pool ?? []).find((o) => o.value === value)?.label ?? value;
    },
  };
}
