"use client";

import { useQuery } from "@tanstack/react-query";

export interface Team {
  id: string;
  name: string;
}

async function fetchTeams(): Promise<Team[]> {
  const res = await fetch("/api/org/teams");
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch teams");
  return data.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));
}

export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: fetchTeams,
    staleTime: 1000 * 60 * 5,
  });
}
