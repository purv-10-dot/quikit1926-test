"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmDialog } from "@/lib/ui/confirm";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import {
  Button,
  Card,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Input,
  Textarea,
  Badge,
  EmptyState,
} from "@quikit/ui";

interface AppRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  _count: { permissions: number; navigations: number; members: number };
}

export default function RolesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const q = useQuery({
    queryKey: ["quiktrack", "org-roles"],
    queryFn: async () => {
      const r = await fetch("/api/org/roles");
      const j = await r.json();
      return (j.data as AppRole[]) ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/org/roles/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiktrack", "org-roles"] }),
  });

  const roles = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{roles.length} roles</p>
        <Button onClick={() => setCreateOpen(true)}>New Role</Button>
      </div>

      <Card className="overflow-hidden p-0">
        {q.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading…</div>
        ) : roles.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No roles yet" message="Create your first role." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-left">
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Grants</th>
                <th className="px-4 py-3">Nav</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/org-setup/roles/${r.id}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.isSystem && <Badge variant="invited">System</Badge>}
                      {r.isDefault && <Badge variant="manager">Default</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.description ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r._count.permissions}</td>
                  <td className="px-4 py-3 text-gray-600">{r._count.navigations}</td>
                  <td className="px-4 py-3 text-gray-600">{r._count.members}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/org-setup/roles/${r.id}`}>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </Link>
                    {!r.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: "Delete role",
                            message: `Delete role "${r.name}"?`,
                            confirmText: "Delete",
                            danger: true,
                          });
                          if (ok) del.mutate(r.id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {createOpen && <CreateRoleModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function CreateRoleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/org/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isDefault }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-roles"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open onOpenChange={(v) => !v && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>New Role</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="block text-sm">
            <span className="text-gray-700 mb-1 block">Description</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Use as default role for new invitees
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Creating…" : "Create Role"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
