"use client";

import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";

type PickerUser = { id: string; name: string; email: string; role: string };

async function fetchUsers(): Promise<PickerUser[]> {
  const res = await fetch("/api/users/picker", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  const json = (await res.json()) as { items: PickerUser[] };
  return json.items;
}

export function AgentFilter({
  value,
  onChange,
}: {
  /** "" = all, "me" = current user, otherwise a user id. */
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: users = [] } = useQuery<PickerUser[]>({
    queryKey: ["dashboard", "users-picker"],
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-crm-border bg-white px-3 text-xs text-crm-text transition hover:border-accent-300 hover:bg-accent-50">
      <User className="h-3.5 w-3.5 shrink-0 text-crm-muted" aria-hidden />
      <span className="text-crm-muted">Owner</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-medium text-crm-text focus:outline-none"
      >
        <option value="">All</option>
        <option value="me">Me</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
