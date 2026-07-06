"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ChecklistStatus {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  isDefault: boolean;
}

export interface ChecklistItem {
  id: string;
  name: string;
  statusId: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  orderIndex: number;
  reminderSentAt: string | null;
}

interface ChecklistPage {
  items: ChecklistItem[];
  statuses: ChecklistStatus[];
  hasMore: boolean;
  total: number;
  checked: number;
}

const KEY = ["quiktrack", "checklist"] as const;
const PAGE_SIZE = 30;

async function fetchChecklistPage(offset: number): Promise<ChecklistPage> {
  const res = await fetch(`/api/checklist?offset=${offset}&limit=${PAGE_SIZE}`);
  const json = await res.json();
  if (!json?.success) return { items: [], statuses: [], hasMore: false, total: 0, checked: 0 };
  return json.data as ChecklistPage;
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
async function patch(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
async function del(url: string) {
  const res = await fetch(url, { method: "DELETE" });
  return res.json();
}

export type ItemPatch = Partial<Pick<ChecklistItem, "name" | "statusId" | "dueDate" | "isCompleted">>;

/**
 * All checklist reads + writes for the drawer. Statuses ship with the same
 * payload as items, so every mutation just invalidates the one query key.
 */
export function useChecklist(enabled: boolean) {
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: KEY,
    queryFn: ({ pageParam }) => fetchChecklistPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length * PAGE_SIZE : undefined),
    enabled,
  });
  const onSuccess = () => qc.invalidateQueries({ queryKey: KEY });

  const addItem = useMutation({ mutationFn: (name: string) => post("/api/checklist", { name }), onSuccess });
  const patchItem = useMutation({
    mutationFn: (args: { id: string; fields: ItemPatch }) => patch(`/api/checklist/${args.id}`, args.fields),
    onSuccess,
  });
  const removeItem = useMutation({ mutationFn: (id: string) => del(`/api/checklist/${id}`), onSuccess });
  const addStatus = useMutation({
    mutationFn: (args: { name: string; color: string }) => post("/api/checklist/statuses", args),
    onSuccess,
  });
  const patchStatus = useMutation({
    mutationFn: (args: { id: string; fields: { name?: string; color?: string } }) =>
      patch(`/api/checklist/statuses/${args.id}`, args.fields),
    onSuccess,
  });
  const removeStatus = useMutation({ mutationFn: (id: string) => del(`/api/checklist/statuses/${id}`), onSuccess });

  const pages = query.data?.pages ?? [];
  const first = pages[0];

  return {
    items: pages.flatMap((p) => p.items),
    statuses: first?.statuses ?? [],
    total: first?.total ?? 0,
    checked: first?.checked ?? 0,
    loading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    addItem,
    patchItem,
    removeItem,
    addStatus,
    patchStatus,
    removeStatus,
  };
}
