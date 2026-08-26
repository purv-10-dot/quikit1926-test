"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/client/fetcher";
import { LoadingState } from "@/components/ui/page-states";
import { PERMISSION_TREE, ACTIONS, isValidPermissionPair } from "@/lib/api/permissionsRegistry";

interface Payload {
  roleId: string;
  isSystem: boolean;
  permissions: { resource: string; action: string }[];
}

/** Permission grant matrix for one role — module → resource × action checkboxes. */
export function RolePermissionMatrix({ roleId }: { roleId: string }) {
  const qc = useQueryClient();
  const [granted, setGranted] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["quikflow", "role-perms", roleId],
    queryFn: () => apiGet<Payload>(`/api/org/roles/${roleId}/permissions`),
  });

  useEffect(() => {
    if (q.data) {
      // Drop stale (resource, action) pairs no longer in the registry so
      // they don't ride along in the PUT and trip the server's validity check.
      setGranted(
        new Set(
          q.data.permissions
            .filter((p) => isValidPermissionPair(p.resource, p.action))
            .map((p) => `${p.resource}:${p.action}`),
        ),
      );
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      apiSend(`/api/org/roles/${roleId}/permissions`, "PUT", {
        permissions: Array.from(granted).map((k) => {
          const [resource, action] = k.split(":");
          return { resource, action };
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quikflow", "role-perms", roleId] }),
  });

  function toggle(key: string) {
    const next = new Set(granted);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setGranted(next);
  }

  if (q.isLoading) return <LoadingState label="Loading permissions…" />;

  return (
    <div className="space-y-4">
      {PERMISSION_TREE.map((mod) => (
        <div key={mod.key} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <div className="bg-[var(--color-bg-secondary)] px-3 py-2 text-sm font-medium">{mod.label}</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="px-3 py-2 text-left">Resource</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="w-16 px-2 py-2 text-center capitalize">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mod.leaves.map((leaf) => (
                <tr key={leaf.resource} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1.5">{leaf.label}</td>
                  {ACTIONS.map((a) => {
                    const valid = (leaf.actions as readonly string[]).includes(a);
                    const key = `${leaf.resource}:${a}`;
                    return (
                      <td key={a} className="px-2 py-1.5 text-center">
                        {valid ? (
                          <input
                            type="checkbox"
                            checked={granted.has(key)}
                            onChange={() => toggle(key)}
                            className="h-4 w-4 accent-current text-accent-600"
                          />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save Permissions"}
        </button>
      </div>
    </div>
  );
}
