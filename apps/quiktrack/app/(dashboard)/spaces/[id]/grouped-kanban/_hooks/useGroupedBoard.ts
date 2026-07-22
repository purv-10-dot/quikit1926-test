"use client";

import { useQuery } from "@tanstack/react-query";
import type { GroupedBoardFilters, GroupedBoardPayload } from "../_types";

export const groupedBoardKey = (
  projectId: string,
  filters: GroupedBoardFilters,
) => ["grouped-board", projectId, filters] as const;

async function fetchGroupedBoard(
  projectId: string,
  filters: GroupedBoardFilters,
): Promise<GroupedBoardPayload> {
  const params = new URLSearchParams();
  if (filters.sprintId !== "all") params.set("sprintId", filters.sprintId);
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.type) params.set("type", filters.type);
  if (filters.search) params.set("search", filters.search);
  if (filters.customFilters) params.set("customFilters", filters.customFilters);

  const res = await fetch(
    `/api/projects/${projectId}/grouped-board?${params.toString()}`,
  );
  const json = (await res.json()) as
    | { success: true; data: GroupedBoardPayload }
    | { success: false; error: string };
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export function useGroupedBoard(
  projectId: string,
  filters: GroupedBoardFilters,
) {
  return useQuery({
    queryKey: groupedBoardKey(projectId, filters),
    queryFn: () => fetchGroupedBoard(projectId, filters),
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  });
}
