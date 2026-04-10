"use client";

import { useQuery } from "@tanstack/react-query";

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  headId?: string | null;
  headName?: string | null;
  memberCount?: number;
}

async function fetchTeams(): Promise<Team[]> {
  const res = await fetch("/api/org/teams");
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch teams");
  return (data.data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    color: t.color ?? null,
    headId: t.headId ?? null,
    headName: t.headName ?? null,
    memberCount: t.memberCount,
  }));
}

export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: fetchTeams,
    staleTime: 1000 * 60 * 5,
  });
}
