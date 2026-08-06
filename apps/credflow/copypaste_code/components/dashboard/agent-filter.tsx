"use client";

import { useQuery } from "@tanstack/react-query";

type PickerUser = { id: string; name: string; email: string; role: string };

type Resp = { items: PickerUser[] };

async function fetchUsers(): Promise<PickerUser[]> {
  const res = await fetch("/api/users/picker", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  const json = (await res.json()) as Resp;
  return json.items;
}

export function AgentFilter({
  value,
  onChange,
}: {
  /** "" / null = all, "me" = current user, otherwise a user id. */
  value: string;
  onChange: (next: string) => void;
}) {
  const { data: users = [] } = useQuery<PickerUser[]>({
    queryKey: ["dashboard", "users-picker"],
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <label className="inline-flex h-8 items-center gap-2 rounded-md border border-crm-border bg-white px-2 text-xs text-crm-text shadow-sm">
      <span className="text-crm-muted">Owner</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-medium focus:outline-none"
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
