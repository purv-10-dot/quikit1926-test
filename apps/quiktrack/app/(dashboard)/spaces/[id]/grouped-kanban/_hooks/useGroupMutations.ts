"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  GroupedBoardFilters,
  GroupedBoardGroup,
  GroupedBoardPayload,
} from "../_types";
import { groupedBoardKey } from "./useGroupedBoard";

interface MutationContext {
  projectId: string;
  filters: GroupedBoardFilters;
}

function snapshot(qc: ReturnType<typeof useQueryClient>, ctx: MutationContext) {
  const key = groupedBoardKey(ctx.projectId, ctx.filters);
  return { key, prev: qc.getQueryData<GroupedBoardPayload>(key) };
}

function setBoard(
  qc: ReturnType<typeof useQueryClient>,
  ctx: MutationContext,
  updater: (prev: GroupedBoardPayload) => GroupedBoardPayload,
) {
  const key = groupedBoardKey(ctx.projectId, ctx.filters);
  qc.setQueryData<GroupedBoardPayload>(key, (prev) =>
    prev ? updater(prev) : prev,
  );
}

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as
    | { success: true; data: T }
    | { success: false; error: string };
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export function useCreateGroup(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string; icon?: string }) =>
      postJson<GroupedBoardGroup>(`/api/projects/${ctx.projectId}/groups`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}

export function useRenameGroup(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      postJson<GroupedBoardGroup>(`/api/groups/${id}`, { name }, "PATCH"),
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      setBoard(qc, ctx, (b) => ({
        ...b,
        groups: b.groups.map((g) => (g.id === id ? { ...g, name } : g)),
      }));
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}

export function useRecolorGroup(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) =>
      postJson<GroupedBoardGroup>(`/api/groups/${id}`, { color }, "PATCH"),
    onMutate: async ({ id, color }) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      setBoard(qc, ctx, (b) => ({
        ...b,
        groups: b.groups.map((g) => (g.id === id ? { ...g, color } : g)),
      }));
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}

export function useToggleGroupCollapse(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isCollapsed }: { id: string; isCollapsed: boolean }) =>
      postJson<GroupedBoardGroup>(`/api/groups/${id}`, { isCollapsed }, "PATCH"),
    onMutate: async ({ id, isCollapsed }) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      setBoard(qc, ctx, (b) => ({
        ...b,
        groups: b.groups.map((g) => (g.id === id ? { ...g, isCollapsed } : g)),
      }));
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
  });
}

export function useDeleteGroup(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      postJson<{ id: string }>(`/api/groups/${id}`, {}, "DELETE"),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      setBoard(qc, ctx, (b) => {
        const removed = b.groups.find((g) => g.id === id);
        const orphans = removed?.tasks ?? [];
        const defaultId = b.defaultGroupId;
        return {
          ...b,
          groups: b.groups
            .filter((g) => g.id !== id)
            .map((g) =>
              g.id === defaultId
                ? {
                    ...g,
                    tasks: [
                      ...g.tasks,
                      ...orphans.map((t) => ({ ...t, groupId: null })),
                    ],
                    taskCount: g.taskCount + orphans.length,
                  }
                : g,
            ),
        };
      });
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}

export function useReorderGroups(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      postJson<{ orderedIds: string[] }>(
        `/api/projects/${ctx.projectId}/groups/reorder`,
        { orderedIds },
      ),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      setBoard(qc, ctx, (b) => {
        const byId = new Map(b.groups.map((g) => [g.id, g] as const));
        return {
          ...b,
          groups: orderedIds.flatMap((id, idx) => {
            const g = byId.get(id);
            return g ? [{ ...g, order: idx }] : [];
          }),
        };
      });
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}
