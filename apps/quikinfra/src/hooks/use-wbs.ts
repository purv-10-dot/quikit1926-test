"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { entityMeta } from "@/lib/toast";

async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  const p = payload as { error?: unknown; message?: unknown };
  if (typeof p.error === "string") return p.error;
  if (p.error && typeof p.error === "object") {
    const e = p.error as { message?: unknown; code?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.code === "string") return e.code;
  }
  if (typeof p.message === "string") return p.message;
  return fallback;
}

async function mutateApi<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(extractErrorMessage(payload, res.statusText || "Request failed"));
  }
  return res.json();
}

export interface WbsTask {
  id: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "not_started" | "in_progress" | "completed" | "on_hold";
  progress: number;
  predecessors: string[];
}

export function useWbsTasks(projectId: string) {
  return useQuery({
    queryKey: ["wbsTasks", projectId],
    queryFn: () => fetchApi<{ data: WbsTask[] }>(`/api/projects/${projectId}/wbs/tasks`),
    enabled: !!projectId,
  });
}

export function useCreateWbsTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WbsTask>) => mutateApi(`/api/projects/${projectId}/wbs/tasks`, "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wbsTasks", projectId] }),
    meta: entityMeta("create", "Task"),
  });
}

export function useUpdateWbsTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WbsTask> & { id: string }) =>
      mutateApi(`/api/projects/${projectId}/wbs/tasks/${id}`, "PATCH", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wbsTasks", projectId] }),
    meta: entityMeta("update", "Task"),
  });
}

export function useDeleteWbsTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/projects/${projectId}/wbs/tasks/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wbsTasks", projectId] }),
    meta: entityMeta("delete", "Task"),
  });
}

