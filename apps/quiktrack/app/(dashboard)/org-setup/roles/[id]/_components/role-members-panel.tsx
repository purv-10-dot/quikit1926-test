"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox } from "@quikit/ui";

interface User {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface MemberPayload {
  roleId: string;
  members: { id: string; firstName: string; lastName: string; email: string }[];
}

export function RoleMembersPanel({ roleId }: { roleId: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const usersQ = useQuery({
    queryKey: ["quiktrack", "org-users"],
    queryFn: async () => {
      const r = await fetch("/api/org/users");
      return ((await r.json()).data as User[]) ?? [];
    },
  });

  const membersQ = useQuery({
    queryKey: ["quiktrack", "role-members", roleId],
    queryFn: async () => {
      const r = await fetch(`/api/org/roles/${roleId}/members`);
      return (await r.json()).data as MemberPayload;
    },
  });

  useEffect(() => {
    if (membersQ.data) {
      setSelected(new Set(membersQ.data.members.map((m) => m.id)));
    }
  }, [membersQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/org/roles/${roleId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      return j.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "role-members", roleId] });
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] });
      if (data?.skippedUserIds?.length > 0) {
        alert(
          `${data.skippedUserIds.length} user(s) skipped — they don't have QuikTrack access yet.`,
        );
      }
    },
  });

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  if (usersQ.isLoading || membersQ.isLoading)
    return <p className="text-sm text-gray-500">Loading…</p>;
  const users = usersQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="max-h-72 overflow-y-auto border border-gray-200 rounded">
        {users.map((u) => (
          <label
            key={u.userId}
            className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0 text-sm"
          >
            <Checkbox checked={selected.has(u.userId)} onChange={() => toggle(u.userId)} />
            <span className="font-medium">{u.firstName} {u.lastName}</span>
            <span className="text-gray-500">{u.email}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save Members"}
        </Button>
      </div>
    </div>
  );
}
