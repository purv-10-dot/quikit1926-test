"use client";

/**
 * React Query bindings for Critical Numbers.
 *
 * Mirrors `useHabits`: a small `fetchData` that unwraps the
 * `{ success, data }` envelope and throws the server's message, plus a keyed
 * cache so mutations can invalidate precisely.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCriticalNumberInput,
  UpdateCriticalNumberInput,
  CreateCriticalNumberUpdateInput,
  CreateSubCategoryInput,
  CreateCategoryFromCriticalNumberInput,
  MeasurementUnit,
  CriticalNumberFrequency,
} from "@/lib/schemas/criticalNumberSchema";

const BASE = "/api/critical-numbers";

async function fetchData<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const criticalNumberKeys = {
  all: ["critical-numbers"] as const,
  list: (teamId?: string) => [...criticalNumberKeys.all, "list", teamId ?? "all"] as const,
  detail: (id: string) => [...criticalNumberKeys.all, "detail", id] as const,
  // Spelled out rather than spreading `all`: a non-function property can't
  // reference the object it's being defined in.
  /** Categories + sub-categories + units for the create form. */
  options: ["critical-numbers", "options"] as const,
  /** Owner candidates for one team (join rows ∪ head). */
  teamMembers: (teamId: string) =>
    ["critical-numbers", "team-members", teamId] as const,
};

export interface CriticalNumberRow {
  id: string;
  title: string;
  teamId: string;
  ownerId: string;
  categoryId: string;
  subCategoryId: string | null;
  measurementUnit: MeasurementUnit;
  /** Unit Master label. Number metrics only — null for every other type. */
  unit: string | null;
  /** ISO 4217 code ("USD", "INR", …). Currency metrics only — null otherwise. */
  currency: string | null;
  /** K/L/Cr/M display-scale label ("Crore", "Million", …). Optional even for
   *  Currency metrics — null means "show the raw number." */
  targetScale: string | null;
  frequency: CriticalNumberFrequency;
  targetValue: number;
  currentValue: number | null;
  createdAt: string;
  updatedAt: string;
  team: { id: string; name: string; color: string | null } | null;
  owner: { id: string; firstName: string; lastName: string; email: string } | null;
  category: { id: string; name: string } | null;
  subCategory: { id: string; name: string } | null;
  /** Bounded recent history (oldest-first), batched into the list query —
   *  enough for the card's trend chart, not the full append-only log. */
  updates: {
    id: string;
    date: string;
    value: number;
    comment: string | null;
    createdAt: string;
    /** Raw user id — no Prisma relation on this field, so it's resolved
     *  server-side into `createdByName` instead of being usable directly. */
    createdBy: string;
    /** Resolved display name, or null if that user no longer exists. */
    createdByName: string | null;
  }[];
}

export function useCriticalNumbers(teamId?: string) {
  return useQuery<CriticalNumberRow[]>({
    queryKey: criticalNumberKeys.list(teamId),
    queryFn: () => fetchData(`${BASE}${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`),
  });
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function useCreateCriticalNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCriticalNumberInput) =>
      fetchData<CriticalNumberRow>(BASE, jsonInit("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: criticalNumberKeys.all }),
  });
}

export function useUpdateCriticalNumber(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCriticalNumberInput) =>
      fetchData<CriticalNumberRow>(`${BASE}/${id}`, jsonInit("PATCH", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: criticalNumberKeys.all }),
  });
}

export function useDeleteCriticalNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: criticalNumberKeys.all }),
  });
}

/**
 * Append a reading. Invalidates the whole tree because this is the one call
 * that moves the parent's `currentValue` — the gauge is stale until it refetches.
 */
export function useAddCriticalNumberUpdate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCriticalNumberUpdateInput) =>
      fetchData(`${BASE}/${id}/updates`, jsonInit("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: criticalNumberKeys.all }),
  });
}

export interface CriticalNumberOptions {
  categories: { id: string; name: string }[];
  subCategories: { id: string; categoryId: string; name: string }[];
  units: { id: string; name: string }[];
}

/**
 * Lookup data for the create form, served behind the Critical Numbers gate so
 * it doesn't depend on the user also having OPSP or Org Setup access.
 *
 * Reference data changes rarely, so it's kept fresh for a minute rather than
 * refetched on every panel open.
 */
export function useCriticalNumberOptions() {
  return useQuery<CriticalNumberOptions>({
    queryKey: criticalNumberKeys.options,
    queryFn: () => fetchData(`${BASE}/options`),
    staleTime: 60_000,
  });
}

/**
 * Owner candidates for the selected Department.
 *
 * Backed by `/api/critical-numbers/team-members`, which resolves the same
 * `QsUserTeam ∪ headId` union the API validates against — deliberately NOT
 * `useUsers(teamId)`, whose `OrgMember.teamId` filter is a narrower "primary
 * team" notion that hides the head and any member whose primary team differs.
 *
 * Disabled until a team is chosen, so opening the form doesn't fire a request
 * for a value nobody has picked yet.
 */
export function useCriticalNumberTeamMembers(teamId: string | undefined) {
  return useQuery<Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null }>>({
    queryKey: criticalNumberKeys.teamMembers(teamId ?? ""),
    queryFn: () => fetchData(`${BASE}/team-members?teamId=${encodeURIComponent(teamId!)}`),
    enabled: !!teamId,
    staleTime: 60_000,
  });
}

/** Inline "+ New Sub Category". Invalidates options so the new row appears. */
export function useCreateSubCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubCategoryInput) =>
      fetchData<{ id: string; categoryId: string; name: string }>(
        `${BASE}/sub-categories`,
        jsonInit("POST", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: criticalNumberKeys.options }),
  });
}

/**
 * Inline "+ New Category". Writes a real CategoryMaster row (a confirmed,
 * deliberate exception to Critical Numbers being read-only against it), so
 * this also shows up for OPSP once options refetch.
 */
export function useCreateCategoryFromCriticalNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryFromCriticalNumberInput) =>
      fetchData<{ id: string; name: string }>(`${BASE}/categories`, jsonInit("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: criticalNumberKeys.options }),
  });
}
