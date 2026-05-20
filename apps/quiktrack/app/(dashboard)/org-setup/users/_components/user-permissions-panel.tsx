"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Button,
  Checkbox,
} from "@quikit/ui";
import { PERMISSION_TREE, walkLeaves } from "@/lib/api/permissionsRegistry";

interface Effective {
  resource: string;
  action: string;
  source: "role" | "extra";
}

interface Payload {
  userId: string;
  roles: { id: string; name: string }[];
  roleGrants: { resource: string; action: string }[];
  extras: { resource: string; action: string }[];
  effective: Effective[];
}

export function UserPermissionsPanel({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const roleGrants = new Set<string>();

  const q = useQuery({
    queryKey: ["quiktrack", "user-perms", userId],
    queryFn: async () => {
      const r = await fetch(`/api/org/users/${userId}/permissions`);
      const j = await r.json();
      return j.data as Payload;
    },
  });

  useEffect(() => {
    if (q.data) {
      setExtras(new Set(q.data.extras.map((e) => `${e.resource}:${e.action}`)));
    }
  }, [q.data]);

  if (q.data) {
    for (const g of q.data.roleGrants) roleGrants.add(`${g.resource}:${g.action}`);
  }

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/org/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extras: Array.from(extras).map((k) => {
            const [resource, action] = k.split(":");
            return { resource, action };
          }),
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "user-perms", userId] });
      onClose();
    },
  });

  function toggle(key: string) {
    const next = new Set(extras);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExtras(next);
  }

  return (
    <Modal open onOpenChange={(v) => !v && onClose()}>
      <ModalContent className="max-w-3xl">
        <ModalHeader>
          <ModalTitle>User Permissions (Extras)</ModalTitle>
        </ModalHeader>
        <ModalBody className="max-h-[60vh] overflow-y-auto space-y-4">
          <p className="text-xs text-gray-500">
            Role grants are shown read-only. Tick boxes below to add per-user
            extras on top of the role.
          </p>
          {PERMISSION_TREE.map((mod) => (
            <div key={mod.key} className="border border-gray-200 rounded">
              <div className="px-3 py-2 bg-gray-50 font-medium text-sm">
                {mod.label}
              </div>
              <table className="w-full text-xs">
                <thead className="bg-white">
                  <tr className="text-gray-500">
                    <th className="text-left px-3 py-2">Resource</th>
                    {["view", "create", "update", "delete"].map((a) => (
                      <th key={a} className="px-2 py-2 w-16 text-center">
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leavesOf(mod).map((leaf) => (
                    <tr key={leaf.resource} className="border-t border-gray-100">
                      <td className="px-3 py-1.5">{leaf.label}</td>
                      {(["view", "create", "update", "delete"] as const).map((a) => {
                        const valid = (leaf.actions as readonly string[]).includes(a);
                        const key = `${leaf.resource}:${a}`;
                        const fromRole = roleGrants.has(key);
                        const checked = fromRole || extras.has(key);
                        return (
                          <td key={a} className="px-2 py-1.5 text-center">
                            {valid ? (
                              <Checkbox
                                checked={checked}
                                disabled={fromRole}
                                onChange={() => toggle(key)}
                                title={
                                  fromRole
                                    ? "Granted via role"
                                    : "Per-user extra"
                                }
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
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save Extras"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function leavesOf(mod: (typeof PERMISSION_TREE)[number]) {
  const out: { resource: string; label: string; actions: readonly string[] }[] = [];
  for (const leaf of walkLeaves()) out.push(leaf);
  return out.filter((l) => {
    // Only leaves under this top-level module — match by resource prefix
    // for dot-namespaced keys, else by membership in the module's leaves.
    if (mod.leaves?.some((x) => x.resource === l.resource)) return true;
    return l.resource.startsWith(`${mod.key}.`);
  });
}
