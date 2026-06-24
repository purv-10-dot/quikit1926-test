"use client";

import { useQuery } from "@tanstack/react-query";
import type { User } from "@/lib/types/kpi";

async function fetchUsers(teamId?: string): Promise<User[]> {
  const url = teamId ? `/api/users?teamId=${encodeURIComponent(teamId)}` : "/api/users";
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch users");
  return data.data;
}

export function useUsers(teamId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["users", teamId ?? "all"],
    queryFn: () => fetchUsers(teamId),
    staleTime: 1000 * 60 * 5,
    // Lets callers skip the fetch entirely (e.g. only load a team's members
    // when a team is actually selected) — avoids loading the full org list
    // for a value that won't be used.
    enabled: options?.enabled ?? true,
  });
}
