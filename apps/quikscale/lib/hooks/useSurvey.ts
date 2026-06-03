import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { createSurveySchema, updateSurveySchema, submitResponseSchema } from "@/lib/schemas/surveySchema";
import type { z } from "zod";

export const surveyKeys = {
  all:       (orgId?: string)                          => ["surveys", orgId] as const,
  list:      (orgId?: string, filters?: object)        => ["surveys", orgId, "list", filters] as const,
  detail:    (id: string)                              => ["surveys", id] as const,
  responses: (id: string)                              => ["surveys", id, "responses"] as const,
  public:    (token: string)                           => ["surveys", "public", token] as const,
};

export function useSurveys(filters?: { type?: string; year?: number; quarter?: string }) {
  return useQuery({
    queryKey: surveyKeys.list(undefined, filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.type)    params.set("type", filters.type);
      if (filters?.year)    params.set("year", String(filters.year));
      if (filters?.quarter) params.set("quarter", filters.quarter);
      const res = await fetch(`/api/surveys?${params}`);
      if (!res.ok) throw new Error("Failed to fetch surveys");
      return (await res.json()).data;
    },
  });
}

export function useSurvey(id: string) {
  return useQuery({
    queryKey: surveyKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/surveys/${id}`);
      if (!res.ok) throw new Error("Failed to fetch survey");
      return (await res.json()).data;
    },
    enabled: !!id,
  });
}

export function useSurveyResponses(id: string) {
  return useQuery({
    queryKey: surveyKeys.responses(id),
    queryFn: async () => {
      const res = await fetch(`/api/surveys/${id}/responses`);
      if (!res.ok) throw new Error("Failed to fetch responses");
      return (await res.json()).data;
    },
    enabled: !!id,
  });
}

export function usePublicSurvey(token: string) {
  return useQuery({
    queryKey: surveyKeys.public(token),
    queryFn: async () => {
      const res = await fetch(`/api/s/${token}`);
      if (!res.ok) throw new Error("Survey not found");
      return (await res.json()).data;
    },
    enabled: !!token,
  });
}

export function useCreateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof createSurveySchema>) => {
      const res = await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create survey");
      return (await res.json()).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }),
  });
}

export function useUpdateSurvey(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: z.infer<typeof updateSurveySchema>) => {
      const res = await fetch(`/api/surveys/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update survey");
      return (await res.json()).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: surveyKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["surveys"] });
    },
  });
}

export function useDeleteSurvey(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/surveys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete survey");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }),
  });
}

export function useSubmitSurveyResponse(token: string) {
  return useMutation({
    mutationFn: async (input: z.infer<typeof submitResponseSchema>) => {
      const res = await fetch(`/api/s/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to submit response");
      return (await res.json()).data;
    },
  });
}
