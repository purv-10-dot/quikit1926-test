"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function extractErrorMessage(payload: any, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object") {
    if (typeof payload.error.message === "string") return payload.error.message;
    if (typeof payload.error.code === "string") return payload.error.code;
  }
  if (typeof payload.message === "string") return payload.message;
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
  });
}

export function useUpdateWbsTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WbsTask> & { id: string }) =>
      mutateApi(`/api/projects/${projectId}/wbs/tasks/${id}`, "PATCH", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wbsTasks", projectId] }),
  });
}

export function useDeleteWbsTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/projects/${projectId}/wbs/tasks/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wbsTasks", projectId] }),
  });
}

