"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { LoadingState } from "@/components/ui/page-states";

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface MemberPayload {
  roleId: string;
  members: { id: string; firstName: string; lastName: string; email: string }[];
}

/** Member picker for one role — every org user with QuikFlow access. */
export function RoleMembersPanel({ roleId }: { roleId: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["quikflow", "org-users"],
    queryFn: () => apiGet<OrgUser[]>("/api/org/users"),
  });

  const membersQ = useQuery({
    queryKey: ["quikflow", "role-members", roleId],
    queryFn: () => apiGet<MemberPayload>(`/api/org/roles/${roleId}/members`),
  });

  useEffect(() => {
    if (membersQ.data) setSelected(new Set(membersQ.data.members.map((m) => m.id)));
  }, [membersQ.data]);

  const save = useMutation({
    mutationFn: () =>
      apiSend<{ skippedUserIds?: string[] }>(`/api/org/roles/${roleId}/members`, "PUT", {
        userIds: Array.from(selected),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["quikflow", "role-members", roleId] });
      qc.invalidateQueries({ queryKey: ["quikflow", "org-roles"] });
      setNotice(
        data?.skippedUserIds && data.skippedUserIds.length > 0
          ? `${data.skippedUserIds.length} user(s) skipped — they don't have QuikFlow access yet.`
          : "Members updated.",
      );
    },
    onError: (e: Error) => setNotice(e.message),
  });

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  if (usersQ.isLoading || membersQ.isLoading) return <LoadingState label="Loading members…" />;
  const users = usersQ.data ?? [];

  return (
    <div className="space-y-3">
      <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)]">
        {users.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No users have QuikFlow access yet.</p>
        ) : (
          users.map((u) => (
            <label
              key={u.userId}
              className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2 text-sm last:border-b-0"
            >
              <input
                type="checkbox"
                checked={selected.has(u.userId)}
                onChange={() => toggle(u.userId)}
                className="h-4 w-4 accent-current text-accent-600"
              />
              <span className="font-medium">
                {u.firstName} {u.lastName}
              </span>
              <span className="text-gray-500">{u.email}</span>
            </label>
          ))
        )}
      </div>
      {notice ? <p className="text-sm text-gray-600">{notice}</p> : null}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save Members"}
        </button>
      </div>
    </div>
  );
}
