"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox } from "@quikit/ui";
import {
  PERMISSION_TREE,
  isValidPermissionPair,
  walkLeaves,
  type PermissionLeaf,
} from "@/lib/api/permissionsRegistry";

interface Payload {
  roleId: string;
  isSystem: boolean;
  permissions: { resource: string; action: string }[];
}

export function RolePermissionMatrix({ roleId }: { roleId: string }) {
  const qc = useQueryClient();
  const [granted, setGranted] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["quiktrack", "role-perms", roleId],
    queryFn: async () => {
      const r = await fetch(`/api/org/roles/${roleId}/permissions`);
      const j = await r.json();
      return j.data as Payload;
    },
  });

  useEffect(() => {
    if (q.data) {
      // Drop stale (resource, action) pairs no longer in the registry so they
      // don't ride along in the PUT and trip the server's validity check.
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
    mutationFn: async () => {
      const r = await fetch(`/api/org/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: Array.from(granted).map((k) => {
            const [resource, action] = k.split(":");
            return { resource, action };
          }),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["quiktrack", "role-perms", roleId] }),
  });

  function toggle(key: string) {
    const next = new Set(granted);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setGranted(next);
  }

  if (q.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      {PERMISSION_TREE.map((mod) => {
        const leaves = collectLeaves(mod);
        return (
          <div key={mod.key} className="border border-gray-200 rounded">
            <div className="px-3 py-2 bg-gray-50 font-medium text-sm">
              {mod.label}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left px-3 py-2">Resource</th>
                  {(["view", "create", "update", "delete"] as const).map((a) => (
                    <th key={a} className="px-2 py-2 w-16 text-center capitalize">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaves.map((leaf) => (
                  <tr key={leaf.resource} className="border-t border-gray-100">
                    <td className="px-3 py-1.5">{leaf.label}</td>
                    {(["view", "create", "update", "delete"] as const).map((a) => {
                      const valid = (leaf.actions as readonly string[]).includes(a);
                      const key = `${leaf.resource}:${a}`;
                      return (
                        <td key={a} className="px-2 py-1.5 text-center">
                          {valid ? (
                            <Checkbox
                              checked={granted.has(key)}
                              onChange={() => toggle(key)}
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
        );
      })}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save Permissions"}
        </Button>
      </div>
    </div>
  );
}

function collectLeaves(mod: (typeof PERMISSION_TREE)[number]): PermissionLeaf[] {
  const out: PermissionLeaf[] = [];
  for (const leaf of walkLeaves()) {
    if (mod.leaves?.some((x) => x.resource === leaf.resource)) out.push(leaf);
    else if (leaf.resource.startsWith(`${mod.key}.`)) out.push(leaf);
  }
  return out;
}
