"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
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
  Select,
  ToggleSwitch,
  EmptyState,
} from "@quikit/ui";
import { UserPermissionsPanel } from "./_components/user-permissions-panel";

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  appRoleId: string | null;
  appRoleName: string | null;
}

interface AppRole {
  id: string;
  name: string;
  isSystem: boolean;
  isDefault: boolean;
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [permUserId, setPermUserId] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["quiktrack", "org-users"],
    queryFn: async () => {
      const r = await fetch("/api/org/users");
      const j = await r.json();
      return (j.data as OrgUser[]) ?? [];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "org-roles"],
    queryFn: async () => {
      const r = await fetch("/api/org/roles");
      const j = await r.json();
      return (j.data as AppRole[]) ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async (vars: { userId: string; roleId: string | null }) => {
      const r = await fetch(`/api/org/users/${vars.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: vars.roleId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] }),
  });

  const setStatus = useMutation({
    mutationFn: async (vars: { userId: string; status: "active" | "inactive" }) => {
      const r = await fetch(`/api/org/users/${vars.userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: vars.status }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] }),
  });

  const users = usersQ.data ?? [];
  const roles = rolesQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{users.length} members</p>
        <Button onClick={() => setAddOpen(true)}>Add User</Button>
      </div>

      <Card className="overflow-hidden p-0">
        {usersQ.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading…</div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users yet" message="Invite your first teammate." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-left">
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={u.appRoleId ?? ""}
                      onChange={(e) =>
                        setRole.mutate({
                          userId: u.userId,
                          roleId: e.target.value === "" ? null : e.target.value,
                        })
                      }
                      options={[
                        { value: "", label: "— None —" },
                        ...roles.map((r) => ({
                          value: r.id,
                          label: r.isSystem ? `${r.name} (system)` : r.name,
                        })),
                      ]}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <ToggleSwitch
                      checked={u.status === "active"}
                      onChange={(v) =>
                        setStatus.mutate({
                          userId: u.userId,
                          status: v ? "active" : "inactive",
                        })
                      }
                      label={u.status === "active" ? "Active" : "Inactive"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPermUserId(u.userId)}
                    >
                      Permissions
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {addOpen && <AddUserModal onClose={() => setAddOpen(false)} />}
      {permUserId && (
        <UserPermissionsPanel
          userId={permUserId}
          onClose={() => setPermUserId(null)}
        />
      )}
    </div>
  );
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/org/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open onOpenChange={(v) => !v && onClose()}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Add User</ModalTitle>
        </ModalHeader>
        <ModalBody className="space-y-3">
          <Input
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Temporary password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Adding…" : "Add User"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
