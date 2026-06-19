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

export function useUsers(teamId?: string) {
  return useQuery({
    queryKey: ["users", teamId ?? "all"],
    queryFn: () => fetchUsers(teamId),
    staleTime: 1000 * 60 * 5,
  });
}
